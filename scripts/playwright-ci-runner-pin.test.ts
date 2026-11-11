import { readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { readTextFileWithinBase } from './lib/fs-guards-shared';

/**
 * OZI-220/OZI-221 — `ubuntu-latest` moved to 26.04, where Playwright 1.58
 * refuses to install Chromium. Every workflow job that installs Playwright
 * browsers must run on a pinned, supported image, so a new or forgotten job
 * fails here instead of in CI (it slipped through once: only 2 of 9 jobs
 * were pinned).
 */
const WORKFLOWS_DIR = path.resolve(__dirname, '../.github/workflows');
const SUPPORTED_RUNNER = 'ubuntu-24.04';

function playwrightJobs(): { job: string; runsOn: string | undefined }[] {
  const found: { job: string; runsOn: string | undefined }[] = [];
  for (const file of readdirSync(WORKFLOWS_DIR).filter((f) =>
    /\.ya?ml$/.test(f),
  )) {
    let inJobs = false;
    let job:
      | { job: string; runsOn: string | undefined; usesPlaywright: boolean }
      | undefined;
    const flush = () => {
      if (job?.usesPlaywright) found.push({ job: job.job, runsOn: job.runsOn });
    };
    for (const line of readTextFileWithinBase(
      path.join(WORKFLOWS_DIR, file),
      WORKFLOWS_DIR,
    ).split('\n')) {
      if (/^jobs:\s*$/.test(line)) inJobs = true;
      else if (/^\S/.test(line)) inJobs = false;
      if (!inJobs) continue;
      const header = /^ {2}([\w-]+):\s*$/.exec(line);
      if (header) {
        flush();
        job = {
          job: `${file}#${header[1]}`,
          runsOn: undefined,
          usesPlaywright: false,
        };
        continue;
      }
      if (!job) continue;
      const runsOn = /^ {4}runs-on:\s*(\S+)/.exec(line);
      if (runsOn) job.runsOn = runsOn[1];
      if (/playwright install/.test(line)) job.usesPlaywright = true;
    }
    flush();
  }
  return found;
}

describe('Playwright CI runner pin', () => {
  it('runs every job that installs Playwright browsers on ubuntu-24.04', () => {
    const jobs = playwrightJobs();
    expect(jobs.length).toBeGreaterThanOrEqual(9);
    expect(jobs.filter((j) => j.runsOn !== SUPPORTED_RUNNER)).toEqual([]);
  });
});
