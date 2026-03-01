import { headers } from 'next/headers';

import { AUTH } from '@/core/contracts';
import type { IdentityProvider } from '@/core/contracts/identity';
import type { TenantResolver } from '@/core/contracts/tenancy';
import { appContainer } from '@/core/runtime/bootstrap';

import { AdminOnlyExample } from '@/features/security-showcase/components/AdminOnlyExample';
import { EnvDiagnosticsExample } from '@/features/security-showcase/components/EnvDiagnosticsExample';
import { ExternalFetchExample } from '@/features/security-showcase/components/ExternalFetchExample';
import { InternalApiTestExample } from '@/features/security-showcase/components/InternalApiTestExample';
import { ProfileExample } from '@/features/security-showcase/components/ProfileExample';
import { SettingsFormExample } from '@/features/security-showcase/components/SettingsFormExample';

import {
  createSecurityContext,
  type SecurityContextDependencies,
} from '@/security/core/security-context';

export default async function SecurityShowcasePage() {
  const headerList = await headers();
  const cookieHeader = headerList.get('cookie') ?? '';
  const hasClerkSessionCookie =
    cookieHeader.includes('__session=') ||
    cookieHeader.includes('__client_uat=');

  const requestContainer = appContainer.createChild();
  const securityContextDependencies: SecurityContextDependencies = {
    identityProvider: requestContainer.resolve<IdentityProvider>(
      AUTH.IDENTITY_PROVIDER,
    ),
    tenantResolver: requestContainer.resolve<TenantResolver>(
      AUTH.TENANT_RESOLVER,
    ),
  };

  let context: Awaited<ReturnType<typeof createSecurityContext>>;
  let contextError: string | null = null;

  if (!hasClerkSessionCookie) {
    context = {
      user: undefined,
      ip: 'unknown',
      userAgent: undefined,
      correlationId: crypto.randomUUID(),
      runtime: 'node',
      environment: 'development',
      requestId: crypto.randomUUID(),
    };
    contextError = 'No active Clerk session; using guest context.';
  } else {
    try {
      context = await Promise.race([
        createSecurityContext(securityContextDependencies),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error('Security context resolution timeout (350ms)'));
          }, 350);
        }),
      ]);
    } catch (error) {
      contextError = error instanceof Error ? error.message : 'Unknown error';
      context = {
        user: undefined,
        ip: 'unknown',
        userAgent: undefined,
        correlationId: crypto.randomUUID(),
        runtime: 'node',
        environment: 'development',
        requestId: crypto.randomUUID(),
      };
    }
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <header className="mb-12">
        <h1 className="mb-4 text-4xl font-bold tracking-tight">
          Security Architecture Showcase
        </h1>
        <p className="text-lg text-gray-600">
          A living demonstration of the enterprise-grade security layers
          protecting this application.
        </p>
      </header>

      <div className="grid gap-8">
        {/* 1. Security Context */}
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <span className="rounded bg-blue-100 px-2 py-0.5 text-sm text-blue-700">
              Context
            </span>
            Unified Security Context
          </h2>
          <div className="rounded-lg border bg-gray-50 p-4">
            <p className="mb-4 text-sm text-gray-600">
              Metadata retrieved via <code>getSecurityContext()</code> on the
              server.
            </p>
            {contextError && (
              <p className="mb-3 rounded border border-yellow-300 bg-yellow-50 p-2 text-xs text-yellow-800">
                Security context degraded mode: {contextError}
              </p>
            )}
            <pre className="overflow-auto rounded border bg-white p-3 font-mono text-xs">
              {JSON.stringify(context, null, 2)}
            </pre>
          </div>
        </section>

        {/* 2. RBAC */}
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <span className="rounded bg-green-100 px-2 py-0.5 text-sm text-green-700">
              RBAC
            </span>
            Role-Based Access Control
          </h2>
          <AdminOnlyExample context={context} />
        </section>

        {/* 3. Sanitization */}
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <span className="rounded bg-purple-100 px-2 py-0.5 text-sm text-purple-700">
              Sanitization
            </span>
            Data Leakage Prevention
          </h2>
          <ProfileExample context={context} />
        </section>

        {/* 4. Secure Actions */}
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <span className="rounded bg-orange-100 px-2 py-0.5 text-sm text-orange-700">
              Actions
            </span>
            Hardened Mutations
          </h2>
          <SettingsFormExample />
        </section>

        {/* 5. SSRF */}
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <span className="rounded bg-red-100 px-2 py-0.5 text-sm text-red-700">
              Network
            </span>
            SSRF Protection
          </h2>
          <ExternalFetchExample />
        </section>

        {/* 6. Internal API */}
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <span className="rounded bg-gray-100 px-2 py-0.5 text-sm text-gray-700">
              Gateway
            </span>
            Internal API Guard
          </h2>
          <InternalApiTestExample />
          <EnvDiagnosticsExample />
        </section>

        <footer className="mt-12 border-t pt-8 text-center text-sm text-gray-500">
          <p>Enterprise Security Architecture &bull; Built with Next.js 16</p>
        </footer>
      </div>
    </div>
  );
}
