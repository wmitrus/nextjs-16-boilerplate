// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeOperation } from './catalog';
import type * as LeantimeLib from './lib';

type LeantimeLibModule = typeof LeantimeLib;

const { mockRunLeantimeRpc, mockRunLeantimeWebRequest } = vi.hoisted(() => ({
  mockRunLeantimeRpc: vi.fn<LeantimeLibModule['runLeantimeRpc']>(),
  mockRunLeantimeWebRequest:
    vi.fn<LeantimeLibModule['runLeantimeWebRequest']>(),
}));

vi.mock('./lib', async () => {
  const actual = await vi.importActual<LeantimeLibModule>('./lib');

  return {
    ...actual,
    runLeantimeRpc:
      mockRunLeantimeRpc as unknown as LeantimeLibModule['runLeantimeRpc'],
    runLeantimeWebRequest:
      mockRunLeantimeWebRequest as unknown as LeantimeLibModule['runLeantimeWebRequest'],
  } satisfies LeantimeLibModule;
});

describe('leantime catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const config = {
    apiKey: 'lt_example',
    baseUrl: 'https://leantime.example.com/',
    defaultAuthorId: 1,
    defaultClientId: 1,
    defaultProjectId: 2,
    rpcUrl: 'https://leantime.example.com/api/jsonrpc',
    sessionCookie: 'LEANTIMESESSID=example',
    timeoutMs: 30000,
  };

  it('creates a goal board before creating a goal when only a board title is provided', async () => {
    mockRunLeantimeRpc.mockResolvedValueOnce('9').mockResolvedValueOnce('6');

    const result = await executeOperation('goal.create', {
      config,
      input: {
        goalBoardTitle: 'AI Workflow Goals',
        headline: 'Validate goal flow',
        projectId: 2,
      },
    });

    expect(result).toBe('6');
    expect(mockRunLeantimeRpc).toHaveBeenNthCalledWith(
      1,
      config,
      'leantime.rpc.Goalcanvas.Goalcanvas.createGoalboard',
      {
        values: {
          author: 1,
          authorId: 1,
          clientId: 1,
          description: '',
          projectId: 2,
          title: 'AI Workflow Goals',
        },
      },
    );
    expect(mockRunLeantimeRpc).toHaveBeenNthCalledWith(
      2,
      config,
      'leantime.rpc.Goalcanvas.Goalcanvas.createGoal',
      {
        values: {
          author: 1,
          authorId: 1,
          box: 'goal',
          canvasId: 9,
          clientId: 1,
          projectId: 2,
          status: 'status_ontrack',
          title: 'Validate goal flow',
        },
      },
    );
  });

  it('defaults realtime reports to sprintId 0', async () => {
    mockRunLeantimeRpc.mockResolvedValueOnce({ projectId: 2, sprintId: 0 });

    const result = await executeOperation('reports.realtime', {
      config,
      input: {
        projectId: 2,
      },
    });

    expect(result).toEqual({ projectId: 2, sprintId: 0 });
    expect(mockRunLeantimeRpc).toHaveBeenCalledWith(
      config,
      'leantime.rpc.Reports.Reports.getRealtimeReport',
      {
        projectId: 2,
        sprintId: 0,
      },
    );
  });

  it('creates an ideas board through the AutomationApi plugin RPC flow', async () => {
    mockRunLeantimeRpc.mockResolvedValueOnce(['13']);

    const result = await executeOperation('ideas.board.create', {
      config,
      input: {
        projectId: 2,
        title: 'Discovery Board',
      },
    });

    expect(result).toEqual({
      boardId: 13,
    });
    expect(mockRunLeantimeRpc).toHaveBeenCalledWith(
      config,
      'leantime.rpc.AutomationApi.Ideas.createBoard',
      {
        author: 1,
        projectId: 2,
        title: 'Discovery Board',
      },
    );
    expect(mockRunLeantimeWebRequest).not.toHaveBeenCalled();
  });

  it('lists ideas boards through the AutomationApi plugin RPC flow', async () => {
    mockRunLeantimeRpc.mockResolvedValueOnce([
      { id: 13, title: 'Discovery Board' },
    ]);

    const result = await executeOperation('ideas.board.list', {
      config,
      input: {
        projectId: 2,
      },
    });

    expect(result).toEqual([{ id: 13, title: 'Discovery Board' }]);
    expect(mockRunLeantimeRpc).toHaveBeenCalledWith(
      config,
      'leantime.rpc.AutomationApi.Ideas.listBoards',
      {
        projectId: 2,
      },
    );
    expect(mockRunLeantimeWebRequest).not.toHaveBeenCalled();
  });

  it('creates an idea through the AutomationApi plugin RPC flow', async () => {
    mockRunLeantimeRpc.mockResolvedValueOnce({
      canvasId: 13,
      data: '<p>Validate capture</p>',
      description: 'Validate ideas.create',
      id: 11,
      tags: 'automation,ideas',
    });

    const result = await executeOperation('ideas.create', {
      config,
      input: {
        boardId: 13,
        content: '<p>Validate capture</p>',
        tags: 'automation,ideas',
        title: 'Validate ideas.create',
      },
    });

    expect(result).toEqual({
      canvasId: 13,
      data: '<p>Validate capture</p>',
      description: 'Validate ideas.create',
      id: 11,
      tags: 'automation,ideas',
    });
    expect(mockRunLeantimeRpc).toHaveBeenCalledWith(
      config,
      'leantime.rpc.AutomationApi.Ideas.createIdea',
      {
        values: {
          author: 1,
          authorId: 1,
          canvasId: 13,
          clientId: 1,
          data: '<p>Validate capture</p>',
          description: 'Validate ideas.create',
          projectId: 2,
          tags: 'automation,ideas',
        },
      },
    );
    expect(mockRunLeantimeWebRequest).not.toHaveBeenCalled();
  });

  it('updates an idea through the AutomationApi plugin RPC flow', async () => {
    mockRunLeantimeRpc.mockResolvedValueOnce([true]);

    const result = await executeOperation('ideas.update', {
      config,
      input: {
        content: '<p>Updated body</p>',
        ideaId: 11,
        title: 'Updated title',
      },
    });

    expect(result).toEqual([true]);
    expect(mockRunLeantimeRpc).toHaveBeenCalledWith(
      config,
      'leantime.rpc.AutomationApi.Ideas.updateIdea',
      {
        ideaId: 11,
        values: {
          author: 1,
          authorId: 1,
          clientId: 1,
          data: '<p>Updated body</p>',
          description: 'Updated title',
          ideaId: 11,
          projectId: 2,
        },
      },
    );
    expect(mockRunLeantimeWebRequest).not.toHaveBeenCalled();
  });

  it('moves an idea across verified kanban statuses through plugin RPC', async () => {
    mockRunLeantimeRpc.mockResolvedValueOnce([true]);

    const result = await executeOperation('ideas.kanban.move', {
      config,
      input: {
        ideaId: 11,
        toStatus: 'research',
      },
    });

    expect(result).toEqual({
      ideaId: 11,
      result: [true],
      toStatus: 'research',
    });
    expect(mockRunLeantimeRpc).toHaveBeenCalledWith(
      config,
      'leantime.rpc.AutomationApi.Ideas.moveIdea',
      {
        ideaId: 11,
        status: 'research',
      },
    );
    expect(mockRunLeantimeWebRequest).not.toHaveBeenCalled();
  });

  it('creates an idea comment through plugin RPC', async () => {
    mockRunLeantimeRpc.mockResolvedValueOnce({ commentId: 5, ideaId: 11 });

    const result = await executeOperation('ideas.comment.create', {
      config,
      input: {
        ideaId: 11,
        text: '<p>First comment</p>',
      },
    });

    expect(result).toEqual({ commentId: 5, ideaId: 11 });
    expect(mockRunLeantimeRpc).toHaveBeenCalledWith(
      config,
      'leantime.rpc.AutomationApi.Ideas.createComment',
      {
        author: undefined,
        ideaId: 11,
        parent: 0,
        status: '',
        text: '<p>First comment</p>',
      },
    );
    expect(mockRunLeantimeWebRequest).not.toHaveBeenCalled();
  });

  it('links an existing milestone to an idea through plugin RPC', async () => {
    mockRunLeantimeRpc.mockResolvedValueOnce(true);

    const result = await executeOperation('ideas.milestone.link-existing', {
      config,
      input: {
        existingMilestoneId: 22,
        ideaId: 11,
      },
    });

    expect(result).toBe(true);
    expect(mockRunLeantimeRpc).toHaveBeenCalledWith(
      config,
      'leantime.rpc.AutomationApi.Ideas.linkMilestone',
      {
        ideaId: 11,
        milestoneId: 22,
      },
    );
    expect(mockRunLeantimeWebRequest).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation for destructive idea deletion', async () => {
    mockRunLeantimeRpc.mockResolvedValueOnce(true);

    await executeOperation('ideas.delete', {
      config,
      input: {
        confirm: true,
        ideaId: 11,
      },
    });

    expect(mockRunLeantimeRpc).toHaveBeenCalledWith(
      config,
      'leantime.rpc.AutomationApi.Ideas.deleteIdea',
      {
        confirm: true,
        ideaId: 11,
      },
    );
    expect(mockRunLeantimeWebRequest).not.toHaveBeenCalled();
  });
});
