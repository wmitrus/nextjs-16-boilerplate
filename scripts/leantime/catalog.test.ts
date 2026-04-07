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

  it('creates a Project Value Canvas board through the AutomationApi Canvas RPC flow', async () => {
    mockRunLeantimeRpc.mockResolvedValueOnce({
      id: 15,
      projectId: 2,
      title: 'Project Value Canvas',
    });

    const result = await executeOperation('blueprints.board.create', {
      config,
      input: {
        boardType: 'value',
        description: 'First generic Canvas board',
        projectId: 2,
        title: 'Project Value Canvas',
      },
    });

    expect(result).toEqual({
      id: 15,
      projectId: 2,
      title: 'Project Value Canvas',
    });
    expect(mockRunLeantimeRpc).toHaveBeenCalledWith(
      config,
      'leantime.rpc.AutomationApi.Canvas.createBoard',
      {
        author: 1,
        boardType: 'value',
        description: 'First generic Canvas board',
        projectId: 2,
        title: 'Project Value Canvas',
      },
    );
    expect(mockRunLeantimeWebRequest).not.toHaveBeenCalled();
  });

  it('creates a Project Value Canvas item through the AutomationApi Canvas RPC flow', async () => {
    mockRunLeantimeRpc.mockResolvedValueOnce({
      box: 'problem',
      canvasId: 15,
      description: 'Slow project setup',
      id: 16,
    });

    const result = await executeOperation('blueprints.item.create', {
      config,
      input: {
        boardId: 15,
        boardType: 'value',
        box: 'problem',
        data: '<p>Observed during setup.</p>',
        title: 'Slow project setup',
      },
    });

    expect(result).toEqual({
      box: 'problem',
      canvasId: 15,
      description: 'Slow project setup',
      id: 16,
    });
    expect(mockRunLeantimeRpc).toHaveBeenCalledWith(
      config,
      'leantime.rpc.AutomationApi.Canvas.createItem',
      {
        boardType: 'value',
        values: {
          author: 1,
          authorId: 1,
          box: 'problem',
          canvasId: 15,
          clientId: 1,
          data: '<p>Observed during setup.</p>',
          description: 'Slow project setup',
          projectId: 2,
          title: 'Slow project setup',
        },
      },
    );
    expect(mockRunLeantimeWebRequest).not.toHaveBeenCalled();
  });

  it('patches a Project Value Canvas item through the AutomationApi Canvas RPC flow', async () => {
    mockRunLeantimeRpc.mockResolvedValueOnce(true);

    const result = await executeOperation('blueprints.item.patch', {
      config,
      input: {
        boardType: 'value',
        fields: {
          conclusion: 'Validated',
          status: 'status_valid',
        },
        itemId: 16,
      },
    });

    expect(result).toBe(true);
    expect(mockRunLeantimeRpc).toHaveBeenCalledWith(
      config,
      'leantime.rpc.AutomationApi.Canvas.patchItem',
      {
        boardType: 'value',
        fields: {
          conclusion: 'Validated',
          status: 'status_valid',
        },
        itemId: 16,
      },
    );
    expect(mockRunLeantimeWebRequest).not.toHaveBeenCalled();
  });

  it('creates a Risk Analysis board through the same AutomationApi Canvas RPC flow', async () => {
    mockRunLeantimeRpc.mockResolvedValueOnce({
      id: 18,
      projectId: 2,
      title: 'Risk Analysis',
    });

    const result = await executeOperation('blueprints.board.create', {
      config,
      input: {
        boardType: 'risks',
        description: 'Risk register for delivery planning',
        projectId: 2,
        title: 'Risk Analysis',
      },
    });

    expect(result).toEqual({
      id: 18,
      projectId: 2,
      title: 'Risk Analysis',
    });
    expect(mockRunLeantimeRpc).toHaveBeenCalledWith(
      config,
      'leantime.rpc.AutomationApi.Canvas.createBoard',
      {
        author: 1,
        boardType: 'risks',
        description: 'Risk register for delivery planning',
        projectId: 2,
        title: 'Risk Analysis',
      },
    );
    expect(mockRunLeantimeWebRequest).not.toHaveBeenCalled();
  });

  it('creates a Risk Analysis item with relates metadata through plugin RPC', async () => {
    mockRunLeantimeRpc.mockResolvedValueOnce({
      box: 'risks_imp_high_pro_high',
      canvasId: 18,
      description: 'Cache model migration risk',
      id: 19,
      relates: 'relates_capabilities',
    });

    const result = await executeOperation('blueprints.item.create', {
      config,
      input: {
        boardId: 18,
        boardType: 'risks',
        box: 'risks_imp_high_pro_high',
        data: '<p>Next.js cache behavior can change delivery assumptions.</p>',
        relates: 'relates_capabilities',
        title: 'Cache model migration risk',
      },
    });

    expect(result).toEqual({
      box: 'risks_imp_high_pro_high',
      canvasId: 18,
      description: 'Cache model migration risk',
      id: 19,
      relates: 'relates_capabilities',
    });
    expect(mockRunLeantimeRpc).toHaveBeenCalledWith(
      config,
      'leantime.rpc.AutomationApi.Canvas.createItem',
      {
        boardType: 'risks',
        values: {
          author: 1,
          authorId: 1,
          box: 'risks_imp_high_pro_high',
          canvasId: 18,
          clientId: 1,
          data: '<p>Next.js cache behavior can change delivery assumptions.</p>',
          description: 'Cache model migration risk',
          projectId: 2,
          relates: 'relates_capabilities',
          title: 'Cache model migration risk',
        },
      },
    );
    expect(mockRunLeantimeWebRequest).not.toHaveBeenCalled();
  });

  it('creates a SWOT Analysis board through the same AutomationApi Canvas RPC flow', async () => {
    mockRunLeantimeRpc.mockResolvedValueOnce({
      id: 20,
      projectId: 2,
      title: 'SWOT Analysis',
    });

    const result = await executeOperation('blueprints.board.create', {
      config,
      input: {
        boardType: 'swot',
        description: 'Strategic quadrant board',
        projectId: 2,
        title: 'SWOT Analysis',
      },
    });

    expect(result).toEqual({
      id: 20,
      projectId: 2,
      title: 'SWOT Analysis',
    });
    expect(mockRunLeantimeRpc).toHaveBeenCalledWith(
      config,
      'leantime.rpc.AutomationApi.Canvas.createBoard',
      {
        author: 1,
        boardType: 'swot',
        description: 'Strategic quadrant board',
        projectId: 2,
        title: 'SWOT Analysis',
      },
    );
    expect(mockRunLeantimeWebRequest).not.toHaveBeenCalled();
  });

  it('creates a SWOT Analysis item without forcing a board-specific status', async () => {
    mockRunLeantimeRpc.mockResolvedValueOnce({
      box: 'swot_strengths',
      canvasId: 20,
      description: 'Strong architecture discipline',
      id: 21,
    });

    const result = await executeOperation('blueprints.item.create', {
      config,
      input: {
        boardId: 20,
        boardType: 'swot',
        box: 'swot_strengths',
        data: '<p>Validated through plugin rollout phases.</p>',
        relates: 'relates_capabilities',
        title: 'Strong architecture discipline',
      },
    });

    expect(result).toEqual({
      box: 'swot_strengths',
      canvasId: 20,
      description: 'Strong architecture discipline',
      id: 21,
    });
    expect(mockRunLeantimeRpc).toHaveBeenCalledWith(
      config,
      'leantime.rpc.AutomationApi.Canvas.createItem',
      {
        boardType: 'swot',
        values: {
          author: 1,
          authorId: 1,
          box: 'swot_strengths',
          canvasId: 20,
          clientId: 1,
          data: '<p>Validated through plugin rollout phases.</p>',
          description: 'Strong architecture discipline',
          projectId: 2,
          relates: 'relates_capabilities',
          title: 'Strong architecture discipline',
        },
      },
    );
    expect(mockRunLeantimeWebRequest).not.toHaveBeenCalled();
  });

  it('creates a Business Model Board item through the generic Canvas RPC flow', async () => {
    mockRunLeantimeRpc.mockResolvedValueOnce({
      box: 'obm_vp',
      canvasId: 22,
      description: 'Reusable boilerplate value proposition',
      id: 23,
    });

    const result = await executeOperation('blueprints.item.create', {
      config,
      input: {
        boardId: 22,
        boardType: 'obm',
        box: 'obm_vp',
        data: '<p>Production-grade starter for future apps.</p>',
        title: 'Reusable boilerplate value proposition',
      },
    });

    expect(result).toEqual({
      box: 'obm_vp',
      canvasId: 22,
      description: 'Reusable boilerplate value proposition',
      id: 23,
    });
    expect(mockRunLeantimeRpc).toHaveBeenCalledWith(
      config,
      'leantime.rpc.AutomationApi.Canvas.createItem',
      {
        boardType: 'obm',
        values: {
          author: 1,
          authorId: 1,
          box: 'obm_vp',
          canvasId: 22,
          clientId: 1,
          data: '<p>Production-grade starter for future apps.</p>',
          description: 'Reusable boilerplate value proposition',
          projectId: 2,
          title: 'Reusable boilerplate value proposition',
        },
      },
    );
    expect(mockRunLeantimeWebRequest).not.toHaveBeenCalled();
  });

  it('creates a Lean Canvas item through the generic Canvas RPC flow', async () => {
    mockRunLeantimeRpc.mockResolvedValueOnce({
      box: 'problem',
      canvasId: 24,
      description: 'App setup takes too long',
      id: 25,
    });

    const result = await executeOperation('blueprints.item.create', {
      config,
      input: {
        boardId: 24,
        boardType: 'lean',
        box: 'problem',
        data: '<p>Teams repeatedly rebuild auth and observability setup.</p>',
        title: 'App setup takes too long',
      },
    });

    expect(result).toEqual({
      box: 'problem',
      canvasId: 24,
      description: 'App setup takes too long',
      id: 25,
    });
    expect(mockRunLeantimeRpc).toHaveBeenCalledWith(
      config,
      'leantime.rpc.AutomationApi.Canvas.createItem',
      {
        boardType: 'lean',
        values: {
          author: 1,
          authorId: 1,
          box: 'problem',
          canvasId: 24,
          clientId: 1,
          data: '<p>Teams repeatedly rebuild auth and observability setup.</p>',
          description: 'App setup takes too long',
          projectId: 2,
          title: 'App setup takes too long',
        },
      },
    );
    expect(mockRunLeantimeWebRequest).not.toHaveBeenCalled();
  });

  it('creates a Project Value Canvas item comment through plugin RPC', async () => {
    mockRunLeantimeRpc.mockResolvedValueOnce({
      commentId: 7,
      itemId: 16,
      module: 'valuecanvasitem',
    });

    const result = await executeOperation('blueprints.comment.create', {
      config,
      input: {
        boardType: 'value',
        itemId: 16,
        text: '<p>Evidence comment</p>',
      },
    });

    expect(result).toEqual({
      commentId: 7,
      itemId: 16,
      module: 'valuecanvasitem',
    });
    expect(mockRunLeantimeRpc).toHaveBeenCalledWith(
      config,
      'leantime.rpc.AutomationApi.Canvas.createComment',
      {
        author: undefined,
        boardType: 'value',
        itemId: 16,
        parent: 0,
        status: '',
        text: '<p>Evidence comment</p>',
      },
    );
    expect(mockRunLeantimeWebRequest).not.toHaveBeenCalled();
  });

  it('links an existing milestone to a Project Value Canvas item through plugin RPC', async () => {
    mockRunLeantimeRpc.mockResolvedValueOnce(true);

    const result = await executeOperation(
      'blueprints.milestone.link-existing',
      {
        config,
        input: {
          boardType: 'value',
          existingMilestoneId: 25,
          itemId: 16,
        },
      },
    );

    expect(result).toBe(true);
    expect(mockRunLeantimeRpc).toHaveBeenCalledWith(
      config,
      'leantime.rpc.AutomationApi.Canvas.linkMilestone',
      {
        boardType: 'value',
        itemId: 16,
        milestoneId: 25,
      },
    );
    expect(mockRunLeantimeWebRequest).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation for destructive Project Value Canvas item deletion', async () => {
    mockRunLeantimeRpc.mockResolvedValueOnce(true);

    await executeOperation('blueprints.item.delete', {
      config,
      input: {
        boardType: 'value',
        confirm: true,
        itemId: 16,
      },
    });

    expect(mockRunLeantimeRpc).toHaveBeenCalledWith(
      config,
      'leantime.rpc.AutomationApi.Canvas.deleteItem',
      {
        boardType: 'value',
        confirm: true,
        itemId: 16,
      },
    );
    expect(mockRunLeantimeWebRequest).not.toHaveBeenCalled();
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
