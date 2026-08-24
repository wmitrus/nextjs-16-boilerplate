/** @vitest-environment node */
import { describe, expect, it } from 'vitest';

import {
  RECOVERY_CODE_COUNT,
  generateRecoveryCodes,
  parseRecoveryCode,
  verifyRecoveryCodeSecret,
} from './recovery-codes';

describe('generateRecoveryCodes', () => {
  it('issues ten codes whose secrets are never stored in the clear', async () => {
    const { display, records } = await generateRecoveryCodes();

    expect(display).toHaveLength(RECOVERY_CODE_COUNT);
    expect(records).toHaveLength(RECOVERY_CODE_COUNT);

    for (const [code, record] of display.map(
      (code, index) => [code, records.at(index)!] as const,
    )) {
      const secret = code.split('-')[1]!;

      expect(code.startsWith(`${record.codeId}-`)).toBe(true);
      // Argon2id, per SEC-47's hasher -- not a fast hash, because these
      // secrets sit below NIST's 112-bit threshold for look-up secrets.
      expect(record.secretHash.startsWith('$argon2id$')).toBe(true);
      expect(record.secretHash).not.toContain(secret);
    }
  });

  it('uses an alphabet without visually ambiguous characters', async () => {
    const { display } = await generateRecoveryCodes();

    for (const code of display) {
      // No I, L, O, U, 0 or 1 -- these get transcribed wrong off a screen.
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTVWXYZ23456789-]+$/);
    }
  });

  it('never repeats a code id inside one set', async () => {
    // A collision would make the composite primary key silently drop a code.
    const { records } = await generateRecoveryCodes();
    const ids = new Set(records.map((record) => record.codeId));

    expect(ids.size).toBe(RECOVERY_CODE_COUNT);
  });

  it('produces a different set every time', async () => {
    const first = await generateRecoveryCodes(3);
    const second = await generateRecoveryCodes(3);

    expect(first.display).not.toEqual(second.display);
  });
});

describe('parseRecoveryCode', () => {
  it('round-trips a generated code', async () => {
    const { display, records } = await generateRecoveryCodes(1);
    const parsed = parseRecoveryCode(display[0]!);

    expect(parsed?.codeId).toBe(records[0]!.codeId);
    await expect(
      verifyRecoveryCodeSecret(parsed!.secret, records[0]!.secretHash),
    ).resolves.toBe(true);
  });

  it('accepts the code as it will actually be re-typed', async () => {
    const { display } = await generateRecoveryCodes(1);
    const canonical = parseRecoveryCode(display[0]!);

    // Lowercased, padded with whitespace, and with the separator dropped:
    // all three are what a human paste or retype produces.
    expect(parseRecoveryCode(display[0]!.toLowerCase())).toEqual(canonical);
    expect(parseRecoveryCode(`  ${display[0]!}  `)).toEqual(canonical);
    expect(parseRecoveryCode(display[0]!.replace('-', ''))).toEqual(canonical);
  });

  it.each([
    ['too short', 'ABC-DEF'],
    ['ambiguous characters', 'ABCDE0-IIIIIIIIIIIIIIII'],
    ['a TOTP code', '123456'],
    ['empty', ''],
    ['two separators', 'ABCDEF-GHJKMN-PQRSTV'],
  ])('rejects %s', (_label, raw) => {
    expect(parseRecoveryCode(raw)).toBeUndefined();
  });
});

describe('verifyRecoveryCodeSecret', () => {
  it('rejects a wrong secret against a real hash', async () => {
    const { records } = await generateRecoveryCodes(1);

    await expect(
      verifyRecoveryCodeSecret('WRONGWRONGWRONGW', records[0]!.secretHash),
    ).resolves.toBe(false);
  });
});
