import { createPageObjects } from '@clerk/testing/playwright/unstable';
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

function getBaseUrl(): string {
  return process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:3000';
}

async function completeGenericOnboarding(page: Page): Promise<void> {
  await page.getByLabel(/display name/i).fill('E2E User');
  await page.getByLabel(/language/i).selectOption('en-US');
  await page.getByLabel(/timezone/i).selectOption('Europe/Warsaw');
  await page.getByRole('button', { name: /get started/i }).click();
}

async function establishUiSessionWithoutBootstrap(
  page: Page,
  credentials: { username: string; password: string },
): Promise<void> {
  if (!credentials.username.includes('@')) {
    throw new Error(
      'Clerk E2E fixtures must use email-based sign-in credentials.',
    );
  }

  const clerkUi = createPageObjects({
    page,
    baseURL: getBaseUrl(),
  });
  const bootstrapPath = '/auth/bootstrap';
  const bootstrapPattern = `**${bootstrapPath}**`;
  const bootstrapPauseMarker = 'bootstrap paused for e2e';
  const bootstrapBlocker = async (
    route: Parameters<Page['route']>[1] extends (
      route: infer T,
      ...args: never[]
    ) => unknown
      ? T
      : never,
  ) => {
    if (!route.request().isNavigationRequest()) {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: `<html><body>${bootstrapPauseMarker}</body></html>`,
    });
  };

  await page.route(bootstrapPattern, bootstrapBlocker);

  try {
    await clerkUi.signIn.goTo();
    await clerkUi.signIn.signInWithEmailAndInstantPassword({
      email: credentials.username,
      password: credentials.password,
      waitForSession: false,
    });

    await page.waitForURL(new RegExp(`${bootstrapPath}(\\?.*)?$`));
    await page.getByText(bootstrapPauseMarker).waitFor();
  } finally {
    await page.unroute(bootstrapPattern, bootstrapBlocker);
  }
}

export async function signInWithCredentials(
  page: Page,
  credentials: { username: string; password: string },
): Promise<void> {
  await establishUiSessionWithoutBootstrap(page, credentials);
}

export async function signInClerkIdentityE2E(
  page: Page,
  identity: ClerkE2EIdentity,
): Promise<void> {
  await signInWithCredentials(page, getClerkE2ECredentials(identity));
}

export async function signInE2E(page: Page): Promise<void> {
  await signInClerkIdentityE2E(page, 'singleProvisionedUser');
  await page.goto('/auth/bootstrap?redirect_url=/users');

  if (page.url().includes('/onboarding')) {
    await completeGenericOnboarding(page);
  }
}

export function hasClerkUnprovisionedE2ECredentials(): boolean {
  return hasClerkIdentityE2ECredentials('singleNewUser');
}

export async function signInUnprovisionedE2E(page: Page): Promise<void> {
  await signInClerkIdentityE2E(page, 'singleNewUser');
}

export async function withClerkTestingToken(page: Page): Promise<void> {
  await page.goto('/');
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
