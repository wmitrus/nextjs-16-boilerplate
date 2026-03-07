import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import type { Page } from '@playwright/test';

export type ClerkE2EIdentity =
  | 'singleNewUser'
  | 'singleProvisionedUser'
  | 'personalNewUser'
  | 'orgOwner'
  | 'orgMember'
  | 'orgNonMember'
  | 'unverifiedEmailUser';

export type ClerkE2EOrganization = 'owner' | 'member' | 'empty';

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
  orgOwner: {
    username: ['E2E_CLERK_ORG_OWNER_USERNAME'],
    password: ['E2E_CLERK_ORG_OWNER_PASSWORD'],
  },
  orgMember: {
    username: ['E2E_CLERK_ORG_MEMBER_USERNAME'],
    password: ['E2E_CLERK_ORG_MEMBER_PASSWORD'],
  },
  orgNonMember: {
    username: ['E2E_CLERK_ORG_NON_MEMBER_USERNAME'],
    password: ['E2E_CLERK_ORG_NON_MEMBER_PASSWORD'],
  },
  unverifiedEmailUser: {
    username: ['E2E_CLERK_UNVERIFIED_EMAIL_USER_USERNAME'],
    password: ['E2E_CLERK_UNVERIFIED_EMAIL_USER_PASSWORD'],
  },
};

const ORGANIZATION_ENV: Record<ClerkE2EOrganization, string> = {
  owner: 'E2E_CLERK_ORG_OWNER_SLUG',
  member: 'E2E_CLERK_ORG_MEMBER_SLUG',
  empty: 'E2E_CLERK_ORG_EMPTY_SLUG',
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

  await clerk.signIn({
    page,
    signInParams: {
      strategy: 'password',
      identifier: credentials.username,
      password: credentials.password,
    },
  });

  await clerk.loaded({ page });
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
  return hasClerkIdentityE2ECredentials('orgOwner');
}

export async function signInClerkOrgOwnerE2E(page: Page): Promise<void> {
  await signInClerkIdentityE2E(page, 'orgOwner');
}

export function hasClerkOrgMemberE2ECredentials(): boolean {
  return hasClerkIdentityE2ECredentials('orgMember');
}

export async function signInClerkOrgMemberE2E(page: Page): Promise<void> {
  await signInClerkIdentityE2E(page, 'orgMember');
}

export function hasClerkOrgNonMemberE2ECredentials(): boolean {
  return hasClerkIdentityE2ECredentials('orgNonMember');
}

export async function signInClerkOrgNonMemberE2E(page: Page): Promise<void> {
  await signInClerkIdentityE2E(page, 'orgNonMember');
}

export function hasClerkUnverifiedEmailUserE2ECredentials(): boolean {
  return hasClerkIdentityE2ECredentials('unverifiedEmailUser');
}

export async function signInClerkUnverifiedEmailUserE2E(
  page: Page,
): Promise<void> {
  await signInClerkIdentityE2E(page, 'unverifiedEmailUser');
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
