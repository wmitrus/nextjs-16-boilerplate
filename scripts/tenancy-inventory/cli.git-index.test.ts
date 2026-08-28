import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findHiddenGitIndexStateTags } from './cli';

/**
 * OZI-79 Phase B2, Codex review round 13: `findHiddenGitIndexStateTags`
 * exists specifically because Git's `assume-unchanged`/`skip-worktree`
 * index flags can make `git status --porcelain` silently miss a real
 * edit to a tracked file. Every other test for this guard
 * (`cli.test.ts`) mocks `execFileSync`'s output -- this file instead
 * runs real `git` commands against a disposable, freshly-created
 * repository (never this actual checkout) to prove the underlying Git
 * semantics this guard relies on are exactly what its parsing logic
 * assumes, not merely what a hand-written mock claims they are.
 *
 * No network, no database, no remote credential -- `git` is the only
 * external process involved, exactly like the mocked tests it
 * complements.
 */
describe('findHiddenGitIndexStateTags -- real Git behavior', () => {
  let repoDir: string;

  /**
   * `path.resolve(repoDir, 'tracked-file.txt')` is always computed
   * directly at this one call site, never via a pre-stored bare-variable
   * path -- keeps the sink's path provenance visible in place, matching
   * this repo's own script/E2E filesystem convention.
   */
  function writeTrackedFile(content: string): void {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- this test's own disposable mkdtemp scratch repo, confined to repoDir
    writeFileSync(path.resolve(repoDir, 'tracked-file.txt'), content);
  }

  beforeEach(() => {
    repoDir = mkdtempSync(path.join(tmpdir(), 'ozi79-git-index-test-'));
    execFileSync('git', ['init', '--quiet'], { cwd: repoDir });
    execFileSync('git', ['config', 'user.email', 'ozi79-test@example.com'], {
      cwd: repoDir,
    });
    execFileSync('git', ['config', 'user.name', 'OZI-79 Test'], {
      cwd: repoDir,
    });
    writeTrackedFile('original content\n');
    execFileSync('git', ['add', 'tracked-file.txt'], { cwd: repoDir });
    execFileSync('git', ['commit', '--quiet', '-m', 'init'], { cwd: repoDir });
  });

  afterEach(() => {
    // eslint-disable-next-line no-restricted-syntax -- this test's own disposable mkdtemp scratch repo
    rmSync(repoDir, { recursive: true, force: true });
  });

  function realPorcelainStatus(): string {
    return execFileSync('git', ['status', '--porcelain'], {
      cwd: repoDir,
      encoding: 'utf8',
    }).trim();
  }

  it('reports no hidden state for an ordinary freshly-committed, clean repository', () => {
    expect(realPorcelainStatus()).toBe('');
    expect(findHiddenGitIndexStateTags(repoDir)).toEqual([]);
  });

  it('an ordinary dirty tracked file (no hidden-state flag) is visible to git status and is not reported as hidden state', () => {
    writeTrackedFile('ordinary edit\n');

    expect(realPorcelainStatus()).not.toBe('');
    expect(findHiddenGitIndexStateTags(repoDir)).toEqual([]);
  });

  it('detects an assume-unchanged entry, and proves ordinary git status silently misses the edit it hides', () => {
    execFileSync(
      'git',
      ['update-index', '--assume-unchanged', 'tracked-file.txt'],
      { cwd: repoDir },
    );
    writeTrackedFile('edited while hidden behind assume-unchanged\n');

    // This is the exact gap the guard exists to close: ordinary status
    // reports a fully clean tree even though the file was just edited.
    expect(realPorcelainStatus()).toBe('');

    const tags = findHiddenGitIndexStateTags(repoDir);
    expect(tags.length).toBe(1);
    expect(tags[0]).toMatch(/^[a-z]$/);

    execFileSync(
      'git',
      ['update-index', '--no-assume-unchanged', 'tracked-file.txt'],
      { cwd: repoDir },
    );
    expect(findHiddenGitIndexStateTags(repoDir)).toEqual([]);
  });

  it('detects a skip-worktree entry, and proves ordinary git status silently misses the edit it hides', () => {
    execFileSync(
      'git',
      ['update-index', '--skip-worktree', 'tracked-file.txt'],
      { cwd: repoDir },
    );
    writeTrackedFile('edited while hidden behind skip-worktree\n');

    expect(realPorcelainStatus()).toBe('');

    const tags = findHiddenGitIndexStateTags(repoDir);
    expect(tags).toEqual(['S']);

    execFileSync(
      'git',
      ['update-index', '--no-skip-worktree', 'tracked-file.txt'],
      { cwd: repoDir },
    );
    expect(findHiddenGitIndexStateTags(repoDir)).toEqual([]);
  });

  it('detects the combined assume-unchanged + skip-worktree state on the same entry', () => {
    execFileSync(
      'git',
      ['update-index', '--assume-unchanged', 'tracked-file.txt'],
      { cwd: repoDir },
    );
    execFileSync(
      'git',
      ['update-index', '--skip-worktree', 'tracked-file.txt'],
      { cwd: repoDir },
    );
    writeTrackedFile('edited while hidden behind both flags\n');

    expect(realPorcelainStatus()).toBe('');

    const tags = findHiddenGitIndexStateTags(repoDir);
    expect(tags).toEqual(['s']);
  });

  it('is enough to reject on the flag alone, even when the hidden file has not actually been edited since HEAD', () => {
    execFileSync(
      'git',
      ['update-index', '--assume-unchanged', 'tracked-file.txt'],
      { cwd: repoDir },
    );
    // No edit made -- the file on disk is still byte-for-byte identical
    // to what HEAD recorded. The flag itself, not current content, is
    // what this guard rejects: nothing prevents the file differing a
    // moment later while ordinary status keeps reporting clean regardless.
    expect(findHiddenGitIndexStateTags(repoDir)).toEqual(['h']);
  });
});
