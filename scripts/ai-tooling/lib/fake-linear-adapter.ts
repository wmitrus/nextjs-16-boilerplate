/**
 * In-memory `LinearAdapter` for tests. Deliberately reproduces the real,
 * observed Linear search behavior (broad/tokenized, not exact-substring —
 * see OZI-28 "Empirical finding") rather than a convenient exact-match
 * stub, so core logic is exercised against the same imprecision the real
 * adapter has.
 */

import type {
  CreateIssueInput,
  LinearAdapter,
  LinearIssueSummary,
} from './types';

export class FakeLinearAdapter implements LinearAdapter {
  private issues: LinearIssueSummary[] = [];

  private nextId = 40;

  /** Test setup helper: seed an existing issue directly. */
  seed(issue: LinearIssueSummary): void {
    this.issues.push(issue);
  }

  async searchCandidates(query: string): Promise<LinearIssueSummary[]> {
    // Reproduce the empirically observed broad-match behavior: split the
    // query into alphanumeric tokens and return any issue whose description
    // contains ANY token of length >= 3 — this is what caused the 5-result
    // false positive for a full "INBOX-20260825-143501-a1b2" query in the
    // real Linear project search (OZI-28).
    const tokens = query.split(/[^A-Za-z0-9]+/).filter((t) => t.length >= 3);
    return this.issues.filter((issue) =>
      tokens.some(
        (t) =>
          issue.description.includes(t) ||
          issue.title.toLowerCase().includes(t.toLowerCase()),
      ),
    );
  }

  async getIssue(id: string): Promise<LinearIssueSummary | null> {
    return this.issues.find((i) => i.id === id) ?? null;
  }

  async createIssue(input: CreateIssueInput): Promise<LinearIssueSummary> {
    const id = `OZI-${this.nextId}`;
    this.nextId += 1;
    const issue: LinearIssueSummary = {
      id,
      title: input.title,
      description: input.description,
    };
    this.issues.push(issue);
    return issue;
  }
}
