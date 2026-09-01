import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runAuthjsReadOnlySmoke } from './authjs-smoke';

const immutableUrl = 'https://project-immutable-abc123-team.vercel.app';
const BYPASS_SECRET = 'sentinel-bypass-secret';

function htmlResponse(
  body = '<!doctype html><html><body>Sign In</body></html>',
  init: { contentType?: string | null; status?: number } = {},
): Response {
  const headers: Record<string, string> = {};
  const contentType =
    init.contentType === undefined
      ? 'text/html; charset=utf-8'
      : init.contentType;
  if (contentType !== null) headers['content-type'] = contentType;
  return new Response(body, { headers, status: init.status ?? 200 });
}

function jsonResponse(
  body = '{}',
  init: { contentType?: string | null; status?: number } = {},
): Response {
  const headers: Record<string, string> = {};
  const contentType =
    init.contentType === undefined ? 'application/json' : init.contentType;
  if (contentType !== null) headers['content-type'] = contentType;
  return new Response(body, { headers, status: init.status ?? 200 });
}

/** A fetch double that returns sign-in then session, in call order. */
function sequenceFetch(...responses: Array<Response | Error>): typeof fetch {
  const queue = [...responses];
  return vi.fn(async () => {
    const next = queue.shift();
    if (next === undefined) throw new Error('unexpected extra fetch call');
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', BYPASS_SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('runAuthjsReadOnlySmoke', () => {
  it('passes when both read-only surfaces answer as expected', async () => {
    const fetchMock = sequenceFetch(htmlResponse(), jsonResponse('{}'));
    const result = await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
    expect(result).toEqual({
      evidence: { provider: 'authjs', session: 'PASS', signIn: 'PASS' },
      status: 'OK',
    });
    expect(
      (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls,
    ).toHaveLength(2);
  });

  it('anonymous empty-object session needs no fixture', async () => {
    const fetchMock = sequenceFetch(htmlResponse(), jsonResponse('{}'));
    const result = await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
    expect(result.status).toBe('OK');
  });

  it('issues exactly the two allowed GETs, with only the two allowed headers', async () => {
    const fetchMock = sequenceFetch(htmlResponse(), jsonResponse('{}'));
    await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
    const calls = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock
      .calls as Array<[URL, RequestInit]>;

    const [signInUrl, signInInit] = calls[0];
    expect(signInUrl.toString()).toBe(`${immutableUrl}/auth/signin`);
    expect(signInInit.method).toBe('GET');
    expect(signInInit.cache).toBe('no-store');
    expect(signInInit.redirect).toBe('error');
    expect(signInInit.signal).toBeInstanceOf(AbortSignal);
    expect(signInInit.credentials).toBeUndefined();
    const signInHeaders = signInInit.headers as Record<string, string>;
    expect(Object.keys(signInHeaders).sort()).toEqual([
      'accept',
      'x-vercel-protection-bypass',
    ]);
    expect(signInHeaders.accept).toBe('text/html');
    expect(signInHeaders['x-vercel-protection-bypass']).toBe(BYPASS_SECRET);

    const [sessionUrl, sessionInit] = calls[1];
    expect(sessionUrl.toString()).toBe(`${immutableUrl}/api/auth/session`);
    expect(sessionInit.method).toBe('GET');
    expect(sessionInit.cache).toBe('no-store');
    expect(sessionInit.redirect).toBe('error');
    expect(sessionInit.signal).toBeInstanceOf(AbortSignal);
    expect(sessionInit.credentials).toBeUndefined();
    const sessionHeaders = sessionInit.headers as Record<string, string>;
    expect(Object.keys(sessionHeaders).sort()).toEqual([
      'accept',
      'x-vercel-protection-bypass',
    ]);
    expect(sessionHeaders.accept).toBe('application/json');
    expect(sessionHeaders['x-vercel-protection-bypass']).toBe(BYPASS_SECRET);
  });

  it('never sends the x-vercel-set-bypass-cookie header, cookies, an internal key, or credentials', async () => {
    const fetchMock = sequenceFetch(htmlResponse(), jsonResponse('{}'));
    await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
    const calls = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock
      .calls as Array<[URL, RequestInit]>;
    for (const [, init] of calls) {
      const headers = init.headers as Record<string, string>;
      const keys = Object.keys(headers).map((key) => key.toLowerCase());
      expect(keys).not.toContain('x-vercel-set-bypass-cookie');
      expect(keys).not.toContain('cookie');
      expect(keys).not.toContain('x-internal-key');
      expect(keys).not.toContain('authorization');
      expect(init.credentials).not.toBe('include');
    }
  });

  it('fails closed before any fetch when VERCEL_AUTOMATION_BYPASS_SECRET is missing', async () => {
    vi.unstubAllEnvs();
    const fetchMock = sequenceFetch(htmlResponse(), jsonResponse('{}'));
    const result = await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
    expect(result.status).toBe('ERROR');
    expect(
      (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls,
    ).toHaveLength(0);
  });

  it('never returns the bypass secret in its evidence or error', async () => {
    const fetchMock = sequenceFetch(
      htmlResponse('', { status: 500 }),
      jsonResponse('{}'),
    );
    const result = await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
    expect(JSON.stringify(result)).not.toContain(BYPASS_SECRET);
  });

  it('sign-in non-200 -> ERROR, session never requested', async () => {
    const fetchMock = sequenceFetch(htmlResponse('nope', { status: 503 }));
    const result = await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
    expect(result.status).toBe('ERROR');
    expect(
      (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls,
    ).toHaveLength(1);
  });

  it('sign-in wrong content-type -> ERROR', async () => {
    const fetchMock = sequenceFetch(
      htmlResponse('{}', { contentType: 'application/json' }),
    );
    const result = await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
    expect(result.status).toBe('ERROR');
  });

  it('sign-in missing content-type -> ERROR', async () => {
    const fetchMock = sequenceFetch(
      htmlResponse('body', { contentType: null }),
    );
    const result = await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
    expect(result.status).toBe('ERROR');
  });

  it('sign-in empty body -> ERROR', async () => {
    const fetchMock = sequenceFetch(htmlResponse(''));
    const result = await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
    expect(result.status).toBe('ERROR');
  });

  it('sign-in oversized body -> ERROR, no session request', async () => {
    const fetchMock = sequenceFetch(htmlResponse('x'.repeat(512 * 1024 + 1)));
    const result = await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
    expect(result.status).toBe('ERROR');
    expect(
      (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls,
    ).toHaveLength(1);
  });

  it('sign-in fetch rejection (redirect/network) -> ERROR', async () => {
    const fetchMock = sequenceFetch(new Error('redirect not allowed'));
    const result = await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
    expect(result.status).toBe('ERROR');
  });

  it('session non-200 -> ERROR', async () => {
    const fetchMock = sequenceFetch(
      htmlResponse(),
      jsonResponse('{}', { status: 500 }),
    );
    const result = await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
    expect(result.status).toBe('ERROR');
  });

  it('session wrong content-type -> ERROR', async () => {
    const fetchMock = sequenceFetch(
      htmlResponse(),
      jsonResponse('{}', { contentType: 'text/html' }),
    );
    const result = await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
    expect(result.status).toBe('ERROR');
  });

  it('session malformed JSON -> ERROR', async () => {
    const fetchMock = sequenceFetch(htmlResponse(), jsonResponse('{ not json'));
    const result = await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
    expect(result.status).toBe('ERROR');
  });

  it.each([
    ['array', '[]'],
    ['null', 'null'],
    ['string', '"anonymous"'],
    ['number', '0'],
  ])('session non-object top-level (%s) -> ERROR', async (_label, body) => {
    const fetchMock = sequenceFetch(htmlResponse(), jsonResponse(body));
    const result = await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
    expect(result.status).toBe('ERROR');
  });

  it('session oversized body -> ERROR', async () => {
    const fetchMock = sequenceFetch(
      htmlResponse(),
      jsonResponse('x'.repeat(64 * 1024 + 1)),
    );
    const result = await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
    expect(result.status).toBe('ERROR');
  });

  it('session fetch rejection (timeout/network) -> ERROR', async () => {
    const fetchMock = sequenceFetch(
      htmlResponse(),
      new Error('The operation was aborted due to timeout'),
    );
    const result = await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
    expect(result.status).toBe('ERROR');
  });

  describe('Content-Type media type is matched exactly (not substring)', () => {
    it.each([
      'text/html',
      'text/html; charset=utf-8',
      'TEXT/HTML; charset=UTF-8',
    ])('sign-in accepts %s', async (contentType) => {
      const fetchMock = sequenceFetch(
        htmlResponse('<html></html>', { contentType }),
        jsonResponse('{}'),
      );
      const result = await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
      expect(result.status).toBe('OK');
    });

    it.each([
      'text/html-bogus',
      'text/htmlx',
      'application/xhtml+xml',
      'text/plain',
      'text/plain; charset=utf-8',
    ])('sign-in rejects lookalike %s -> ERROR', async (contentType) => {
      const fetchMock = sequenceFetch(
        htmlResponse('<html></html>', { contentType }),
      );
      const result = await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
      expect(result.status).toBe('ERROR');
    });

    it.each([
      'application/json',
      'application/json; charset=utf-8',
      'APPLICATION/JSON; charset=UTF-8',
    ])('session accepts %s', async (contentType) => {
      const fetchMock = sequenceFetch(
        htmlResponse(),
        jsonResponse('{}', { contentType }),
      );
      const result = await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
      expect(result.status).toBe('OK');
    });

    it.each([
      'application/jsonp',
      'application/json-patch+json',
      'application/json5',
      'text/json',
      'application/ld+json',
    ])('session rejects lookalike %s -> ERROR', async (contentType) => {
      const fetchMock = sequenceFetch(
        htmlResponse(),
        jsonResponse('{}', { contentType }),
      );
      const result = await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
      expect(result.status).toBe('ERROR');
    });
  });

  describe('rejected responses have their body cancelled best-effort', () => {
    function trackedResponse(
      bodyText: string,
      init: { contentType?: string | null; status?: number } = {},
    ): { response: Response; wasCancelled: () => boolean } {
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        cancel() {
          cancelled = true;
        },
        start(controller) {
          controller.enqueue(new TextEncoder().encode(bodyText));
          controller.close();
        },
      });
      const headers: Record<string, string> = {};
      const contentType =
        init.contentType === undefined ? 'text/html' : init.contentType;
      if (contentType !== null) headers['content-type'] = contentType;
      return {
        response: new Response(stream, { headers, status: init.status ?? 200 }),
        wasCancelled: () => cancelled,
      };
    }

    it('cancels the sign-in body on a non-200 status', async () => {
      const tracked = trackedResponse('unavailable', { status: 503 });
      const fetchMock = sequenceFetch(tracked.response);
      const result = await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
      expect(result.status).toBe('ERROR');
      expect(tracked.wasCancelled()).toBe(true);
    });

    it('cancels the sign-in body on an invalid Content-Type', async () => {
      const tracked = trackedResponse('{}', {
        contentType: 'application/json',
      });
      const fetchMock = sequenceFetch(tracked.response);
      const result = await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
      expect(result.status).toBe('ERROR');
      expect(tracked.wasCancelled()).toBe(true);
    });

    it('cancels the session body on a non-200 status', async () => {
      const tracked = trackedResponse('{}', {
        contentType: 'application/json',
        status: 500,
      });
      const fetchMock = sequenceFetch(htmlResponse(), tracked.response);
      const result = await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
      expect(result.status).toBe('ERROR');
      expect(tracked.wasCancelled()).toBe(true);
    });

    it('cancels the session body on an invalid Content-Type', async () => {
      const tracked = trackedResponse('{}', { contentType: 'text/html' });
      const fetchMock = sequenceFetch(htmlResponse(), tracked.response);
      const result = await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
      expect(result.status).toBe('ERROR');
      expect(tracked.wasCancelled()).toBe(true);
    });

    it('a cancel failure does not turn a rejected response into valid evidence', async () => {
      const stream = new ReadableStream<Uint8Array>({
        cancel() {
          throw new Error('cancel failed');
        },
        start(controller) {
          controller.enqueue(new TextEncoder().encode('body'));
          controller.close();
        },
      });
      const fetchMock = sequenceFetch(
        new Response(stream, {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      );
      const result = await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
      expect(result.status).toBe('ERROR');
    });

    it('a fully consumed successful body is not cancelled', async () => {
      const signIn = trackedResponse('<html>ok</html>', {
        contentType: 'text/html',
      });
      const session = trackedResponse('{}', {
        contentType: 'application/json',
      });
      const fetchMock = sequenceFetch(signIn.response, session.response);
      const result = await runAuthjsReadOnlySmoke(immutableUrl, fetchMock);
      expect(result.status).toBe('OK');
      expect(signIn.wasCancelled()).toBe(false);
      expect(session.wasCancelled()).toBe(false);
    });
  });
});
