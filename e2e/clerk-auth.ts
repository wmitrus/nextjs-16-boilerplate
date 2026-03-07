import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import type { Page } from '@playwright/test';

export type ClerkE2EIdentity =
  | 'singleNewUser'
  | 'singleProvisionedUser'
  | 'personalNewUser'
  | 'orgProviderOwner'
  | 'orgProviderMember'
  | 'orgDbSeededMember'
  | 'linkingBlockedUnverified';

export type ClerkE2EOrganization = 'providerOwner' | 'providerMember';

interface EnvAliasPair {
  readonly username: readonly string[];
  readonly password: readonly string[];
}

const IDENTITY_ENV: Record<ClerkE2EIdentity, EnvAliasPair> = {
  singleNewUser: {
    username: [
      'E2E_CLERK_SINGLE_NEW_USER_USERNAME',
      'E2E_CLERK_UNPROVISIONED_USER_USERNAME',
    ],
    password: [
      'E2E_CLERK_SINGLE_NEW_USER_PASSWORD',
      'E2E_CLERK_UNPROVISIONED_USER_PASSWORD',
    ],
  },
  singleProvisionedUser: {
    username: [
      'E2E_CLERK_SINGLE_PROVISIONED_USER_USERNAME',
      'E2E_CLERK_USER_USERNAME',
    ],
    password: [
      'E2E_CLERK_SINGLE_PROVISIONED_USER_PASSWORD',
      'E2E_CLERK_USER_PASSWORD',
    ],
  },
  personalNewUser: {
    username: ['E2E_CLERK_PERSONAL_NEW_USER_USERNAME'],
    password: ['E2E_CLERK_PERSONAL_NEW_USER_PASSWORD'],
  },
  orgProviderOwner: {
    username: [
      'E2E_CLERK_ORG_PROVIDER_OWNER_USERNAME',
      'E2E_CLERK_ORG_OWNER_USERNAME',
    ],
    password: [
      'E2E_CLERK_ORG_PROVIDER_OWNER_PASSWORD',
      'E2E_CLERK_ORG_OWNER_PASSWORD',
    ],
  },
  orgProviderMember: {
    username: [
      'E2E_CLERK_ORG_PROVIDER_MEMBER_USERNAME',
      'E2E_CLERK_ORG_MEMBER_USERNAME',
    ],
    password: [
      'E2E_CLERK_ORG_PROVIDER_MEMBER_PASSWORD',
      'E2E_CLERK_ORG_MEMBER_PASSWORD',
    ],
  },
  orgDbSeededMember: {
    username: ['E2E_CLERK_ORG_DB_SEEDED_MEMBER_USERNAME'],
    password: ['E2E_CLERK_ORG_DB_SEEDED_MEMBER_PASSWORD'],
  },
  linkingBlockedUnverified: {
    username: [
      'E2E_CLERK_LINK_BLOCKED_UNVERIFIED_USERNAME',
      'E2E_CLERK_UNVERIFIED_EMAIL_USER_USERNAME',
    ],
    password: [
      'E2E_CLERK_LINK_BLOCKED_UNVERIFIED_PASSWORD',
      'E2E_CLERK_UNVERIFIED_EMAIL_USER_PASSWORD',
    ],
  },
};

const ORGANIZATION_ENV: Record<ClerkE2EOrganization, string> = {
  providerOwner: 'E2E_CLERK_ORG_PROVIDER_OWNER_SLUG',
  providerMember: 'E2E_CLERK_ORG_PROVIDER_MEMBER_SLUG',
};

function required(value: string | undefined, variableName: string): string {
  if (!value) {
    throw new Error(
      `Missing ${variableName}. Set it in your environment for Clerk-authenticated E2E tests.`,
    );
  }

  return value;
}

function firstDefined(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function requiredFromAliases(names: readonly string[]): string {
  const value = firstDefined(names);
  if (!value) {
    throw new Error(
      `Missing one of: ${names.join(', ')}. Set it in your environment for Clerk-authenticated E2E tests.`,
    );
  }

  return value;
}

export function getClerkE2ECredentials(identity: ClerkE2EIdentity): {
  username: string;
  password: string;
} {
  const envConfig = IDENTITY_ENV[identity];

  return {
    username: requiredFromAliases(envConfig.username),
    password: requiredFromAliases(envConfig.password),
  };
}

export function hasClerkIdentityE2ECredentials(
  identity: ClerkE2EIdentity,
): boolean {
  const credentials = IDENTITY_ENV[identity];
  return Boolean(
    firstDefined(credentials.username) && firstDefined(credentials.password),
  );
}

export function hasClerkE2ECredentials(): boolean {
  return hasClerkIdentityE2ECredentials('singleProvisionedUser');
}

export async function signInWithCredentials(
  page: Page,
  credentials: { username: string; password: string },
): Promise<void> {
  await setupClerkTestingToken({ page });

  await page.goto('/');

  if (credentials.username.includes('@')) {
    await clerk.signIn({
      page,
      emailAddress: credentials.username,
    });
  } else {
    await clerk.signIn({
      page,
      signInParams: {
        strategy: 'password',
        identifier: credentials.username,
        password: credentials.password,
      },
    });
  }

  await clerk.loaded({ page });
  await page.waitForFunction(
    () =>
      Boolean(
        window.Clerk?.loaded && window.Clerk?.session && window.Clerk?.user,
      ),
    { timeout: 10_000 },
  );

  const sessionToken = await page.evaluate(async () => {
    const token = await window.Clerk?.session?.getToken();
    return typeof token === 'string' && token.length > 0 ? token : null;
  });

  if (!sessionToken) {
    throw new Error('Clerk E2E sign-in did not produce a session token.');
  }

  const baseUrl =
    process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3000';

  await page.context().addCookies([
    {
      name: '__session',
      value: sessionToken,
      url: baseUrl,
      sameSite: 'Lax',
    },
    {
      name: '__client_uat',
      value: String(Math.floor(Date.now() / 1000)),
      url: baseUrl,
      sameSite: 'Lax',
    },
  ]);

  await page.context().setExtraHTTPHeaders({
    Authorization: `Bearer ${sessionToken}`,
  });

  await page.goto('/', { waitUntil: 'networkidle' });
}

export async function signInClerkIdentityE2E(
  page: Page,
  identity: ClerkE2EIdentity,
): Promise<void> {
  await signInWithCredentials(page, getClerkE2ECredentials(identity));
}

export async function signInE2E(page: Page): Promise<void> {
  await signInClerkIdentityE2E(page, 'singleProvisionedUser');
}

export function hasClerkUnprovisionedE2ECredentials(): boolean {
  return hasClerkIdentityE2ECredentials('singleNewUser');
}

export async function signInUnprovisionedE2E(page: Page): Promise<void> {
  await signInClerkIdentityE2E(page, 'singleNewUser');
}

export async function withClerkTestingToken(page: Page): Promise<void> {
  await setupClerkTestingToken({ page });
}

export function hasClerkSingleNewUserE2ECredentials(): boolean {
  return hasClerkIdentityE2ECredentials('singleNewUser');
}

export async function signInSingleNewUserE2E(page: Page): Promise<void> {
  await signInClerkIdentityE2E(page, 'singleNewUser');
}

export function hasClerkSingleProvisionedUserE2ECredentials(): boolean {
  return hasClerkIdentityE2ECredentials('singleProvisionedUser');
}

export async function signInSingleProvisionedUserE2E(
  page: Page,
): Promise<void> {
  await signInClerkIdentityE2E(page, 'singleProvisionedUser');
}

export function hasClerkPersonalNewUserE2ECredentials(): boolean {
  return hasClerkIdentityE2ECredentials('personalNewUser');
}

export async function signInClerkPersonalNewUserE2E(page: Page): Promise<void> {
  await signInClerkIdentityE2E(page, 'personalNewUser');
}

export function hasClerkOrgOwnerE2ECredentials(): boolean {
  return hasClerkIdentityE2ECredentials('orgProviderOwner');
}

export async function signInClerkOrgOwnerE2E(page: Page): Promise<void> {
  await signInClerkIdentityE2E(page, 'orgProviderOwner');
}

export function hasClerkOrgMemberE2ECredentials(): boolean {
  return hasClerkIdentityE2ECredentials('orgProviderMember');
}

export async function signInClerkOrgMemberE2E(page: Page): Promise<void> {
  await signInClerkIdentityE2E(page, 'orgProviderMember');
}

export function hasClerkOrgProviderOwnerE2ECredentials(): boolean {
  return hasClerkIdentityE2ECredentials('orgProviderOwner');
}

export async function signInClerkOrgProviderOwnerE2E(
  page: Page,
): Promise<void> {
  await signInClerkIdentityE2E(page, 'orgProviderOwner');
}

export function hasClerkOrgProviderMemberE2ECredentials(): boolean {
  return hasClerkIdentityE2ECredentials('orgProviderMember');
}

export async function signInClerkOrgProviderMemberE2E(
  page: Page,
): Promise<void> {
  await signInClerkIdentityE2E(page, 'orgProviderMember');
}

export function hasClerkOrgDbSeededMemberE2ECredentials(): boolean {
  return hasClerkIdentityE2ECredentials('orgDbSeededMember');
}

export async function signInClerkOrgDbSeededMemberE2E(
  page: Page,
): Promise<void> {
  await signInClerkIdentityE2E(page, 'orgDbSeededMember');
}

export function hasClerkLinkingBlockedUnverifiedE2ECredentials(): boolean {
  return hasClerkIdentityE2ECredentials('linkingBlockedUnverified');
}

export async function signInClerkLinkingBlockedUnverifiedE2E(
  page: Page,
): Promise<void> {
  await signInClerkIdentityE2E(page, 'linkingBlockedUnverified');
}

export function hasClerkE2EOrganizationSlug(
  organization: ClerkE2EOrganization,
): boolean {
  const value = process.env[ORGANIZATION_ENV[organization]];
  return Boolean(value && value.trim().length > 0);
}

export function getClerkE2EOrganizationSlug(
  organization: ClerkE2EOrganization,
): string {
  const variableName = ORGANIZATION_ENV[organization];
  return required(process.env[variableName], variableName);
}
