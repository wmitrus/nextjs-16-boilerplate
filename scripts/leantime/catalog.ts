import type { LeantimeConfig } from './lib';
import { asRecord, runLeantimeRpc, withDefaultEntityIds } from './lib';

export interface OperationContext {
  config: LeantimeConfig;
  input: unknown;
}

export interface OperationDefinition {
  category:
    | 'composite'
    | 'files'
    | 'goals'
    | 'lookup'
    | 'projects'
    | 'reports'
    | 'tasks'
    | 'time'
    | 'wiki';
  description: string;
  execute: (context: OperationContext) => Promise<unknown>;
  id: string;
  title: string;
}

function requireId(record: Record<string, unknown>, key = 'id'): number {
  if (!Object.hasOwn(record, key)) {
    throw new Error(`"${key}" must be a positive integer.`);
  }

  // eslint-disable-next-line security/detect-object-injection -- key is a validated local CLI field name
  const value = record[key];
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`"${key}" must be a positive integer.`);
  }

  return numeric;
}

function getOptionalPositiveInt(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  if (!Object.hasOwn(record, key)) {
    return undefined;
  }

  // eslint-disable-next-line security/detect-object-injection -- key is a validated local CLI field name
  const value = record[key];
  if (value === undefined || value === null || value === '') return undefined;

  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`"${key}" must be a positive integer when provided.`);
  }

  return numeric;
}

function getRecordField(
  record: Record<string, unknown>,
  key: string,
  fallbackKeys: string[] = [],
): Record<string, unknown> | undefined {
  if (!Object.hasOwn(record, key)) {
    for (const fallbackKey of fallbackKeys) {
      if (!Object.hasOwn(record, fallbackKey)) {
        continue;
      }

      // eslint-disable-next-line security/detect-object-injection -- fallbackKey is selected from a local static list
      const candidate = record[fallbackKey];
      if (candidate !== undefined) {
        return asRecord(candidate, `"${fallbackKey}"`);
      }
    }

    return undefined;
  }

  // eslint-disable-next-line security/detect-object-injection -- key is a validated local CLI field name
  const direct = record[key];
  if (direct !== undefined) {
    return asRecord(direct, `"${key}"`);
  }

  return undefined;
}

function normalizeWikiPayload(
  input: Record<string, unknown>,
  config: LeantimeConfig,
): Record<string, unknown> {
  const wiki = getRecordField(input, 'wiki');
  return withDefaultEntityIds(wiki ?? input, config);
}

function normalizeArticlePayload(
  input: Record<string, unknown>,
  config: LeantimeConfig,
): Record<string, unknown> {
  const article = getRecordField(input, 'article');
  const normalized = withDefaultEntityIds(article ?? input, config);

  if (normalized.parent === undefined) {
    normalized.parent = 0;
  }

  if (normalized.status === undefined) {
    normalized.status = 'published';
  }

  return normalized;
}

function buildSubtaskValues(
  input: Record<string, unknown>,
  parentTicket: Record<string, unknown>,
): Record<string, unknown> {
  const values = { ...input };
  delete values.parentTicketId;
  delete values.subtaskId;

  if (values.headline === undefined || values.headline === '') {
    throw new Error('"headline" is required for subtask.upsert.');
  }

  return {
    ...values,
    dependingTicketId: parentTicket.id,
    id: input.subtaskId,
    milestoneid: parentTicket.milestoneid ?? '',
    projectId: parentTicket.projectId,
    type: 'subtask',
  };
}

function buildArticleBody(title: string, sections: string[]): string {
  return [`# ${title}`, '', ...sections].join('\n');
}

const OPERATIONS: OperationDefinition[] = [
  {
    id: 'users.list',
    title: 'List Users',
    category: 'lookup',
    description: 'List users available to the current API identity.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'users.list input');
      return runLeantimeRpc(config, 'leantime.rpc.Users.Users.getAll', {
        activeOnly: record.activeOnly ?? false,
      });
    },
  },
  {
    id: 'users.get',
    title: 'Get User',
    category: 'lookup',
    description: 'Fetch one user by id.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'users.get input');
      return runLeantimeRpc(config, 'leantime.rpc.Users.Users.getUser', {
        id: requireId(record),
      });
    },
  },
  {
    id: 'clients.list',
    title: 'List Clients',
    category: 'lookup',
    description: 'List clients visible to the current API identity.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'clients.list input');
      return runLeantimeRpc(config, 'leantime.rpc.Clients.Clients.getAll', {
        searchparams: Array.isArray(record.searchparams)
          ? record.searchparams
          : [],
      });
    },
  },
  {
    id: 'clients.create',
    title: 'Create Client',
    category: 'lookup',
    description: 'Create a client record for project grouping.',
    execute: async ({ config, input }) => {
      const record = withDefaultEntityIds(
        asRecord(input, 'clients.create input'),
        config,
      );
      return runLeantimeRpc(config, 'leantime.rpc.Clients.Clients.create', {
        values: record,
      });
    },
  },
  {
    id: 'projects.list',
    title: 'List Projects',
    category: 'projects',
    description: 'List projects available to the current API identity.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'projects.list input');
      return runLeantimeRpc(config, 'leantime.rpc.Projects.Projects.getAll', {
        showClosedProjects: record.showClosedProjects ?? false,
      });
    },
  },
  {
    id: 'projects.find',
    title: 'Find Project',
    category: 'projects',
    description: 'Search projects by name fragment.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'projects.find input');
      return runLeantimeRpc(
        config,
        'leantime.rpc.Projects.Projects.findProject',
        {
          term: String(record.term ?? ''),
        },
      );
    },
  },
  {
    id: 'project.get',
    title: 'Get Project',
    category: 'projects',
    description: 'Fetch one project by id.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'project.get input');
      return runLeantimeRpc(
        config,
        'leantime.rpc.Projects.Projects.getProject',
        {
          id: requireId(record),
        },
      );
    },
  },
  {
    id: 'project.create',
    title: 'Create Project',
    category: 'projects',
    description: 'Create a project with budgets, assignments, and dates.',
    execute: async ({ config, input }) => {
      const record = withDefaultEntityIds(
        asRecord(input, 'project.create input'),
        config,
      );
      return runLeantimeRpc(
        config,
        'leantime.rpc.Projects.Projects.addProject',
        { values: record },
      );
    },
  },
  {
    id: 'project.patch',
    title: 'Patch Project',
    category: 'projects',
    description:
      'Patch selected project fields with a low-blast-radius update.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'project.patch input');
      const params = getRecordField(record, 'params', ['fields']);

      if (!params) {
        throw new Error(
          'project.patch requires a "params" or "fields" object.',
        );
      }

      return runLeantimeRpc(config, 'leantime.rpc.Projects.Projects.patch', {
        id: requireId(record),
        params,
      });
    },
  },
  {
    id: 'tasks.list',
    title: 'List Tasks',
    category: 'tasks',
    description: 'Query tasks using Leantime ticket search criteria.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'tasks.list input');
      const searchCriteria =
        getRecordField(record, 'searchCriteria', ['filters']) ?? null;

      return runLeantimeRpc(config, 'leantime.rpc.Tickets.Tickets.getAll', {
        limit: getOptionalPositiveInt(record, 'limit'),
        searchCriteria,
      });
    },
  },
  {
    id: 'task.get',
    title: 'Get Task',
    category: 'tasks',
    description: 'Fetch one task or milestone by id.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'task.get input');
      return runLeantimeRpc(config, 'leantime.rpc.Tickets.Tickets.getTicket', {
        id: requireId(record),
      });
    },
  },
  {
    id: 'task.create',
    title: 'Create Task',
    category: 'tasks',
    description:
      'Create a fully described task with dates, estimates, tags, and acceptance criteria.',
    execute: async ({ config, input }) => {
      const record = withDefaultEntityIds(
        asRecord(input, 'task.create input'),
        config,
      );
      return runLeantimeRpc(config, 'leantime.rpc.Tickets.Tickets.addTicket', {
        values: record,
      });
    },
  },
  {
    id: 'task.update',
    title: 'Update Task',
    category: 'tasks',
    description: 'Update a task with the full Leantime ticket payload.',
    execute: async ({ config, input }) => {
      const record = withDefaultEntityIds(
        asRecord(input, 'task.update input'),
        config,
      );
      return runLeantimeRpc(
        config,
        'leantime.rpc.Tickets.Tickets.updateTicket',
        { values: record },
      );
    },
  },
  {
    id: 'task.patch',
    title: 'Patch Task',
    category: 'tasks',
    description:
      'Patch selected task fields without sending a full ticket body.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'task.patch input');
      const params = getRecordField(record, 'params', ['fields']);

      if (!params) {
        throw new Error('task.patch requires a "params" or "fields" object.');
      }

      return runLeantimeRpc(config, 'leantime.rpc.Tickets.Tickets.patch', {
        id: requireId(record),
        params,
      });
    },
  },
  {
    id: 'subtask.upsert',
    title: 'Upsert Subtask',
    category: 'tasks',
    description:
      'Create or update a subtask while inheriting the parent ticket project and milestone context.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'subtask.upsert input');
      const parentTicketId = requireId(record, 'parentTicketId');
      const parentTicket = asRecord(
        await runLeantimeRpc(config, 'leantime.rpc.Tickets.Tickets.getTicket', {
          id: parentTicketId,
        }),
        'parent ticket',
      );
      const values = buildSubtaskValues(record, parentTicket);

      if (values.id !== undefined && values.id !== null && values.id !== '') {
        return runLeantimeRpc(
          config,
          'leantime.rpc.Tickets.Tickets.updateTicket',
          { values },
        );
      }

      return runLeantimeRpc(config, 'leantime.rpc.Tickets.Tickets.addTicket', {
        values,
      });
    },
  },
  {
    id: 'milestone.create',
    title: 'Create Milestone',
    category: 'tasks',
    description: 'Create a milestone for a project roadmap.',
    execute: async ({ config, input }) => {
      const record = withDefaultEntityIds(
        asRecord(input, 'milestone.create input'),
        config,
      );
      return runLeantimeRpc(
        config,
        'leantime.rpc.Tickets.Tickets.quickAddMilestone',
        { params: record },
      );
    },
  },
  {
    id: 'milestones.list',
    title: 'List Milestones',
    category: 'tasks',
    description:
      'List milestones using Leantime ticket milestone search criteria.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'milestones.list input');
      const searchCriteria =
        getRecordField(record, 'searchCriteria', ['filters']) ?? {};

      return runLeantimeRpc(
        config,
        'leantime.rpc.Tickets.Tickets.getAllMilestones',
        {
          searchCriteria,
          sortBy: record.sortBy ?? 'standard',
        },
      );
    },
  },
  {
    id: 'goals.list',
    title: 'List Goals',
    category: 'goals',
    description: 'Poll goals for a project or board.',
    execute: async ({ config, input }) => {
      const record = withDefaultEntityIds(
        asRecord(input, 'goals.list input'),
        config,
      );
      return runLeantimeRpc(
        config,
        'leantime.rpc.Goalcanvas.Goalcanvas.pollGoals',
        {
          board: getOptionalPositiveInt(record, 'board'),
          projectId:
            getOptionalPositiveInt(record, 'projectId') ??
            config.defaultProjectId,
        },
      );
    },
  },
  {
    id: 'goal.create',
    title: 'Create Goal',
    category: 'goals',
    description: 'Create a goal or KPI entry in Goal Canvas.',
    execute: async ({ config, input }) => {
      const record = withDefaultEntityIds(
        asRecord(input, 'goal.create input'),
        config,
      );
      return runLeantimeRpc(
        config,
        'leantime.rpc.Goalcanvas.Goalcanvas.createGoal',
        { values: record },
      );
    },
  },
  {
    id: 'wiki.list',
    title: 'List Wikis',
    category: 'wiki',
    description: 'List wiki spaces for a project.',
    execute: async ({ config, input }) => {
      const record = withDefaultEntityIds(
        asRecord(input, 'wiki.list input'),
        config,
      );
      return runLeantimeRpc(
        config,
        'leantime.rpc.Wiki.Wiki.getAllProjectWikis',
        {
          projectId:
            getOptionalPositiveInt(record, 'projectId') ??
            config.defaultProjectId,
        },
      );
    },
  },
  {
    id: 'wiki.get',
    title: 'Get Wiki',
    category: 'wiki',
    description: 'Fetch one wiki space by id.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'wiki.get input');
      return runLeantimeRpc(config, 'leantime.rpc.Wiki.Wiki.getWiki', {
        id: requireId(record),
      });
    },
  },
  {
    id: 'wiki.create',
    title: 'Create Wiki',
    category: 'wiki',
    description:
      'Create a wiki space for specs, runbooks, or retrospective notes.',
    execute: async ({ config, input }) => {
      return runLeantimeRpc(config, 'leantime.rpc.Wiki.Wiki.createWiki', {
        wiki: normalizeWikiPayload(
          asRecord(input, 'wiki.create input'),
          config,
        ),
      });
    },
  },
  {
    id: 'wiki.article.get',
    title: 'Get Wiki Article',
    category: 'wiki',
    description: 'Fetch one wiki article by article id.',
    execute: async ({ config, input }) => {
      const record = withDefaultEntityIds(
        asRecord(input, 'wiki.article.get input'),
        config,
      );
      return runLeantimeRpc(config, 'leantime.rpc.Wiki.Wiki.getArticle', {
        id: requireId(record),
        projectId:
          getOptionalPositiveInt(record, 'projectId') ??
          config.defaultProjectId,
      });
    },
  },
  {
    id: 'wiki.article.create',
    title: 'Create Wiki Article',
    category: 'wiki',
    description: 'Create a wiki article with structured project knowledge.',
    execute: async ({ config, input }) => {
      return runLeantimeRpc(config, 'leantime.rpc.Wiki.Wiki.createArticle', {
        article: normalizeArticlePayload(
          asRecord(input, 'wiki.article.create input'),
          config,
        ),
      });
    },
  },
  {
    id: 'wiki.article.update',
    title: 'Update Wiki Article',
    category: 'wiki',
    description: 'Update a wiki article body, metadata, or milestone linkage.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'wiki.article.update input');
      const article = normalizeArticlePayload(record, config);
      const payload: Record<string, unknown> = { article };

      if (record.existingArticle !== undefined) {
        payload.existingArticle = record.existingArticle;
      }

      return runLeantimeRpc(
        config,
        'leantime.rpc.Wiki.Wiki.updateArticle',
        payload,
      );
    },
  },
  {
    id: 'files.list',
    title: 'List Files',
    category: 'files',
    description:
      'List files attached to a project, task, wiki, or other module entity.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'files.list input');

      if (typeof record.module !== 'string' || record.module.trim() === '') {
        throw new Error('"module" is required for files.list.');
      }

      return runLeantimeRpc(
        config,
        'leantime.rpc.Files.Files.getFilesByModule',
        {
          entityId: record.entityId,
          module: record.module.trim(),
          userId: record.userId,
        },
      );
    },
  },
  {
    id: 'time.log',
    title: 'Log Time',
    category: 'time',
    description: 'Log time against a ticket or task.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'time.log input');
      const ticketId = requireId(record, 'ticketId');
      const params = { ...record };
      delete params.ticketId;

      return runLeantimeRpc(
        config,
        'leantime.rpc.Timesheets.Timesheets.logTime',
        { params, ticketId },
      );
    },
  },
  {
    id: 'reports.full',
    title: 'Full Project Report',
    category: 'reports',
    description: 'Fetch Leantime full report data for a project.',
    execute: async ({ config, input }) => {
      const record = withDefaultEntityIds(
        asRecord(input, 'reports.full input'),
        config,
      );
      return runLeantimeRpc(
        config,
        'leantime.rpc.Reports.Reports.getFullReport',
        {
          projectId:
            getOptionalPositiveInt(record, 'projectId') ??
            config.defaultProjectId,
        },
      );
    },
  },
  {
    id: 'reports.realtime',
    title: 'Realtime Project Report',
    category: 'reports',
    description:
      'Fetch real-time project report data for a sprint or backlog slice.',
    execute: async ({ config, input }) => {
      const record = withDefaultEntityIds(
        asRecord(input, 'reports.realtime input'),
        config,
      );
      return runLeantimeRpc(
        config,
        'leantime.rpc.Reports.Reports.getRealtimeReport',
        {
          projectId:
            getOptionalPositiveInt(record, 'projectId') ??
            config.defaultProjectId,
          sprintId: record.sprintId,
        },
      );
    },
  },
  {
    id: 'initiative.kickoff',
    title: 'Kick Off Initiative',
    category: 'composite',
    description:
      'Create a milestone, goals, wiki space, starter articles, and initial tasks for a feature or initiative.',
    execute: async ({ config, input }) => {
      const record = withDefaultEntityIds(
        asRecord(input, 'initiative.kickoff input'),
        config,
      );
      const projectId =
        getOptionalPositiveInt(record, 'projectId') ?? config.defaultProjectId;

      if (!projectId) {
        throw new Error(
          'initiative.kickoff requires "projectId" or LEANTIME_DEFAULT_PROJECT_ID.',
        );
      }

      const authorId =
        getOptionalPositiveInt(record, 'author') ??
        getOptionalPositiveInt(record, 'authorId') ??
        config.defaultAuthorId;

      const name =
        typeof record.name === 'string' && record.name.trim() !== ''
          ? record.name.trim()
          : 'Initiative';

      const created: {
        goals: unknown[];
        milestone?: unknown;
        tasks: unknown[];
        wiki?: unknown;
        wikiArticles: unknown[];
      } = {
        goals: [],
        tasks: [],
        wikiArticles: [],
      };

      const summary: Record<string, unknown> = {
        created,
        initiative: name,
        projectId,
      };

      const milestoneInput =
        getRecordField(record, 'milestone') ??
        ({
          headline: `${name} Milestone`,
          projectId,
        } satisfies Record<string, unknown>);

      created.milestone = await runLeantimeRpc(
        config,
        'leantime.rpc.Tickets.Tickets.quickAddMilestone',
        {
          params: withDefaultEntityIds(milestoneInput, config),
        },
      );

      const goals = Array.isArray(record.goals) ? record.goals : [];
      for (const rawGoal of goals) {
        const goal = withDefaultEntityIds(
          asRecord(rawGoal, 'initiative goal'),
          config,
        );
        goal.projectId = goal.projectId ?? projectId;

        const createdGoal = await runLeantimeRpc(
          config,
          'leantime.rpc.Goalcanvas.Goalcanvas.createGoal',
          { values: goal },
        );

        created.goals.push(createdGoal);
      }

      const wikiInput =
        getRecordField(record, 'wiki') ??
        ({
          author: authorId,
          projectId,
          title: `${name} Knowledge Base`,
        } satisfies Record<string, unknown>);
      const wikiId = await runLeantimeRpc(
        config,
        'leantime.rpc.Wiki.Wiki.createWiki',
        { wiki: withDefaultEntityIds(wikiInput, config) },
      );
      created.wiki = wikiId;

      const starterArticles = [
        {
          data: buildArticleBody('Project Brief', [
            '## Objective',
            '',
            'State the user value, desired outcome, and expected scope.',
            '',
            '## Success Signals',
            '',
            '- Primary outcome',
            '- Secondary outcome',
            '- Risks to watch',
          ]),
          description: 'High-level context and acceptance framing.',
          title: `${name} Project Brief`,
        },
        {
          data: buildArticleBody('Implementation Notes', [
            '## Context',
            '',
            'Capture implementation decisions, constraints, and links to work items.',
            '',
            '## Useful Discoveries',
            '',
            '- Known edge cases',
            '- Follow-up ideas',
            '- AI-agent learnings',
          ]),
          description: 'Running implementation notes for the initiative.',
          title: `${name} Implementation Notes`,
        },
        {
          data: buildArticleBody('Retrospective', [
            '## Continue',
            '',
            '- What went well?',
            '',
            '## Stop',
            '',
            '- What should stop?',
            '',
            '## Start',
            '',
            '- What should start next?',
          ]),
          description: 'Continue / Stop / Start retrospective workspace.',
          title: `${name} Retrospective`,
        },
      ];

      for (const article of starterArticles) {
        const createdArticle = await runLeantimeRpc(
          config,
          'leantime.rpc.Wiki.Wiki.createArticle',
          {
            article: {
              author: authorId,
              canvasId: wikiId,
              parent: 0,
              projectId,
              status: 'published',
              tags: '',
              ...article,
            },
          },
        );

        created.wikiArticles.push(createdArticle);
      }

      const tasks = Array.isArray(record.tasks) ? record.tasks : [];
      for (const rawTask of tasks) {
        const task = withDefaultEntityIds(
          asRecord(rawTask, 'initiative task'),
          config,
        );
        task.projectId = task.projectId ?? projectId;

        const createdTask = await runLeantimeRpc(
          config,
          'leantime.rpc.Tickets.Tickets.addTicket',
          { values: task },
        );

        created.tasks.push(createdTask);
      }

      return summary;
    },
  },
];

const OPERATION_INDEX = new Map(
  OPERATIONS.map((operation) => [operation.id, operation]),
);

export function listOperationRows(): Array<Record<string, string>> {
  return OPERATIONS.map((operation) => ({
    category: operation.category,
    description: operation.description,
    id: operation.id,
    title: operation.title,
  }));
}

export function getOperation(id: string): OperationDefinition {
  const operation = OPERATION_INDEX.get(id);

  if (!operation) {
    throw new Error(
      `Unknown Leantime operation "${id}". Run \`pnpm lt -- list\` to see the catalog.`,
    );
  }

  return operation;
}

export async function executeOperation(
  id: string,
  context: OperationContext,
): Promise<unknown> {
  return getOperation(id).execute(context);
}
