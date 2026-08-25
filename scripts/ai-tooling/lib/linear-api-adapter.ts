/**
 * Real `LinearAdapter` implementation against Linear's public GraphQL API
 * (`https://api.linear.app/graphql`), authenticated with a personal API key.
 *
 * Why this and not the Claude Code `linear-server` MCP connection: that MCP
 * server is configured as a remote HTTP endpoint
 * (`https://mcp.linear.app/mcp`) authorized via this Claude Code session's
 * own OAuth — it is bound to the interactive agent session, not something a
 * separately spawned `tsx` process can dial into. Linear's GraphQL API with
 * a personal API key is the supported, documented integration path for a
 * standalone script, and needs no new kind of secret: it follows the exact
 * local-only `.env.<tool>` convention this repo already uses for Leantime
 * (`.env.leantime`, `node --env-file-if-exists=.env.leantime --import tsx ...`).
 *
 * This adapter is implemented for completeness of the reconciliation
 * boundary but has NOT been exercised against real Linear in this session —
 * no `LINEAR_API_KEY` was configured, and a live run requires separate,
 * explicit confirmation per the OZI-36 task contract.
 */

import type {
  CreateIssueInput,
  LinearAdapter,
  LinearIssueSummary,
} from './types';

const LINEAR_GRAPHQL_ENDPOINT = 'https://api.linear.app/graphql';

type GraphQLIssueNode = {
  identifier: string;
  title: string;
  description: string | null;
};

export class LinearApiAdapter implements LinearAdapter {
  private labelIdByName: Map<string, string> | null = null;

  constructor(
    private readonly apiKey: string,
    private readonly teamId: string,
    private readonly projectId: string,
  ) {}

  private async request<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(LINEAR_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.apiKey,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(
        `Linear API request failed: ${response.status} ${response.statusText}`,
      );
    }

    const body = (await response.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };
    if (body.errors && body.errors.length > 0) {
      throw new Error(
        `Linear API error: ${body.errors.map((e) => e.message).join('; ')}`,
      );
    }
    if (!body.data) {
      throw new Error('Linear API returned no data.');
    }
    return body.data;
  }

  async searchCandidates(query: string): Promise<LinearIssueSummary[]> {
    // NOTE: `issueSearch` is deprecated on Linear's current GraphQL schema
    // (confirmed live: returns a hard "deprecated" error) — `searchIssues`
    // is the current replacement. Verified live against this repo's own
    // Linear project during OZI-36 integration validation: `searchIssues`
    // is just as coarse/non-exact as the original empirical finding showed
    // (a full Inbox ID term returned 7 results, not 1) — Tier-2 literal
    // verification in duplicate.ts remains load-bearing, unchanged.
    const data = await this.request<{
      searchIssues: { nodes: GraphQLIssueNode[] };
    }>(
      `query($term: String!, $projectId: ID) {
        searchIssues(term: $term, filter: { project: { id: { eq: $projectId } } }) {
          nodes { identifier title description }
        }
      }`,
      { term: query, projectId: this.projectId },
    );
    return data.searchIssues.nodes.map((n) => ({
      id: n.identifier,
      title: n.title,
      description: n.description ?? '',
    }));
  }

  async getIssue(id: string): Promise<LinearIssueSummary | null> {
    try {
      const data = await this.request<{ issue: GraphQLIssueNode }>(
        `query($id: String!) { issue(id: $id) { identifier title description } }`,
        { id },
      );
      return {
        id: data.issue.identifier,
        title: data.issue.title,
        description: data.issue.description ?? '',
      };
    } catch {
      return null;
    }
  }

  /**
   * Linear's `IssueCreateInput.labelIds` takes label UUIDs, not names —
   * confirmed via live schema introspection during OZI-36 integration
   * validation (an earlier version of this method silently omitted labels
   * entirely). Resolved once per adapter instance and cached; an allowlisted
   * name that doesn't resolve to a real team label is silently dropped
   * rather than failing the create — labels are metadata, not a correctness
   * gate.
   */
  private async resolveLabelIds(
    names: string[] | undefined,
  ): Promise<string[] | undefined> {
    if (!names || names.length === 0) return undefined;
    if (!this.labelIdByName) {
      const data = await this.request<{
        team: { labels: { nodes: Array<{ id: string; name: string }> } };
      }>(
        `query($teamId: String!) { team(id: $teamId) { labels { nodes { id name } } } }`,
        { teamId: this.teamId },
      );
      this.labelIdByName = new Map(
        data.team.labels.nodes.map((l) => [l.name, l.id]),
      );
    }
    const ids = names
      .map((name) => this.labelIdByName?.get(name))
      .filter((id): id is string => id !== undefined);
    return ids.length > 0 ? ids : undefined;
  }

  async createIssue(input: CreateIssueInput): Promise<LinearIssueSummary> {
    const labelIds = await this.resolveLabelIds(input.labels);
    const data = await this.request<{
      issueCreate: { issue: GraphQLIssueNode };
    }>(
      `mutation($input: IssueCreateInput!) {
        issueCreate(input: $input) { issue { identifier title description } }
      }`,
      {
        input: {
          title: input.title,
          description: input.description,
          teamId: this.teamId,
          projectId: this.projectId,
          priority: input.priority,
          labelIds,
        },
      },
    );
    const issue = data.issueCreate.issue;
    return {
      id: issue.identifier,
      title: issue.title,
      description: issue.description ?? '',
    };
  }
}

/** Reads `LINEAR_API_KEY`/`LINEAR_TEAM_ID`/`LINEAR_PROJECT_ID` — never a computed/dynamic env lookup. */
export function linearApiAdapterFromEnv(): LinearApiAdapter | null {
  const apiKey = process.env.LINEAR_API_KEY;
  const teamId = process.env.LINEAR_TEAM_ID;
  const projectId = process.env.LINEAR_PROJECT_ID;
  if (!apiKey || !teamId || !projectId) return null;
  return new LinearApiAdapter(apiKey, teamId, projectId);
}
