import { createClerkClient } from '@clerk/backend';
import type {
  ClerkClient,
  OrganizationMembershipRole,
  User,
} from '@clerk/backend';
import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import type { Browser, Page } from '@playwright/test';

const GENERATED_CLERK_TEST_EMAIL_PREFIX = 'e2e+clerk_test-';
const GENERATED_CLERK_TEST_EMAIL_DOMAIN = '@example.com';
const CLERK_AUTO_CREATED_ORGANIZATION_NAME = 'My Organization';
const CLERK_AUTO_CREATED_ORGANIZATION_SLUG_PREFIX = 'my-organization-';
const CLERK_BACKEND_MAX_ATTEMPTS = 3;
const CLERK_BACKEND_RETRY_DELAY_MS = 750;

export type ClerkE2EIdentity =
  | 'singleNewUser'
  | 'singleProvisionedUser'
  | 'incompleteUser'
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
  incompleteUser: {
    username: ['E2E_CLERK_INCOMPLETE_USER_USERNAME'],
    password: ['E2E_CLERK_INCOMPLETE_USER_PASSWORD'],
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

interface OrganizationMembershipFixture {
  readonly organization: ClerkE2EOrganization;
  readonly role: OrganizationMembershipRole;
}

const MUTABLE_IDENTITY_RECONCILIATION = new Set<ClerkE2EIdentity>([
  'singleNewUser',
  'singleProvisionedUser',
  'incompleteUser',
  'personalNewUser',
  'orgProviderOwner',
  'orgProviderMember',
  'orgDbSeededMember',
]);

const mutableIdentityReconciliation = new Map<
  ClerkE2EIdentity,
  Promise<void>
>();

function getIdentityEnvConfig(identity: ClerkE2EIdentity): EnvAliasPair {
  switch (identity) {
    case 'singleNewUser':
      return IDENTITY_ENV.singleNewUser;
    case 'singleProvisionedUser':
      return IDENTITY_ENV.singleProvisionedUser;
    case 'incompleteUser':
      return IDENTITY_ENV.incompleteUser;
    case 'personalNewUser':
      return IDENTITY_ENV.personalNewUser;
    case 'orgProviderOwner':
      return IDENTITY_ENV.orgProviderOwner;
    case 'orgProviderMember':
      return IDENTITY_ENV.orgProviderMember;
    case 'orgDbSeededMember':
      return IDENTITY_ENV.orgDbSeededMember;
    case 'linkingBlockedUnverified':
      return IDENTITY_ENV.linkingBlockedUnverified;
  }
}

function getOrganizationEnvName(organization: ClerkE2EOrganization): string {
  switch (organization) {
    case 'providerOwner':
      return ORGANIZATION_ENV.providerOwner;
    case 'providerMember':
      return ORGANIZATION_ENV.providerMember;
  }
}

function required(value: string | undefined, variableName: string): string {
  if (!value) {
    throw new Error(
      `Missing ${variableName}. Set it in your environment for Clerk-authenticated E2E tests.`,
    );
  }

  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeUnknownError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const maybeApiError = error as Error & {
    readonly status?: number;
    readonly statusCode?: number;
    readonly errors?: ReadonlyArray<{
      readonly code?: string;
      readonly message?: string;
    }>;
  };
  const details = [];

  if (error.name) {
    details.push(error.name);
  }

  if (error.message) {
    details.push(error.message);
  }

  if (typeof maybeApiError.status === 'number') {
    details.push(`status=${maybeApiError.status}`);
  }

  if (typeof maybeApiError.statusCode === 'number') {
    details.push(`statusCode=${maybeApiError.statusCode}`);
  }

  if (Array.isArray(maybeApiError.errors)) {
    const clerkErrors = maybeApiError.errors
      .map((entry) =>
        [entry.code, entry.message]
          .filter((value): value is string => typeof value === 'string')
          .join(': '),
      )
      .filter((value) => value.length > 0);

    if (clerkErrors.length > 0) {
      details.push(clerkErrors.join('; '));
    }
  }

  return details.length > 0 ? details.join(' - ') : 'unknown error';
}

async function withClerkBackendRetry<T>(
  operationName: string,
  operation: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= CLERK_BACKEND_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt < CLERK_BACKEND_MAX_ATTEMPTS) {
        await sleep(CLERK_BACKEND_RETRY_DELAY_MS);
      }
    }
  }

  throw new Error(
    `${operationName} failed after ${CLERK_BACKEND_MAX_ATTEMPTS} attempts: ${describeUnknownError(lastError)}`,
  );
}

function looksLikeEmailAddress(value: string): boolean {
  return value.includes('@');
}

function isGeneratedClerkTestEmail(value: string): boolean {
  return (
    value.startsWith(GENERATED_CLERK_TEST_EMAIL_PREFIX) &&
    value.endsWith(GENERATED_CLERK_TEST_EMAIL_DOMAIN)
  );
}

function readEnvValue(name: string): string | undefined {
  for (const [envName, envValue] of Object.entries(process.env)) {
    if (envName !== name) {
      continue;
    }

    if (typeof envValue === 'string' && envValue.trim().length > 0) {
      return envValue;
    }
  }

  return undefined;
}

function firstDefined(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = readEnvValue(name);
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

function createClerkBackendClient() {
  const secretKey = required(
    readEnvValue('CLERK_SECRET_KEY'),
    'CLERK_SECRET_KEY',
  );
  const apiUrl = readEnvValue('CLERK_API_URL');

  return createClerkClient(apiUrl ? { secretKey, apiUrl } : { secretKey });
}

function isClerkNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const maybeResponse = error as Error & {
    readonly status?: number;
    readonly statusCode?: number;
    readonly errors?: ReadonlyArray<{ readonly code?: string }>;
  };

  return (
    maybeResponse.status === 404 ||
    maybeResponse.statusCode === 404 ||
    maybeResponse.errors?.some(
      (entry) => entry.code === 'resource_not_found',
    ) === true
  );
}

function getPrimaryEmailAddress(user: {
  readonly emailAddresses?: ReadonlyArray<{
    readonly emailAddress?: string;
  }>;
  readonly primaryEmailAddressId?: string | null;
}): string | undefined {
  const primaryEmail = user.emailAddresses?.find(
    (email) => email.emailAddress && email.emailAddress.length > 0,
  );

  return primaryEmail?.emailAddress;
}

function getFixtureDisplayNameFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter((part) => part.length > 0)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}

function getOrganizationMembershipFixture(
  identity: ClerkE2EIdentity,
): OrganizationMembershipFixture | null {
  switch (identity) {
    case 'orgProviderOwner':
      return {
        organization: 'providerOwner',
        role: 'org:admin',
      };
    case 'orgProviderMember':
      return {
        organization: 'providerMember',
        role: 'org:member',
      };
    case 'singleNewUser':
    case 'singleProvisionedUser':
    case 'incompleteUser':
    case 'personalNewUser':
    case 'orgDbSeededMember':
    case 'linkingBlockedUnverified':
      return null;
  }
}

function getProtectedClerkOrganizationSlugs(): Set<string> {
  const slugs = new Set<string>();

  for (const organization of Object.keys(
    ORGANIZATION_ENV,
  ) as ClerkE2EOrganization[]) {
    const slug = readEnvValue(getOrganizationEnvName(organization));

    if (slug) {
      slugs.add(slug);
    }
  }

  return slugs;
}

function isGeneratedClerkE2EOrganization(organization: {
  readonly name?: string | null;
  readonly slug?: string | null;
  readonly membersCount?: number | null;
}): boolean {
  return (
    organization.name === CLERK_AUTO_CREATED_ORGANIZATION_NAME &&
    typeof organization.slug === 'string' &&
    organization.slug.startsWith(CLERK_AUTO_CREATED_ORGANIZATION_SLUG_PREFIX) &&
    organization.membersCount === 0
  );
}

export async function deleteGeneratedClerkE2EUserByEmail(
  emailAddress: string,
): Promise<number> {
  if (!isGeneratedClerkTestEmail(emailAddress)) {
    throw new Error(
      `Refusing to delete non-generated Clerk E2E email: ${emailAddress}`,
    );
  }

  const clerkClient = createClerkBackendClient();
  const userList = await withClerkBackendRetry(
    'Clerk generated E2E user lookup',
    () =>
      clerkClient.users.getUserList({
        emailAddress: [emailAddress],
      }),
  );
  const users = Array.isArray(userList.data) ? userList.data : [];

  await Promise.all(
    users.map((user) =>
      withClerkBackendRetry('Clerk generated E2E user deletion', () =>
        clerkClient.users.deleteUser(user.id),
      ),
    ),
  );

  return users.length;
}

export async function cleanupGeneratedClerkE2EOrganizations(): Promise<number> {
  const clerkClient = createClerkBackendClient();
  const protectedSlugs = getProtectedClerkOrganizationSlugs();
  let deletedCount = 0;

  for (let pass = 0; pass < 5; pass += 1) {
    const organizationList = await withClerkBackendRetry(
      'Clerk generated E2E organization lookup',
      () =>
        clerkClient.organizations.getOrganizationList({
          includeMembersCount: true,
          limit: 100,
          query: CLERK_AUTO_CREATED_ORGANIZATION_NAME,
        }),
    );
    const organizations = (
      Array.isArray(organizationList.data) ? organizationList.data : []
    ).filter(
      (organization) =>
        isGeneratedClerkE2EOrganization(organization) &&
        !protectedSlugs.has(organization.slug ?? ''),
    );

    if (organizations.length === 0) {
      break;
    }

    await Promise.all(
      organizations.map((organization) =>
        withClerkBackendRetry('Clerk generated E2E organization deletion', () =>
          clerkClient.organizations.deleteOrganization(organization.id),
        ),
      ),
    );
    deletedCount += organizations.length;

    if (organizations.length < 100) {
      break;
    }
  }

  return deletedCount;
}

export async function cleanupGeneratedClerkE2EUsers(): Promise<number> {
  const clerkClient = createClerkBackendClient();
  let deletedCount = 0;

  for (let pass = 0; pass < 5; pass += 1) {
    const userList = await withClerkBackendRetry(
      'Clerk generated E2E users lookup',
      () =>
        clerkClient.users.getUserList({
          limit: 100,
          query: GENERATED_CLERK_TEST_EMAIL_PREFIX,
        }),
    );
    const users = (Array.isArray(userList.data) ? userList.data : []).filter(
      (user) => {
        const emailAddress = getPrimaryEmailAddress(user);

        return emailAddress ? isGeneratedClerkTestEmail(emailAddress) : false;
      },
    );

    if (users.length === 0) {
      break;
    }

    await Promise.all(
      users.map((user) =>
        withClerkBackendRetry('Clerk generated E2E user deletion', () =>
          clerkClient.users.deleteUser(user.id),
        ),
      ),
    );
    deletedCount += users.length;

    if (users.length < 100) {
      break;
    }
  }

  return deletedCount;
}

export async function cleanupGeneratedClerkE2EArtifacts(): Promise<{
  readonly organizations: number;
  readonly users: number;
}> {
  const users = await cleanupGeneratedClerkE2EUsers();
  const organizations = await cleanupGeneratedClerkE2EOrganizations();

  return { organizations, users };
}

async function reconcileMutableIdentityFixture(
  identity: ClerkE2EIdentity,
  credentials: { username: string; password: string },
): Promise<void> {
  if (!MUTABLE_IDENTITY_RECONCILIATION.has(identity)) {
    return;
  }

  if (!looksLikeEmailAddress(credentials.username)) {
    return;
  }

  const existingTask = mutableIdentityReconciliation.get(identity);
  if (existingTask) {
    await existingTask;
    return;
  }

  const reconciliationTask = (async () => {
    const clerkClient = createClerkBackendClient();
    const userList = await withClerkBackendRetry(
      'Clerk mutable E2E user lookup',
      () =>
        clerkClient.users.getUserList({
          emailAddress: [credentials.username],
        }),
    );
    const existingUser = Array.isArray(userList.data)
      ? userList.data[0]
      : undefined;

    if (!existingUser) {
      const createdUser = await withClerkBackendRetry(
        'Clerk mutable E2E user creation',
        () =>
          clerkClient.users.createUser({
            emailAddress: [credentials.username],
            password: credentials.password,
            skipPasswordChecks: true,
            skipLegalChecks: true,
          }),
      );
      await reconcileOrganizationMembershipFixture(
        clerkClient,
        identity,
        createdUser,
      );
      return;
    }

    const updatedUser = await withClerkBackendRetry(
      'Clerk mutable E2E user update',
      () =>
        clerkClient.users.updateUser(existingUser.id, {
          password: credentials.password,
          skipPasswordChecks: true,
          skipLegalChecks: true,
        }),
    );
    await reconcileOrganizationMembershipFixture(
      clerkClient,
      identity,
      updatedUser,
    );
  })();

  mutableIdentityReconciliation.set(identity, reconciliationTask);

  try {
    await reconciliationTask;
  } catch (error) {
    mutableIdentityReconciliation.delete(identity);
    throw error;
  }
}

async function reconcileOrganizationMembershipFixture(
  clerkClient: ClerkClient,
  identity: ClerkE2EIdentity,
  user: User,
): Promise<void> {
  const fixture = getOrganizationMembershipFixture(identity);

  if (!fixture) {
    return;
  }

  const organizationSlug = getClerkE2EOrganizationSlug(fixture.organization);
  let organization:
    | Awaited<ReturnType<typeof clerkClient.organizations.getOrganization>>
    | undefined;

  try {
    organization = await withClerkBackendRetry(
      'Clerk E2E organization lookup',
      () =>
        clerkClient.organizations.getOrganization({
          slug: organizationSlug,
          includeMembersCount: true,
        }),
    );
  } catch (error) {
    if (!isClerkNotFoundError(error)) {
      throw error;
    }

    organization = await withClerkBackendRetry(
      'Clerk E2E organization creation',
      () =>
        clerkClient.organizations.createOrganization({
          name: getFixtureDisplayNameFromSlug(organizationSlug),
          slug: organizationSlug,
          createdBy: user.id,
        }),
    );
  }

  const membershipList = await withClerkBackendRetry(
    'Clerk E2E organization membership lookup',
    () =>
      clerkClient.organizations.getOrganizationMembershipList({
        organizationId: organization.id,
        userId: [user.id],
        limit: 1,
      }),
  );
  const membership = Array.isArray(membershipList.data)
    ? membershipList.data[0]
    : undefined;

  if (!membership) {
    await withClerkBackendRetry(
      'Clerk E2E organization membership creation',
      () =>
        clerkClient.organizations.createOrganizationMembership({
          organizationId: organization.id,
          userId: user.id,
          role: fixture.role,
        }),
    );
    return;
  }

  if (membership.role !== fixture.role) {
    await withClerkBackendRetry(
      'Clerk E2E organization membership update',
      () =>
        clerkClient.organizations.updateOrganizationMembership({
          organizationId: organization.id,
          userId: user.id,
          role: fixture.role,
        }),
    );
  }
}

export function getClerkE2ECredentials(identity: ClerkE2EIdentity): {
  username: string;
  password: string;
} {
  const envConfig = getIdentityEnvConfig(identity);

  return {
    username: requiredFromAliases(envConfig.username),
    password: requiredFromAliases(envConfig.password),
  };
}

export function hasClerkIdentityE2ECredentials(
  identity: ClerkE2EIdentity,
): boolean {
  const credentials = getIdentityEnvConfig(identity);
  return Boolean(
    firstDefined(credentials.username) && firstDefined(credentials.password),
  );
}

export function hasClerkE2ECredentials(): boolean {
  return hasClerkIdentityE2ECredentials('singleProvisionedUser');
}

async function completeGenericOnboarding(page: Page): Promise<void> {
  const onboardingHeading = page.getByRole('heading', {
    name: /complete your profile/i,
  });

  await page.getByLabel(/display name/i).fill('E2E User');
  await page.getByLabel(/language/i).selectOption('en-US');
  await page.getByLabel(/timezone/i).selectOption('Europe/Warsaw');
  await page.getByRole('button', { name: /get started/i }).click();
  await onboardingHeading.waitFor({ state: 'hidden', timeout: 10_000 });
}

async function settleProvisionedUserSession(page: Page): Promise<void> {
  await page.waitForFunction(
    (expectedPathnames) => expectedPathnames.includes(window.location.pathname),
    ['/onboarding', '/users'],
  );

  const onboardingHeading = page.getByRole('heading', {
    name: /complete your profile/i,
  });

  if (await onboardingHeading.isVisible().catch(() => false)) {
    await completeGenericOnboarding(page);
  }

  await page.waitForFunction(() => window.location.pathname === '/users');
}

async function establishProgrammaticSessionWithoutBootstrap(
  page: Page,
  credentials: { username: string; password: string },
): Promise<void> {
  // Follow Clerk's recommended Playwright flow:
  // load Clerk on a public page, then sign in via the helper.
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

  try {
    await page.waitForFunction(
      () =>
        Boolean(
          window.Clerk?.loaded && window.Clerk?.session && window.Clerk?.user,
        ),
      { timeout: 10_000 },
    );
  } catch (error) {
    const url = page.url();
    const bodyText = await page
      .locator('body')
      .innerText()
      .catch(() => '');
    const needsSecondFactor =
      url.includes('/sign-in/factor-two') ||
      /check your email|verification code|second factor/i.test(bodyText);

    if (needsSecondFactor) {
      throw new Error(
        "Clerk E2E sign-in requires a second factor. This runtime helper intentionally supports only Clerk's documented first-factor Playwright flow. Disable Client Trust / MFA for dedicated password fixtures, or move these fixtures to a different supported auth strategy.",
      );
    }

    const message =
      error instanceof Error ? error.message : 'unknown Clerk sign-in failure';

    throw new Error(
      `Clerk Playwright helper did not establish a session. Verify that the app keys point to the correct Clerk test instance, password sign-in is enabled, and the fixture is not blocked by Client Trust / MFA. Original error: ${message}`,
    );
  }

  // Clerk's recommended flow performs a navigation after sign-in.
  // This allows the app server to observe the established browser session
  // before the runtime tests hit protected APIs or routes.
  await page.goto('/', { waitUntil: 'networkidle' });
}

export async function signInWithCredentials(
  page: Page,
  credentials: { username: string; password: string },
): Promise<void> {
  await establishProgrammaticSessionWithoutBootstrap(page, credentials);
}

export async function signInClerkIdentityE2E(
  page: Page,
  identity: ClerkE2EIdentity,
): Promise<void> {
  const credentials = getClerkE2ECredentials(identity);
  await reconcileMutableIdentityFixture(identity, credentials);
  await signInWithCredentials(page, credentials);
}

export async function signInE2E(page: Page): Promise<void> {
  await signInClerkIdentityE2E(page, 'singleProvisionedUser');
  await page.goto('/auth/bootstrap/start?redirect_url=/users');
  await settleProvisionedUserSession(page);
}

export async function captureClerkSessionStorageState(browser: Browser) {
  const context = await browser.newContext();

  try {
    const page = await context.newPage();
    await signInE2E(page);
    return await context.storageState();
  } finally {
    await context.close().catch(() => undefined);
  }
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

export function hasClerkIncompleteUserE2ECredentials(): boolean {
  return hasClerkIdentityE2ECredentials('incompleteUser');
}

export async function signInClerkIncompleteUserE2E(page: Page): Promise<void> {
  await signInClerkIdentityE2E(page, 'incompleteUser');
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
  const value = readEnvValue(getOrganizationEnvName(organization));
  return Boolean(value && value.trim().length > 0);
}

export function getClerkE2EOrganizationSlug(
  organization: ClerkE2EOrganization,
): string {
  const variableName = getOrganizationEnvName(organization);
  return required(readEnvValue(variableName), variableName);
}
