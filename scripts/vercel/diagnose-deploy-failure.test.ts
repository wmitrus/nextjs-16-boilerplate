import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  diagnoseDeployFailure,
  escapeGitHubCommandData,
  formatDeploymentFailure,
} from './diagnose-deploy-failure';

describe('formatDeploymentFailure', () => {
  it('reports marketplace provisioning failure before the application build', () => {
    const message = formatDeploymentFailure(
      {
        builds: [],
        errorMessage: 'Resource provisioning failed',
        inspectorUrl: 'https://vercel.com/team/project/deployment',
        integrations: { status: 'error' },
        team: { slug: 'example-team' },
      },
      [
        {
          id: 'store_neon',
          name: 'app-db',
          product: 'Neon',
          status: 'available',
        },
      ],
    );

    expect(message).toContain('BLOCKED BEFORE BUILD');
    expect(message).toContain(
      'application build and database migration did not start',
    );
    expect(message).toContain('Neon / app-db (status: available)');
    expect(message).toContain(
      'https://vercel.com/example-team/~/stores/integration/store_neon',
    );
    expect(message).toContain('Preview branch quota');
  });

  it('keeps a generic diagnostic for failures unrelated to integrations', () => {
    expect(
      formatDeploymentFailure(
        {
          builds: [{}],
          errorMessage: 'Build command failed',
          integrations: { status: 'succeeded' },
        },
        [],
      ),
    ).toBe('Vercel deployment failed.\nReason: Build command failed');
  });
});

describe('escapeGitHubCommandData', () => {
  it('prevents provider text from altering the workflow command', () => {
    expect(escapeGitHubCommandData('Neon%0A\r\nfailed')).toBe(
      'Neon%250A%0D%0Afailed',
    );
  });
});

describe('diagnoseDeployFailure', () => {
  let dir: string;

  afterEach(() => {
    // eslint-disable-next-line no-restricted-syntax -- dir is a test-owned mkdtempSync() root created in the test below, not user input.
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('rejects a resultPath outside the system temp directory before any filesystem access', () => {
    // Real production usage always passes a path under tmpdir() (see
    // preview-deploy.yml's `-- /tmp/vercel-preview-deploy.json`) — confinement
    // must reject anything else before even attempting to read it.
    expect(() => diagnoseDeployFailure('/etc/passwd')).toThrow(
      /escapes the allowed directory/,
    );
  });

  it('reports the deployment-id-missing case without needing the Vercel CLI (no deployment ID means no API call is made)', () => {
    dir = mkdtempSync(path.join(tmpdir(), 'diagnose-deploy-test-'));
    const resultPath = path.join(dir, 'vercel-deploy-result.json');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- resultPath is built from a test-owned mkdtempSync() root two lines above, not user input.
    writeFileSync(
      // eslint-disable-next-line no-restricted-syntax -- resultPath is built from a test-owned mkdtempSync() root two lines above, not user input.
      resultPath,
      JSON.stringify({ error: { message: 'Build failed before deploy' } }),
    );

    expect(diagnoseDeployFailure(resultPath)).toBe(
      'Vercel deployment failed before returning a deployment ID: Build failed before deploy',
    );
  });
});
