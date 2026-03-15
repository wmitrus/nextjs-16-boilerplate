import { Ratelimit } from '@upstash/ratelimit';
import type { Duration } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { env } from '@/core/env';
import { resolveServerLogger } from '@/core/logger/di';

import { getIP } from '@/shared/lib/network/get-ip';
import { localRateLimit } from '@/shared/lib/rate-limit/rate-limit-local';

const BODY_SIZE_LIMIT = 8 * 1024;
const LOG_INGEST_RATE_LIMIT = 60;
const LOG_INGEST_RATE_WINDOW = '60 s' as Duration;
const MAX_STRING_LENGTH = 2048;
const MAX_CONTEXT_DEPTH = 3;

const redis =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
      })
    : undefined;

const logIngestRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(
        LOG_INGEST_RATE_LIMIT,
        LOG_INGEST_RATE_WINDOW,
      ),
      analytics: false,
      prefix: 'ratelimit:log-ingest',
    })
  : undefined;

const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
] as const;

const clientLogSchema = z.object({
  level: z.enum(LOG_LEVELS),
  message: z.string().max(500),
  context: z.record(z.string(), z.unknown()).default({}),
  source: z.enum(['browser', 'edge']),
});

const SECRET_KEY_PATTERN =
  /^(password|secret|token|authorization|cookie|key|apikey|api_key|auth|credential)$/i;

const RESERVED_TOP_LEVEL_FIELDS = new Set([
  'type',
  'category',
  'module',
  'source',
]);

function sanitizeContext(
  obj: Record<string, unknown>,
  depth = 0,
  trusted = false,
): Record<string, unknown> {
  if (depth >= MAX_CONTEXT_DEPTH) return {};

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (depth === 0 && key === 'source') continue;
    if (depth === 0 && !trusted && RESERVED_TOP_LEVEL_FIELDS.has(key)) continue;
    if (SECRET_KEY_PATTERN.test(key)) continue;

    if (typeof value === 'string') {
      result[key] =
        value.length > MAX_STRING_LENGTH
          ? `${value.slice(0, MAX_STRING_LENGTH)}[truncated]`
          : value;
    } else if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      result[key] = value;
    } else if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      result[key] = sanitizeContext(
        value as Record<string, unknown>,
        depth + 1,
        trusted,
      );
    } else if (Array.isArray(value)) {
      result[key] = value
        .slice(0, 10)
        .map((v) =>
          typeof v === 'string' && v.length > MAX_STRING_LENGTH
            ? `${v.slice(0, MAX_STRING_LENGTH)}[truncated]`
            : v,
        )
        .filter(
          (v) =>
            typeof v === 'string' ||
            typeof v === 'number' ||
            typeof v === 'boolean' ||
            v === null,
        );
    }
  }

  return result;
}

async function checkIngestRateLimit(ip: string): Promise<{ success: boolean }> {
  if (logIngestRateLimit) {
    try {
      const result = await logIngestRateLimit.limit(ip);
      return { success: result.success };
    } catch {
      // Fall through to local on Upstash failure
    }
  }
  const result = await localRateLimit(ip, LOG_INGEST_RATE_LIMIT, 60 * 1000);
  return { success: result.success };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ingestSecret = request.headers.get('x-log-ingest-secret');
  const isEdge =
    !!env.LOG_INGEST_SECRET && ingestSecret === env.LOG_INGEST_SECRET;

  const ip = await getIP(request.headers);

  if (!isEdge) {
    const rateLimitResult = await checkIngestRateLimit(ip);
    if (!rateLimitResult.success) {
      return new NextResponse(null, { status: 429 });
    }
  }

  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > BODY_SIZE_LIMIT) {
    return new NextResponse(null, { status: 413 });
  }

  let body: string;
  try {
    body = await request.text();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  if (body.length > BODY_SIZE_LIMIT) {
    return new NextResponse(null, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const validation = clientLogSchema.safeParse(parsed);
  if (!validation.success) {
    return new NextResponse(null, { status: 400 });
  }

  const sanitizedContext = sanitizeContext(validation.data.context, 0, isEdge);

  let childBindings: Record<string, unknown>;
  let logContext: Record<string, unknown>;

  if (isEdge) {
    const { type, category, module: mod, ...rest } = sanitizedContext;
    childBindings = {
      type: (type as string | undefined) ?? 'edge-ingest',
      category: (category as string | undefined) ?? 'edge',
      module: (mod as string | undefined) ?? 'log-ingest-route',
      source: 'edge',
    };
    logContext = rest;
  } else {
    childBindings = {
      type: 'browser-ingest',
      category: 'browser',
      module: 'log-ingest-route',
      source: 'browser',
    };
    logContext = sanitizedContext;
  }

  const logger = resolveServerLogger().child(childBindings);
  const level = validation.data.level;
  logger[level]({ ...logContext, ip }, validation.data.message);

  return new NextResponse(null, { status: 204 });
}
