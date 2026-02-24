import { NextResponse } from 'next/server';

import { getEnvDiagnostics } from '@/features/security-showcase/lib/env-diagnostics';

/**
 * Internal env diagnostics endpoint.
 * This route intentionally avoids importing env schema to help diagnose broken deployments.
 */
export async function GET() {
  const diagnostics = getEnvDiagnostics();

  if (!diagnostics.ok) {
    return NextResponse.json(diagnostics, { status: 503 });
  }

  return NextResponse.json(diagnostics, { status: 200 });
}
