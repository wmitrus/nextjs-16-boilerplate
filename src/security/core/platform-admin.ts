import { env } from '@/core/env';

/**
 * Platform-level admin access check.
 *
 * Two-layer approach:
 *
 * Layer 1 — ADMIN_USER_EMAILS env var (bootstrap / emergency access)
 *   A comma-separated list of emails granted platform admin access regardless of
 *   tenant DB role. Used for initial deployment bootstrap and Vercel environment config.
 *   Bypasses ABAC but does NOT bypass authentication or provisioning.
 *   The user must still be authenticated and fully provisioned (status ALLOWED).
 *
 *   Remove or scope this env var once DB-based admin roles are properly assigned.
 *
 * Layer 2 — ABAC SECURITY_MANAGE_POLICIES (normal operation)
 *   Users with the `owner` tenant DB role and the SECURITY_MANAGE_POLICIES policy
 *   pass ABAC and are granted platform admin. This is the persistent, DB-governed path.
 *
 * Industry precedent: Grafana (GF_SECURITY_ADMIN_USER), Ghost, Gitea, Strapi, Directus
 * all use env-based bootstrap admin as the standard pattern for initial deployment.
 *
 * Vercel configuration:
 *   Add ADMIN_USER_EMAILS to Vercel → Settings → Environment Variables
 *   Set Environment: Production only (never All Environments)
 *   Value: comma-separated emails, e.g. "admin@company.com,ops@company.com"
 */
export function isEnvBasedPlatformAdmin(email: string | undefined): boolean {
  if (!email) return false;

  const rawEmails = env.ADMIN_USER_EMAILS;
  if (!rawEmails) return false;

  const adminEmails = rawEmails
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return adminEmails.includes(email.toLowerCase());
}
