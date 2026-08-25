/**
 * Standalone fixture process for the real, cross-process lock-contention
 * test (`lock.concurrency.test.ts`). Not a library module and not a test
 * itself — spawned as `tsx lock-contender-fixture.ts <lockPath> <holdMs>`.
 * Prints exactly one line: `ACQUIRED` or `BLOCKED:<message>`.
 */
import { acquireLock, LockHeldError } from './lock';

async function main(): Promise<void> {
  const [, , lockPath, holdMsRaw] = process.argv;
  const holdMs = Number.parseInt(holdMsRaw ?? '200', 10);

  try {
    const lock = acquireLock(lockPath);
    console.log('ACQUIRED');
    await new Promise((resolve) => setTimeout(resolve, holdMs));
    lock.release();
  } catch (err) {
    if (err instanceof LockHeldError) {
      console.log(`BLOCKED:${err.message}`);
    } else {
      console.log(`ERROR:${(err as Error).message}`);
      process.exitCode = 1;
    }
  }
}

void main();
