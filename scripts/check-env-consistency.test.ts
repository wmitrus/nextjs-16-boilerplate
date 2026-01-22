import { getMissingKeys } from './check-env-consistency.mjs';

describe('check-env-consistency', () => {
  it('should return empty array when all keys are present', () => {
    const envTs = `
      export const env = createEnv({
        server: {
          NODE_ENV: z.string(),
          API_KEY: z.string(),
        },
        client: {
          NEXT_PUBLIC_URL: z.string(),
        }
      });
    `;
    const exampleEnv =
      'NODE_ENV=dev\nAPI_KEY=secret\nNEXT_PUBLIC_URL=http://localhost:3000';

    const missing = getMissingKeys(envTs, exampleEnv);
    expect(missing).toEqual([]);
  });

  it('should detect missing keys', () => {
    const envTs = `
      export const env = createEnv({
        server: {
          REQUIRED_VAR: z.string(),
        }
      });
    `;
    const exampleEnv = 'NODE_ENV=dev';

    const missing = getMissingKeys(envTs, exampleEnv);
    expect(missing).toEqual(['REQUIRED_VAR']);
  });

  it('should ignore keys in comments or other blocks', () => {
    const envTs = `
      export const env = createEnv({
        server: {
          // IGNORE_ME: z.string(),
          REAL_VAR: z.string(),
        }
      });
    `;
    const exampleEnv = 'REAL_VAR=value';

    const missing = getMissingKeys(envTs, exampleEnv);
    expect(missing).toEqual([]);
  });
});
