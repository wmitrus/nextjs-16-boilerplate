import { parseEnvFile } from './load-env';

describe('parseEnvFile', () => {
  it('parses KEY=VALUE pairs', () => {
    const result = parseEnvFile('FOO=bar\nBAZ=qux');
    expect(result).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('ignores blank lines', () => {
    const result = parseEnvFile('\n\nFOO=bar\n\n');
    expect(result).toEqual({ FOO: 'bar' });
  });

  it('ignores lines starting with #', () => {
    const result = parseEnvFile('# this is a comment\nFOO=bar');
    expect(result).toEqual({ FOO: 'bar' });
  });

  it('strips inline comments from unquoted values', () => {
    const result = parseEnvFile('FOO=bar # comment');
    expect(result).toEqual({ FOO: 'bar' });
  });

  it('preserves double-quoted values including spaces', () => {
    const result = parseEnvFile('FOO="hello world"');
    expect(result).toEqual({ FOO: 'hello world' });
  });

  it('preserves single-quoted values', () => {
    const result = parseEnvFile("FOO='hello world'");
    expect(result).toEqual({ FOO: 'hello world' });
  });

  it('returns empty object for empty string', () => {
    expect(parseEnvFile('')).toEqual({});
  });

  it('ignores lines with no = sign', () => {
    const result = parseEnvFile('NOEQUALSSIGN');
    expect(result).toEqual({});
  });

  it('handles values that contain = signs', () => {
    const result = parseEnvFile('URL=postgres://user:p@host/db?ssl=true');
    expect(result).toEqual({ URL: 'postgres://user:p@host/db?ssl=true' });
  });

  it('skips entries with empty key', () => {
    const result = parseEnvFile('=value');
    expect(result).toEqual({});
  });
});
