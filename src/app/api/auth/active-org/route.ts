import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { z } from 'zod';

import { env } from '@/core/env';

const bodySchema = z.object({
  organizationId: z.uuid(),
});

export async function POST(request: Request): Promise<Response> {
  await connection();

  if (env.AUTH_PROVIDER !== 'authjs') {
    return Response.json({ error: 'Not available' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid organization ID' }, { status: 422 });
  }

  const cookieStore = await cookies();
  cookieStore.set(env.TENANT_CONTEXT_COOKIE, parsed.data.organizationId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });

  return Response.json({ success: true });
}
