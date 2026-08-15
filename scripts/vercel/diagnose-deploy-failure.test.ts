import { describe, expect, it } from 'vitest';

import {
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
