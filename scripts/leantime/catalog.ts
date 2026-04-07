import type { LeantimeConfig } from './lib';
import { asRecord, runLeantimeRpc, withDefaultEntityIds } from './lib';

const IDEA_STATUS_KEYS = [
  'idea',
  'research',
  'prototype',
  'validation',
  'implemented',
  'deferred',
] as const;

type IdeaStatusKey = (typeof IDEA_STATUS_KEYS)[number];

const BLUEPRINT_BOARD_TYPES = [
  'value',
  'risks',
  'swot',
  'obm',
  'lean',
] as const;

type BlueprintBoardType = (typeof BLUEPRINT_BOARD_TYPES)[number];

export interface OperationContext {
  config: LeantimeConfig;
  input: unknown;
}

export interface OperationDefinition {
  category:
    | 'blueprints'
    | 'composite'
    | 'files'
    | 'goals'
    | 'ideas'
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

  // eslint-disable-next-line security/detect-object-injection -- key is selected by local wrapper code and guarded with Object.hasOwn before lookup
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

function requireIdInput(input: unknown, context: string, key = 'id'): number {
  if (typeof input === 'number') {
    if (Number.isInteger(input) && input > 0) {
      return input;
    }

    throw new Error(`"${key}" must be a positive integer.`);
  }

  if (typeof input === 'string') {
    const numeric = Number.parseInt(input.trim(), 10);

    if (Number.isInteger(numeric) && numeric > 0) {
      return numeric;
    }

    throw new Error(`"${key}" must be a positive integer.`);
  }

  return requireId(asRecord(input, context), key);
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

function getOptionalNonNegativeInt(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  if (!Object.hasOwn(record, key)) {
    return undefined;
  }

  // eslint-disable-next-line security/detect-object-injection -- key is selected by local wrapper code and guarded with Object.hasOwn before lookup
  const value = record[key];
  if (value === undefined || value === null || value === '') return undefined;

  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isInteger(numeric) || numeric < 0) {
    throw new Error(`"${key}" must be a non-negative integer when provided.`);
  }

  return numeric;
}

function getOptionalBoolean(
  record: Record<string, unknown>,
  key: string,
): boolean | undefined {
  if (!Object.hasOwn(record, key)) {
    return undefined;
  }

  // eslint-disable-next-line security/detect-object-injection -- key is selected by local wrapper code and guarded with Object.hasOwn before lookup
  const value = record[key];

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['1', 'true', 'yes'].includes(normalized)) return true;
    if (['0', 'false', 'no'].includes(normalized)) return false;
  }

  throw new Error(`"${key}" must be a boolean when provided.`);
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

  if (
    normalized.title === undefined &&
    typeof normalized.headline === 'string' &&
    normalized.headline.trim() !== ''
  ) {
    normalized.title = normalized.headline.trim();
  }

  if (
    normalized.description === undefined &&
    typeof normalized.content === 'string'
  ) {
    normalized.description = normalized.content;
  }

  if (normalized.canvasId === undefined) {
    if (normalized.wikiId !== undefined) {
      normalized.canvasId = normalized.wikiId;
    } else if (normalized.wiki !== undefined) {
      normalized.canvasId = normalized.wiki;
    }
  }

  if (
    normalized.milestoneId === undefined &&
    normalized.milestoneid !== undefined
  ) {
    normalized.milestoneId = normalized.milestoneid;
  }

  if (normalized.parent === undefined) {
    normalized.parent = 0;
  }

  if (normalized.status === undefined) {
    normalized.status = 'published';
  }

  delete normalized.content;
  delete normalized.headline;
  delete normalized.wiki;
  delete normalized.wikiId;
  delete normalized.milestoneid;

  return normalized;
}

function normalizeGoalBoardPayload(
  input: Record<string, unknown>,
  config: LeantimeConfig,
): Record<string, unknown> {
  const board = withDefaultEntityIds(input, config);

  if (
    board.title === undefined &&
    typeof board.headline === 'string' &&
    board.headline.trim() !== ''
  ) {
    board.title = board.headline.trim();
  }

  delete board.headline;

  return board;
}

function normalizeGoalPayload(
  input: Record<string, unknown>,
  config: LeantimeConfig,
): Record<string, unknown> {
  const goal = withDefaultEntityIds(input, config);

  if (
    goal.title === undefined &&
    typeof goal.headline === 'string' &&
    goal.headline.trim() !== ''
  ) {
    goal.title = goal.headline.trim();
  }

  if (goal.canvasId === undefined) {
    if (goal.boardId !== undefined) {
      goal.canvasId = goal.boardId;
    } else if (goal.board !== undefined) {
      goal.canvasId = goal.board;
    }
  }

  if (goal.milestoneId === undefined && goal.milestoneid !== undefined) {
    goal.milestoneId = goal.milestoneid;
  }

  if (goal.box === undefined) {
    goal.box = 'goal';
  }

  if (goal.status === undefined) {
    goal.status = 'status_ontrack';
  }

  delete goal.headline;
  delete goal.board;
  delete goal.boardId;
  delete goal.goalBoard;
  delete goal.goalBoardTitle;
  delete goal.boardTitle;
  delete goal.milestoneid;

  return goal;
}

async function resolveGoalBoardId(
  config: LeantimeConfig,
  input: Record<string, unknown>,
  fallbackProjectId?: number,
  fallbackAuthorId?: number,
): Promise<number> {
  const directBoardId =
    getOptionalPositiveInt(input, 'canvasId') ??
    getOptionalPositiveInt(input, 'boardId') ??
    getOptionalPositiveInt(input, 'board');

  if (directBoardId) {
    return directBoardId;
  }

  const boardInput =
    getRecordField(input, 'goalBoard', ['board']) ??
    (typeof input.goalBoardTitle === 'string' &&
    input.goalBoardTitle.trim() !== ''
      ? {
          author: fallbackAuthorId,
          description: '',
          projectId: fallbackProjectId,
          title: input.goalBoardTitle.trim(),
        }
      : typeof input.boardTitle === 'string' && input.boardTitle.trim() !== ''
        ? {
            author: fallbackAuthorId,
            description: '',
            projectId: fallbackProjectId,
            title: input.boardTitle.trim(),
          }
        : undefined);

  if (!boardInput) {
    throw new Error(
      'Goal operations require "canvasId" / "boardId" or a "goalBoard" definition.',
    );
  }

  const normalizedBoard = normalizeGoalBoardPayload(boardInput, config);
  normalizedBoard.projectId = normalizedBoard.projectId ?? fallbackProjectId;
  normalizedBoard.author = normalizedBoard.author ?? fallbackAuthorId;

  const createdBoardId = await runLeantimeRpc(
    config,
    'leantime.rpc.Goalcanvas.Goalcanvas.createGoalboard',
    {
      values: normalizedBoard,
    },
  );

  const boardIdCandidate = Array.isArray(createdBoardId)
    ? createdBoardId[0]
    : createdBoardId;

  if (
    typeof boardIdCandidate === 'number' &&
    Number.isInteger(boardIdCandidate) &&
    boardIdCandidate > 0
  ) {
    return boardIdCandidate;
  }

  if (typeof boardIdCandidate === 'string') {
    const numeric = Number.parseInt(boardIdCandidate, 10);

    if (Number.isInteger(numeric) && numeric > 0) {
      return numeric;
    }
  }

  throw new Error('Failed to resolve a valid goal board id.');
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

function buildSearchCriteria(
  record: Record<string, unknown>,
  excludedKeys: string[],
): Record<string, unknown> {
  const nested = getRecordField(record, 'searchCriteria', ['filters']);

  if (nested) {
    return nested;
  }

  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !excludedKeys.includes(key)),
  );
}

function getStringValue(
  record: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    if (!Object.hasOwn(record, key)) {
      continue;
    }

    // eslint-disable-next-line security/detect-object-injection -- key is selected from local static alias lists and guarded with Object.hasOwn before lookup
    const value = record[key];
    if (typeof value !== 'string') {
      continue;
    }

    return value;
  }

  return undefined;
}

function getNonEmptyStringValue(
  record: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = getStringValue(record, [key])?.trim();

    if (value) {
      return value;
    }
  }

  return undefined;
}

function requirePositiveIdFromKeys(
  record: Record<string, unknown>,
  keys: string[],
  label: string,
): number {
  for (const key of keys) {
    const value = getOptionalPositiveInt(record, key);

    if (value !== undefined) {
      return value;
    }
  }

  throw new Error(`"${label}" must be a positive integer.`);
}

function normalizeIdeaStatusKey(
  value: string,
  fieldName: string,
): IdeaStatusKey {
  if ((IDEA_STATUS_KEYS as readonly string[]).includes(value)) {
    return value as IdeaStatusKey;
  }

  throw new Error(
    `"${fieldName}" must be one of ${IDEA_STATUS_KEYS.join(', ')}.`,
  );
}

function normalizeBlueprintBoardType(
  value: string | undefined,
  fieldName = 'boardType',
): BlueprintBoardType {
  const normalized = value?.trim() || 'value';

  if ((BLUEPRINT_BOARD_TYPES as readonly string[]).includes(normalized)) {
    return normalized as BlueprintBoardType;
  }

  throw new Error(
    `"${fieldName}" must be one of ${BLUEPRINT_BOARD_TYPES.join(', ')}.`,
  );
}

function normalizeIdeaPluginPayload(
  input: Record<string, unknown>,
  config: LeantimeConfig,
): Record<string, unknown> {
  const idea = withDefaultEntityIds(input, config);

  if (idea.canvasId === undefined) {
    if (idea.boardId !== undefined) {
      idea.canvasId = idea.boardId;
    } else if (idea.board !== undefined) {
      idea.canvasId = idea.board;
    }
  }

  if (
    idea.description === undefined &&
    typeof idea.title === 'string' &&
    idea.title.trim() !== ''
  ) {
    idea.description = idea.title.trim();
  }

  if (
    idea.description === undefined &&
    typeof idea.headline === 'string' &&
    idea.headline.trim() !== ''
  ) {
    idea.description = idea.headline.trim();
  }

  if (idea.data === undefined) {
    if (typeof idea.content === 'string') {
      idea.data = idea.content;
    } else if (typeof idea.body === 'string') {
      idea.data = idea.body;
    }
  }

  delete idea.board;
  delete idea.boardId;
  delete idea.body;
  delete idea.content;
  delete idea.headline;
  delete idea.title;

  return idea;
}

function normalizeCanvasItemPayload(
  input: Record<string, unknown>,
  config: LeantimeConfig,
): Record<string, unknown> {
  const item = withDefaultEntityIds(input, config);

  if (item.canvasId === undefined) {
    if (item.boardId !== undefined) {
      item.canvasId = item.boardId;
    } else if (item.board !== undefined) {
      item.canvasId = item.board;
    }
  }

  if (
    item.description === undefined &&
    typeof item.headline === 'string' &&
    item.headline.trim() !== ''
  ) {
    item.description = item.headline.trim();
  }

  if (
    item.description === undefined &&
    typeof item.title === 'string' &&
    item.title.trim() !== ''
  ) {
    item.description = item.title.trim();
  }

  delete item.board;
  delete item.boardId;
  delete item.boardType;
  delete item.headline;
  delete item.type;

  return item;
}

function unwrapRpcScalar<TValue>(value: TValue[] | TValue): TValue {
  if (Array.isArray(value) && value.length === 1) {
    return value[0] as TValue;
  }

  return value as TValue;
}

function normalizeCreatedId(value: unknown, label: string): number {
  const candidate = unwrapRpcScalar(value);
  const numeric =
    typeof candidate === 'number'
      ? candidate
      : typeof candidate === 'string'
        ? Number.parseInt(candidate, 10)
        : Number.NaN;

  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`Failed to resolve a valid ${label} id.`);
  }

  return numeric;
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
      return runLeantimeRpc(config, 'leantime.rpc.Users.Users.getUser', {
        id: requireIdInput(input, 'users.get input'),
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
      return runLeantimeRpc(
        config,
        'leantime.rpc.Projects.Projects.getProject',
        {
          id: requireIdInput(input, 'project.get input'),
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
      const record = withDefaultEntityIds(
        asRecord(input, 'tasks.list input'),
        config,
      );
      const searchCriteria = buildSearchCriteria(record, ['limit']);

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
      return runLeantimeRpc(config, 'leantime.rpc.Tickets.Tickets.getTicket', {
        id: requireIdInput(input, 'task.get input'),
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
      const record = withDefaultEntityIds(
        asRecord(input, 'milestones.list input'),
        config,
      );
      const searchCriteria = buildSearchCriteria(record, ['sortBy']);
      const sortBy =
        typeof record.sortBy === 'string' && record.sortBy.trim() !== ''
          ? record.sortBy
          : 'standard';

      try {
        return await runLeantimeRpc(
          config,
          'leantime.rpc.Tickets.Tickets.getAllMilestones',
          {
            searchCriteria,
            sortBy,
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (
          !message.includes('leantime.rpc.Tickets.Tickets.getAllMilestones') ||
          !message.includes('Server error')
        ) {
          throw error;
        }

        return runLeantimeRpc(
          config,
          'leantime.rpc.Tickets.Tickets.getAllMilestonesOverview',
          {
            clientId:
              getOptionalPositiveInt(record, 'clientId') ??
              config.defaultClientId ??
              0,
            includeArchived: false,
            includeTasks: false,
            sortBy,
          },
        );
      }
    },
  },
  {
    id: 'goalboard.create',
    title: 'Create Goal Board',
    category: 'goals',
    description: 'Create a Goal Canvas board before adding goal items.',
    execute: async ({ config, input }) => {
      const record = normalizeGoalBoardPayload(
        asRecord(input, 'goalboard.create input'),
        config,
      );

      return runLeantimeRpc(
        config,
        'leantime.rpc.Goalcanvas.Goalcanvas.createGoalboard',
        {
          values: record,
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
      const rawRecord = withDefaultEntityIds(
        asRecord(input, 'goal.create input'),
        config,
      );
      const projectId =
        getOptionalPositiveInt(rawRecord, 'projectId') ??
        config.defaultProjectId;
      const authorId =
        getOptionalPositiveInt(rawRecord, 'author') ??
        getOptionalPositiveInt(rawRecord, 'authorId') ??
        config.defaultAuthorId;
      const canvasId = await resolveGoalBoardId(
        config,
        rawRecord,
        projectId,
        authorId,
      );
      const record = normalizeGoalPayload(rawRecord, config);
      record.canvasId = canvasId;

      return runLeantimeRpc(
        config,
        'leantime.rpc.Goalcanvas.Goalcanvas.createGoal',
        { values: record },
      );
    },
  },
  {
    id: 'blueprints.types.list',
    title: 'List Blueprint Board Types',
    category: 'blueprints',
    description:
      'List Blueprint board types currently supported by the AutomationApi Canvas RPC surface.',
    execute: async ({ config }) => {
      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Canvas.listBoardTypes',
        {},
      );
    },
  },
  {
    id: 'blueprints.type.get',
    title: 'Get Blueprint Board Type',
    category: 'blueprints',
    description:
      'Fetch metadata for one supported Blueprint board type, including boxes and labels.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'blueprints.type.get input');
      const boardType = normalizeBlueprintBoardType(
        getStringValue(record, ['boardType', 'type']),
      );

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Canvas.getBoardType',
        { boardType },
      );
    },
  },
  {
    id: 'blueprints.board.list',
    title: 'List Blueprint Boards',
    category: 'blueprints',
    description:
      'List boards for a supported Blueprint board type through AutomationApi Canvas RPC.',
    execute: async ({ config, input }) => {
      const record = withDefaultEntityIds(
        asRecord(input, 'blueprints.board.list input'),
        config,
      );
      const projectId =
        getOptionalPositiveInt(record, 'projectId') ?? config.defaultProjectId;

      if (!projectId) {
        throw new Error('blueprints.board.list requires "projectId".');
      }

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Canvas.listBoards',
        {
          boardType: normalizeBlueprintBoardType(
            getStringValue(record, ['boardType', 'type']),
          ),
          projectId,
        },
      );
    },
  },
  {
    id: 'blueprints.board.get',
    title: 'Get Blueprint Board',
    category: 'blueprints',
    description:
      'Fetch one supported Blueprint board through AutomationApi Canvas RPC.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'blueprints.board.get input');

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Canvas.getBoard',
        {
          boardId: requirePositiveIdFromKeys(
            record,
            ['boardId', 'canvasId', 'id'],
            'boardId',
          ),
          boardType: normalizeBlueprintBoardType(
            getStringValue(record, ['boardType', 'type']),
          ),
        },
      );
    },
  },
  {
    id: 'blueprints.board.create',
    title: 'Create Blueprint Board',
    category: 'blueprints',
    description:
      'Create a supported Blueprint board through AutomationApi Canvas RPC.',
    execute: async ({ config, input }) => {
      const record = withDefaultEntityIds(
        asRecord(input, 'blueprints.board.create input'),
        config,
      );
      const title = getNonEmptyStringValue(record, [
        'title',
        'name',
        'headline',
      ]);

      if (!title) {
        throw new Error(
          'blueprints.board.create requires "title", "name", or "headline".',
        );
      }
      const projectId =
        getOptionalPositiveInt(record, 'projectId') ?? config.defaultProjectId;

      if (!projectId) {
        throw new Error('blueprints.board.create requires "projectId".');
      }

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Canvas.createBoard',
        {
          author: getOptionalPositiveInt(record, 'author'),
          boardType: normalizeBlueprintBoardType(
            getStringValue(record, ['boardType', 'type']),
          ),
          description: getStringValue(record, ['description']) ?? '',
          projectId,
          title,
        },
      );
    },
  },
  {
    id: 'blueprints.board.update',
    title: 'Update Blueprint Board',
    category: 'blueprints',
    description:
      'Update one supported Blueprint board through AutomationApi Canvas RPC.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'blueprints.board.update input');
      const title = getNonEmptyStringValue(record, [
        'title',
        'name',
        'headline',
      ]);

      if (!title) {
        throw new Error(
          'blueprints.board.update requires "title", "name", or "headline".',
        );
      }

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Canvas.updateBoard',
        {
          boardId: requirePositiveIdFromKeys(
            record,
            ['boardId', 'canvasId', 'id'],
            'boardId',
          ),
          boardType: normalizeBlueprintBoardType(
            getStringValue(record, ['boardType', 'type']),
          ),
          description: getStringValue(record, ['description']) ?? '',
          title,
        },
      );
    },
  },
  {
    id: 'blueprints.board.delete',
    title: 'Delete Blueprint Board',
    category: 'blueprints',
    description:
      'Delete one supported Blueprint board through AutomationApi Canvas RPC. Requires confirm=true.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'blueprints.board.delete input');

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Canvas.deleteBoard',
        {
          boardId: requirePositiveIdFromKeys(
            record,
            ['boardId', 'canvasId', 'id'],
            'boardId',
          ),
          boardType: normalizeBlueprintBoardType(
            getStringValue(record, ['boardType', 'type']),
          ),
          confirm: getOptionalBoolean(record, 'confirm') ?? false,
        },
      );
    },
  },
  {
    id: 'blueprints.item.list',
    title: 'List Blueprint Items',
    category: 'blueprints',
    description:
      'List items on a supported Blueprint board through AutomationApi Canvas RPC.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'blueprints.item.list input');

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Canvas.listItems',
        {
          boardId: requirePositiveIdFromKeys(
            record,
            ['boardId', 'canvasId', 'board'],
            'boardId',
          ),
          boardType: normalizeBlueprintBoardType(
            getStringValue(record, ['boardType', 'type']),
          ),
        },
      );
    },
  },
  {
    id: 'blueprints.item.get',
    title: 'Get Blueprint Item',
    category: 'blueprints',
    description:
      'Fetch one supported Blueprint item through AutomationApi Canvas RPC.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'blueprints.item.get input');

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Canvas.getItem',
        {
          boardType: normalizeBlueprintBoardType(
            getStringValue(record, ['boardType', 'type']),
          ),
          itemId: requirePositiveIdFromKeys(record, ['itemId', 'id'], 'itemId'),
        },
      );
    },
  },
  {
    id: 'blueprints.item.create',
    title: 'Create Blueprint Item',
    category: 'blueprints',
    description:
      'Create an item on a supported Blueprint board through AutomationApi Canvas RPC.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'blueprints.item.create input');

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Canvas.createItem',
        {
          boardType: normalizeBlueprintBoardType(
            getStringValue(record, ['boardType', 'type']),
          ),
          values: normalizeCanvasItemPayload(record, config),
        },
      );
    },
  },
  {
    id: 'blueprints.item.update',
    title: 'Update Blueprint Item',
    category: 'blueprints',
    description:
      'Update a supported Blueprint item through AutomationApi Canvas RPC.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'blueprints.item.update input');
      const itemId = requirePositiveIdFromKeys(
        record,
        ['itemId', 'id'],
        'itemId',
      );

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Canvas.updateItem',
        {
          boardType: normalizeBlueprintBoardType(
            getStringValue(record, ['boardType', 'type']),
          ),
          itemId,
          values: normalizeCanvasItemPayload(record, config),
        },
      );
    },
  },
  {
    id: 'blueprints.item.patch',
    title: 'Patch Blueprint Item',
    category: 'blueprints',
    description:
      'Patch selected fields on a supported Blueprint item through AutomationApi Canvas RPC.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'blueprints.item.patch input');
      const fields = getRecordField(record, 'fields', ['params']);

      if (!fields) {
        throw new Error(
          'blueprints.item.patch requires a "fields" or "params" object.',
        );
      }

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Canvas.patchItem',
        {
          boardType: normalizeBlueprintBoardType(
            getStringValue(record, ['boardType', 'type']),
          ),
          fields,
          itemId: requirePositiveIdFromKeys(record, ['itemId', 'id'], 'itemId'),
        },
      );
    },
  },
  {
    id: 'blueprints.item.delete',
    title: 'Delete Blueprint Item',
    category: 'blueprints',
    description:
      'Delete one supported Blueprint item through AutomationApi Canvas RPC. Requires confirm=true.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'blueprints.item.delete input');

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Canvas.deleteItem',
        {
          boardType: normalizeBlueprintBoardType(
            getStringValue(record, ['boardType', 'type']),
          ),
          confirm: getOptionalBoolean(record, 'confirm') ?? false,
          itemId: requirePositiveIdFromKeys(record, ['itemId', 'id'], 'itemId'),
        },
      );
    },
  },
  {
    id: 'blueprints.comment.list',
    title: 'List Blueprint Item Comments',
    category: 'blueprints',
    description:
      'List comments for a supported Blueprint item through AutomationApi Canvas RPC.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'blueprints.comment.list input');

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Canvas.listComments',
        {
          boardType: normalizeBlueprintBoardType(
            getStringValue(record, ['boardType', 'type']),
          ),
          itemId: requirePositiveIdFromKeys(record, ['itemId', 'id'], 'itemId'),
          parent: getOptionalNonNegativeInt(record, 'parent') ?? 0,
        },
      );
    },
  },
  {
    id: 'blueprints.comment.create',
    title: 'Add Blueprint Item Comment',
    category: 'blueprints',
    description:
      'Add a comment to a supported Blueprint item through AutomationApi Canvas RPC.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'blueprints.comment.create input');
      const text = getNonEmptyStringValue(record, ['text', 'comment']);

      if (!text) {
        throw new Error(
          'blueprints.comment.create requires "text" or "comment".',
        );
      }

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Canvas.createComment',
        {
          author: getOptionalPositiveInt(record, 'author'),
          boardType: normalizeBlueprintBoardType(
            getStringValue(record, ['boardType', 'type']),
          ),
          itemId: requirePositiveIdFromKeys(record, ['itemId', 'id'], 'itemId'),
          parent: getOptionalNonNegativeInt(record, 'parent') ?? 0,
          status: getStringValue(record, ['status']) ?? '',
          text,
        },
      );
    },
  },
  {
    id: 'blueprints.comment.edit',
    title: 'Edit Blueprint Item Comment',
    category: 'blueprints',
    description:
      'Edit a supported Blueprint item comment through AutomationApi Canvas RPC.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'blueprints.comment.edit input');
      const text = getNonEmptyStringValue(record, ['text', 'comment']);

      if (!text) {
        throw new Error(
          'blueprints.comment.edit requires "text" or "comment".',
        );
      }

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Canvas.editComment',
        {
          commentId: requirePositiveIdFromKeys(
            record,
            ['commentId', 'id'],
            'commentId',
          ),
          text,
        },
      );
    },
  },
  {
    id: 'blueprints.comment.delete',
    title: 'Delete Blueprint Item Comment',
    category: 'blueprints',
    description:
      'Delete a supported Blueprint item comment through AutomationApi Canvas RPC. Requires confirm=true.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'blueprints.comment.delete input');

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Canvas.deleteComment',
        {
          commentId: requirePositiveIdFromKeys(
            record,
            ['commentId', 'id'],
            'commentId',
          ),
          confirm: getOptionalBoolean(record, 'confirm') ?? false,
        },
      );
    },
  },
  {
    id: 'blueprints.milestone.create-link',
    title: 'Create And Link Milestone To Blueprint Item',
    category: 'blueprints',
    description:
      'Create a milestone and link it to a supported Blueprint item through AutomationApi Canvas RPC.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'blueprints.milestone.create-link input');
      const headline = getNonEmptyStringValue(record, [
        'newMilestone',
        'milestoneTitle',
        'title',
        'headline',
      ]);

      if (!headline) {
        throw new Error(
          'blueprints.milestone.create-link requires a milestone title.',
        );
      }

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Canvas.createAndLinkMilestone',
        {
          author: getOptionalPositiveInt(record, 'author'),
          boardType: normalizeBlueprintBoardType(
            getStringValue(record, ['boardType', 'type']),
          ),
          headline,
          itemId: requirePositiveIdFromKeys(record, ['itemId', 'id'], 'itemId'),
          values: {
            tags: getStringValue(record, ['tags']),
          },
        },
      );
    },
  },
  {
    id: 'blueprints.milestone.link-existing',
    title: 'Link Existing Milestone To Blueprint Item',
    category: 'blueprints',
    description:
      'Link an existing milestone to a supported Blueprint item through AutomationApi Canvas RPC.',
    execute: async ({ config, input }) => {
      const record = asRecord(
        input,
        'blueprints.milestone.link-existing input',
      );

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Canvas.linkMilestone',
        {
          boardType: normalizeBlueprintBoardType(
            getStringValue(record, ['boardType', 'type']),
          ),
          itemId: requirePositiveIdFromKeys(record, ['itemId', 'id'], 'itemId'),
          milestoneId: requirePositiveIdFromKeys(
            record,
            ['existingMilestoneId', 'existingMilestone', 'milestoneId'],
            'milestoneId',
          ),
        },
      );
    },
  },
  {
    id: 'blueprints.milestone.unlink',
    title: 'Unlink Milestone From Blueprint Item',
    category: 'blueprints',
    description:
      'Unlink a milestone from a supported Blueprint item through AutomationApi Canvas RPC.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'blueprints.milestone.unlink input');

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Canvas.unlinkMilestone',
        {
          boardType: normalizeBlueprintBoardType(
            getStringValue(record, ['boardType', 'type']),
          ),
          itemId: requirePositiveIdFromKeys(record, ['itemId', 'id'], 'itemId'),
        },
      );
    },
  },
  {
    id: 'ideas.board.create',
    title: 'Create Idea Board',
    category: 'ideas',
    description:
      'Create an Ideas board through the AutomationApi plugin RPC surface.',
    execute: async ({ config, input }) => {
      const record = withDefaultEntityIds(
        asRecord(input, 'ideas.board.create input'),
        config,
      );
      const boardTitle = getNonEmptyStringValue(record, [
        'canvastitle',
        'title',
        'name',
        'headline',
      ]);

      if (!boardTitle) {
        throw new Error(
          'ideas.board.create requires "canvastitle", "title", "name", or "headline".',
        );
      }
      const projectId =
        getOptionalPositiveInt(record, 'projectId') ?? config.defaultProjectId;

      if (!projectId) {
        throw new Error('ideas.board.create requires "projectId".');
      }

      const result = await runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Ideas.createBoard',
        {
          author: getOptionalPositiveInt(record, 'author'),
          projectId,
          title: boardTitle,
        },
      );
      return {
        boardId: normalizeCreatedId(result, 'idea board'),
      };
    },
  },
  {
    id: 'ideas.board.list',
    title: 'List Idea Boards',
    category: 'ideas',
    description:
      'List Ideas boards through the AutomationApi plugin RPC surface.',
    execute: async ({ config, input }) => {
      const record = withDefaultEntityIds(
        asRecord(input, 'ideas.board.list input'),
        config,
      );
      const projectId =
        getOptionalPositiveInt(record, 'projectId') ?? config.defaultProjectId;

      if (!projectId) {
        throw new Error('ideas.board.list requires "projectId".');
      }

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Ideas.listBoards',
        { projectId },
      );
    },
  },
  {
    id: 'ideas.board.get',
    title: 'Get Idea Board',
    category: 'ideas',
    description:
      'Fetch one Ideas board through the AutomationApi plugin RPC surface.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'ideas.board.get input');
      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Ideas.getBoard',
        {
          boardId: requirePositiveIdFromKeys(
            record,
            ['boardId', 'id'],
            'boardId',
          ),
        },
      );
    },
  },
  {
    id: 'ideas.board.update',
    title: 'Update Idea Board',
    category: 'ideas',
    description:
      'Rename an Ideas board through the AutomationApi plugin RPC surface.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'ideas.board.update input');
      const title = getNonEmptyStringValue(record, [
        'title',
        'name',
        'headline',
      ]);

      if (!title) {
        throw new Error(
          'ideas.board.update requires "title", "name", or "headline".',
        );
      }

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Ideas.updateBoard',
        {
          boardId: requirePositiveIdFromKeys(
            record,
            ['boardId', 'id'],
            'boardId',
          ),
          title,
        },
      );
    },
  },
  {
    id: 'ideas.board.delete',
    title: 'Delete Idea Board',
    category: 'ideas',
    description:
      'Delete an Ideas board through the AutomationApi plugin RPC surface. Requires confirm=true.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'ideas.board.delete input');
      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Ideas.deleteBoard',
        {
          boardId: requirePositiveIdFromKeys(
            record,
            ['boardId', 'id'],
            'boardId',
          ),
          confirm: getOptionalBoolean(record, 'confirm') ?? false,
        },
      );
    },
  },
  {
    id: 'ideas.get',
    title: 'Get Idea',
    category: 'ideas',
    description: 'Fetch one idea through the AutomationApi plugin RPC surface.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'ideas.get input');
      const ideaId = requirePositiveIdFromKeys(
        record,
        ['ideaId', 'id'],
        'ideaId',
      );

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Ideas.getIdea',
        {
          ideaId,
        },
      );
    },
  },
  {
    id: 'ideas.list',
    title: 'List Ideas',
    category: 'ideas',
    description:
      'List ideas for an Ideas board through the AutomationApi plugin RPC surface.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'ideas.list input');
      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Ideas.listIdeas',
        {
          boardId: requirePositiveIdFromKeys(
            record,
            ['boardId', 'canvasId', 'board'],
            'boardId',
          ),
        },
      );
    },
  },
  {
    id: 'ideas.create',
    title: 'Create Idea',
    category: 'ideas',
    description:
      'Create a new idea through the AutomationApi plugin RPC surface.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'ideas.create input');
      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Ideas.createIdea',
        {
          values: normalizeIdeaPluginPayload(record, config),
        },
      );
    },
  },
  {
    id: 'ideas.update',
    title: 'Update Idea',
    category: 'ideas',
    description:
      'Update an existing idea through the AutomationApi plugin RPC surface.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'ideas.update input');
      const ideaId = requirePositiveIdFromKeys(
        record,
        ['ideaId', 'id'],
        'ideaId',
      );
      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Ideas.updateIdea',
        {
          ideaId,
          values: normalizeIdeaPluginPayload(record, config),
        },
      );
    },
  },
  {
    id: 'ideas.delete',
    title: 'Delete Idea',
    category: 'ideas',
    description:
      'Delete an idea through the AutomationApi plugin RPC surface. Requires confirm=true.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'ideas.delete input');
      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Ideas.deleteIdea',
        {
          confirm: getOptionalBoolean(record, 'confirm') ?? false,
          ideaId: requirePositiveIdFromKeys(record, ['ideaId', 'id'], 'ideaId'),
        },
      );
    },
  },
  {
    id: 'ideas.comment.list',
    title: 'List Idea Comments',
    category: 'ideas',
    description:
      'List comments for an idea through the AutomationApi plugin RPC surface.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'ideas.comment.list input');
      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Ideas.listComments',
        {
          ideaId: requirePositiveIdFromKeys(record, ['ideaId', 'id'], 'ideaId'),
          parent: getOptionalNonNegativeInt(record, 'parent') ?? 0,
        },
      );
    },
  },
  {
    id: 'ideas.comment.create',
    title: 'Add Idea Comment',
    category: 'ideas',
    description:
      'Add a comment to an idea through the AutomationApi plugin RPC surface.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'ideas.comment.create input');
      const ideaId = requirePositiveIdFromKeys(
        record,
        ['ideaId', 'id'],
        'ideaId',
      );
      const text = getNonEmptyStringValue(record, ['text', 'comment']);

      if (!text) {
        throw new Error('ideas.comment.create requires "text" or "comment".');
      }

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Ideas.createComment',
        {
          author: getOptionalPositiveInt(record, 'author'),
          ideaId,
          parent: getOptionalNonNegativeInt(record, 'parent') ?? 0,
          status: getStringValue(record, ['status']) ?? '',
          text,
        },
      );
    },
  },
  {
    id: 'ideas.comment.edit',
    title: 'Edit Idea Comment',
    category: 'ideas',
    description:
      'Edit an existing idea comment through the AutomationApi plugin RPC surface.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'ideas.comment.edit input');
      const commentId = requirePositiveIdFromKeys(
        record,
        ['commentId', 'father'],
        'commentId',
      );
      const text = getNonEmptyStringValue(record, ['text', 'comment']);

      if (!text) {
        throw new Error('ideas.comment.edit requires "text" or "comment".');
      }

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Ideas.editComment',
        {
          commentId,
          text,
        },
      );
    },
  },
  {
    id: 'ideas.comment.delete',
    title: 'Delete Idea Comment',
    category: 'ideas',
    description:
      'Delete an idea comment through the AutomationApi plugin RPC surface. Requires confirm=true.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'ideas.comment.delete input');
      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Ideas.deleteComment',
        {
          commentId: requirePositiveIdFromKeys(
            record,
            ['commentId', 'id'],
            'commentId',
          ),
          confirm: getOptionalBoolean(record, 'confirm') ?? false,
        },
      );
    },
  },
  {
    id: 'ideas.kanban.move',
    title: 'Move Idea In Kanban',
    category: 'ideas',
    description:
      'Move an idea between verified Ideas kanban columns through the AutomationApi plugin RPC surface.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'ideas.kanban.move input');
      const ideaId = requirePositiveIdFromKeys(
        record,
        ['ideaId', 'id'],
        'ideaId',
      );
      const toStatus = normalizeIdeaStatusKey(
        getNonEmptyStringValue(record, ['toStatus', 'statusKey', 'column']) ??
          '',
        'toStatus',
      );

      const result = await runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Ideas.moveIdea',
        {
          ideaId,
          status: toStatus,
        },
      );

      return {
        ideaId,
        result,
        toStatus,
      };
    },
  },
  {
    id: 'ideas.label.update',
    title: 'Update Ideas Column Label',
    category: 'ideas',
    description:
      'Rename an Ideas kanban column label through the AutomationApi plugin RPC surface.',
    execute: async ({ config, input }) => {
      const record = withDefaultEntityIds(
        asRecord(input, 'ideas.label.update input'),
        config,
      );
      const statusKey = normalizeIdeaStatusKey(
        getNonEmptyStringValue(record, ['statusKey', 'column', 'label']) ?? '',
        'statusKey',
      );
      const newLabel = getNonEmptyStringValue(record, ['newLabel', 'title']);

      if (!newLabel) {
        throw new Error('ideas.label.update requires "newLabel" or "title".');
      }
      const projectId =
        getOptionalPositiveInt(record, 'projectId') ?? config.defaultProjectId;

      if (!projectId) {
        throw new Error('ideas.label.update requires "projectId".');
      }

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Ideas.updateLabel',
        {
          newLabel,
          projectId,
          statusKey,
        },
      );
    },
  },
  {
    id: 'ideas.label.list',
    title: 'List Ideas Column Labels',
    category: 'ideas',
    description:
      'List Ideas kanban column labels through the AutomationApi plugin RPC surface.',
    execute: async ({ config, input }) => {
      const record = withDefaultEntityIds(
        asRecord(input, 'ideas.label.list input'),
        config,
      );
      const projectId =
        getOptionalPositiveInt(record, 'projectId') ?? config.defaultProjectId;

      if (!projectId) {
        throw new Error('ideas.label.list requires "projectId".');
      }

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Ideas.listLabels',
        { projectId },
      );
    },
  },
  {
    id: 'ideas.reaction.toggle',
    title: 'Toggle Idea Comment Reaction',
    category: 'ideas',
    description:
      'Toggle a reaction on an idea comment through the AutomationApi plugin RPC surface.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'ideas.reaction.toggle input');
      const commentId = requirePositiveIdFromKeys(
        record,
        ['commentId'],
        'commentId',
      );
      const reaction = getNonEmptyStringValue(record, ['reaction']) ?? 'like';

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Ideas.toggleCommentReaction',
        {
          author: getOptionalPositiveInt(record, 'author'),
          commentId,
          reaction,
        },
      );
    },
  },
  {
    id: 'ideas.milestone.create-link',
    title: 'Create And Link Milestone To Idea',
    category: 'ideas',
    description:
      'Create a new milestone and link it to an idea through the AutomationApi plugin RPC surface.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'ideas.milestone.create-link input');
      const ideaId = requirePositiveIdFromKeys(
        record,
        ['ideaId', 'id'],
        'ideaId',
      );
      const milestoneTitle = getNonEmptyStringValue(record, [
        'newMilestone',
        'milestoneTitle',
        'title',
        'headline',
      ]);

      if (!milestoneTitle) {
        throw new Error(
          'ideas.milestone.create-link requires a milestone title.',
        );
      }

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Ideas.createAndLinkMilestone',
        {
          author: getOptionalPositiveInt(record, 'author'),
          headline: milestoneTitle,
          ideaId,
          values: {
            tags: getStringValue(record, ['tags']),
          },
        },
      );
    },
  },
  {
    id: 'ideas.milestone.link-existing',
    title: 'Link Existing Milestone To Idea',
    category: 'ideas',
    description:
      'Link an existing milestone to an idea through the AutomationApi plugin RPC surface.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'ideas.milestone.link-existing input');
      const ideaId = requirePositiveIdFromKeys(
        record,
        ['ideaId', 'id'],
        'ideaId',
      );
      const milestoneId = requirePositiveIdFromKeys(
        record,
        ['existingMilestoneId', 'existingMilestone', 'milestoneId'],
        'milestoneId',
      );

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Ideas.linkMilestone',
        {
          ideaId,
          milestoneId,
        },
      );
    },
  },
  {
    id: 'ideas.milestone.unlink',
    title: 'Unlink Milestone From Idea',
    category: 'ideas',
    description:
      'Unlink a milestone from an idea through the AutomationApi plugin RPC surface.',
    execute: async ({ config, input }) => {
      const record = asRecord(input, 'ideas.milestone.unlink input');
      const ideaId = requirePositiveIdFromKeys(
        record,
        ['ideaId', 'id'],
        'ideaId',
      );

      return runLeantimeRpc(
        config,
        'leantime.rpc.AutomationApi.Ideas.unlinkMilestone',
        {
          ideaId,
        },
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
      return runLeantimeRpc(config, 'leantime.rpc.Wiki.Wiki.getWiki', {
        id: requireIdInput(input, 'wiki.get input'),
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
      const sprintId = getOptionalNonNegativeInt(record, 'sprintId') ?? 0;
      return runLeantimeRpc(
        config,
        'leantime.rpc.Reports.Reports.getRealtimeReport',
        {
          projectId:
            getOptionalPositiveInt(record, 'projectId') ??
            config.defaultProjectId,
          sprintId,
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
        goalBoard?: unknown;
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
      let goalBoardId: number | undefined;

      if (goals.length > 0) {
        goalBoardId = await resolveGoalBoardId(
          config,
          record,
          projectId,
          authorId,
        );
        created.goalBoard = goalBoardId;
      }

      for (const rawGoal of goals) {
        const goal = normalizeGoalPayload(
          asRecord(rawGoal, 'initiative goal'),
          config,
        );
        goal.projectId = goal.projectId ?? projectId;
        goal.canvasId =
          getOptionalPositiveInt(goal, 'canvasId') ??
          goalBoardId ??
          goal.canvasId;

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
          description: buildArticleBody('Project Brief', [
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
          title: `${name} Project Brief`,
        },
        {
          description: buildArticleBody('Implementation Notes', [
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
          title: `${name} Implementation Notes`,
        },
        {
          description: buildArticleBody('Retrospective', [
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
