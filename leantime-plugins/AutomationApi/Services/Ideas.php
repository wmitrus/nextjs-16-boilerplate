<?php

namespace Leantime\Plugins\AutomationApi\Services;

use InvalidArgumentException;
use Leantime\Domain\Comments\Repositories\Comments as CommentsRepository;
use Leantime\Domain\Ideas\Repositories\Ideas as IdeasRepository;
use Leantime\Domain\Reactions\Services\Reactions as ReactionsService;
use Leantime\Domain\Setting\Repositories\Setting as SettingRepository;
use Leantime\Domain\Tickets\Services\Tickets as TicketService;

class Ideas
{
    private const DEFAULT_BOX = 'idea';

    private const DEFAULT_STATUS = 'idea';

    private const DEFAULT_LABELS = [
        'idea' => 'New Idea',
        'research' => 'Discovery',
        'prototype' => 'Delivering',
        'validation' => 'In Review',
        'implemented' => 'Accepted',
        'deferred' => 'Deferred',
    ];

    public function __construct(
        private IdeasRepository $ideasRepository,
        private CommentsRepository $commentsRepository,
        private ReactionsService $reactionsService,
        private SettingRepository $settingRepository,
        private TicketService $ticketService,
    ) {}

    /**
     * @api
     */
    public function listBoards(int $projectId): array|false
    {
        return $this->ideasRepository->getAllCanvas($projectId);
    }

    /**
     * @api
     */
    public function getBoard(int $boardId): array|false
    {
        $boards = $this->ideasRepository->getSingleCanvas($boardId);

        if ($boards === false || count($boards) === 0) {
            return false;
        }

        return $boards[0];
    }

    /**
     * @api
     */
    public function createBoard(int $projectId, string $title, ?int $author = null): false|string
    {
        return $this->ideasRepository->addCanvas([
            'author' => $this->resolveAuthor($author),
            'projectId' => $projectId,
            'title' => $this->requireNonEmptyString($title, 'title'),
        ]);
    }

    /**
     * @api
     */
    public function updateBoard(int $boardId, string $title): bool
    {
        return $this->ideasRepository->updateCanvas([
            'id' => $boardId,
            'title' => $this->requireNonEmptyString($title, 'title'),
        ]) >= 0;
    }

    /**
     * @api
     */
    public function deleteBoard(int $boardId, bool $confirm = false): bool
    {
        $this->requireConfirmed($confirm, 'deleteBoard');

        if ($this->getBoard($boardId) === false) {
            return false;
        }

        $this->ideasRepository->deleteCanvas($boardId);

        return $this->getBoard($boardId) === false;
    }

    /**
     * @api
     */
    public function listIdeas(int $boardId): array|false
    {
        return $this->ideasRepository->getCanvasItemsById($boardId);
    }

    /**
     * @api
     */
    public function getIdea(int $ideaId): array|false
    {
        return $this->ideasRepository->getSingleCanvasItem($ideaId);
    }

    /**
     * @api
     */
    public function listComments(int $ideaId, int $parent = 0): array|false
    {
        return $this->commentsRepository->getComments('idea', $ideaId, $parent);
    }

    /**
     * @api
     */
    public function createIdea(array $values): array|false
    {
        $ideaId = $this->ideasRepository->addCanvasItem([
            'assumptions' => $values['assumptions'] ?? '',
            'author' => $this->resolveAuthor($values['author'] ?? null),
            'box' => $values['box'] ?? self::DEFAULT_BOX,
            'canvasId' => $this->requirePositiveInt($values, 'canvasId'),
            'conclusion' => $values['conclusion'] ?? '',
            'data' => $values['data'] ?? '',
            'description' => $this->requireNonEmptyString($values['description'] ?? '', 'description'),
            'milestoneId' => $values['milestoneId'] ?? '',
            'status' => $values['status'] ?? self::DEFAULT_STATUS,
        ]);

        if ($ideaId === false) {
            return false;
        }

        $patch = [];
        foreach (['tags', 'sortindex'] as $optionalColumn) {
            if (array_key_exists($optionalColumn, $values)) {
                $patch[$optionalColumn] = $values[$optionalColumn];
            }
        }

        if ($patch !== []) {
            $this->ideasRepository->patchCanvasItem((int) $ideaId, $patch);
        }

        return $this->ideasRepository->getSingleCanvasItem((int) $ideaId);
    }

    /**
     * @api
     */
    public function updateIdea(int $ideaId, array $values): bool
    {
        $currentIdea = $this->ideasRepository->getSingleCanvasItem($ideaId);

        if ($currentIdea === false) {
            return false;
        }

        $this->ideasRepository->editCanvasItem([
            'assumptions' => $values['assumptions'] ?? $currentIdea['assumptions'] ?? '',
            'conclusion' => $values['conclusion'] ?? $currentIdea['conclusion'] ?? '',
            'data' => $values['data'] ?? $currentIdea['data'] ?? '',
            'description' => $values['description'] ?? $currentIdea['description'] ?? '',
            'itemId' => $ideaId,
            'milestoneId' => $values['milestoneId'] ?? $currentIdea['milestoneId'] ?? '',
            'status' => $values['status'] ?? $currentIdea['status'] ?? self::DEFAULT_STATUS,
            'tags' => $values['tags'] ?? $currentIdea['tags'] ?? '',
        ]);

        if (array_key_exists('box', $values)) {
            return $this->ideasRepository->updateIdeaStatus($ideaId, (string) $values['box']);
        }

        return true;
    }

    /**
     * @api
     */
    public function deleteIdea(int $ideaId, bool $confirm = false): bool
    {
        $this->requireConfirmed($confirm, 'deleteIdea');

        if ($this->getIdea($ideaId) === false) {
            return false;
        }

        $this->ideasRepository->delCanvasItem($ideaId);

        return $this->getIdea($ideaId) === false;
    }

    /**
     * @api
     */
    public function moveIdea(int $ideaId, string $status): bool
    {
        $status = $this->requireNonEmptyString($status, 'status');

        return $this->ideasRepository->updateIdeaStatus($ideaId, $status);
    }

    /**
     * @api
     */
    public function createComment(int $ideaId, string $text, ?int $author = null, int $parent = 0, ?string $status = null): array|false
    {
        if ($this->getIdea($ideaId) === false) {
            return false;
        }

        $commentId = $this->commentsRepository->addComment([
            'commentParent' => $parent,
            'date' => date('Y-m-d H:i:s'),
            'moduleId' => $ideaId,
            'status' => $status ?? '',
            'text' => $this->requireNonEmptyString($text, 'text'),
            'userId' => $this->resolveAuthor($author),
        ], 'idea');

        if ($commentId === false) {
            return false;
        }

        return [
            'commentId' => (int) $commentId,
            'ideaId' => $ideaId,
        ];
    }

    /**
     * @api
     */
    public function editComment(int $commentId, string $text): bool
    {
        return $this->commentsRepository->editComment(
            $this->requireNonEmptyString($text, 'text'),
            $commentId,
        );
    }

    /**
     * @api
     */
    public function deleteComment(int $commentId, bool $confirm = false): bool
    {
        $this->requireConfirmed($confirm, 'deleteComment');

        return $this->commentsRepository->deleteComment($commentId);
    }

    /**
     * @api
     */
    public function toggleCommentReaction(int $commentId, string $reaction = 'like', ?int $author = null): array|false
    {
        $userId = $this->resolveAuthor($author);
        $reaction = $this->requireNonEmptyString($reaction, 'reaction');

        if ($this->reactionsService->getReactionType($reaction) === false) {
            throw new InvalidArgumentException("Unsupported reaction: {$reaction}");
        }

        $existing = $this->reactionsService->getUserReactions($userId, 'comment', $commentId, $reaction);

        if ($existing !== false && count($existing) > 0) {
            $this->reactionsService->removeReaction($userId, 'comment', $commentId, $reaction);
        } else {
            $allExisting = $this->reactionsService->getUserReactions($userId, 'comment', $commentId);

            if ($allExisting !== false) {
                foreach ($allExisting as $existingReaction) {
                    $this->reactionsService->removeReaction($userId, 'comment', $commentId, $existingReaction['reaction']);
                }
            }

            $this->reactionsService->addReaction($userId, 'comment', $commentId, $reaction);
        }

        return $this->reactionsService->getEntityReactionsWithUsers('comment', $commentId);
    }

    /**
     * @api
     */
    public function createAndLinkMilestone(int $ideaId, string $headline, ?int $author = null, array $values = []): array|false
    {
        $idea = $this->requireIdea($ideaId);
        $board = $this->requireBoard((int) $idea['canvasId']);
        $milestoneId = $this->ticketService->quickAddMilestone([
            'editorId' => $this->resolveAuthor($author),
            'headline' => $this->requireNonEmptyString($headline, 'headline'),
            'projectId' => (int) $board['projectId'],
            'tags' => $values['tags'] ?? '#ccc',
            'userId' => $this->resolveAuthor($author),
        ]);

        if (is_array($milestoneId) || $milestoneId === false) {
            return false;
        }

        $this->ideasRepository->patchCanvasItem($ideaId, ['milestoneId' => (string) $milestoneId]);

        return $this->getIdea($ideaId);
    }

    /**
     * @api
     */
    public function linkMilestone(int $ideaId, int $milestoneId): bool
    {
        if ($this->getIdea($ideaId) === false) {
            return false;
        }

        return $this->ideasRepository->patchCanvasItem($ideaId, ['milestoneId' => (string) $milestoneId]);
    }

    /**
     * @api
     */
    public function unlinkMilestone(int $ideaId): bool
    {
        if ($this->getIdea($ideaId) === false) {
            return false;
        }

        return $this->ideasRepository->patchCanvasItem($ideaId, ['milestoneId' => '']);
    }

    /**
     * @api
     */
    public function listLabels(int $projectId): array
    {
        return $this->labelsForProject($projectId);
    }

    /**
     * @api
     */
    public function updateLabel(int $projectId, string $statusKey, string $newLabel): array
    {
        $statusKey = $this->requireKnownStatus($statusKey);
        $labels = $this->labelsForProject($projectId);
        $labels[$statusKey]['name'] = strip_tags($this->requireNonEmptyString($newLabel, 'newLabel'));

        $this->settingRepository->saveSetting(
            "projectsettings.{$projectId}.idealabels",
            serialize(array_map(fn (array $label): string => $label['name'], $labels)),
        );

        session()->forget('projectsettings.idealabels');

        return $labels;
    }

    private function labelsForProject(int $projectId): array
    {
        $rawValue = $this->settingRepository->getSetting("projectsettings.{$projectId}.idealabels", false);
        $names = self::DEFAULT_LABELS;

        if (is_string($rawValue) && $rawValue !== '') {
            $stored = @unserialize($rawValue, ['allowed_classes' => false]);

            if (is_array($stored)) {
                foreach ($stored as $statusKey => $label) {
                    if (is_string($statusKey) && is_string($label) && array_key_exists($statusKey, $names)) {
                        $names[$statusKey] = $label;
                    }
                }
            }
        }

        $labels = [];
        foreach ($names as $statusKey => $name) {
            $labels[$statusKey] = [
                'class' => $this->ideasRepository->statusClasses[$statusKey] ?? 'label-default',
                'name' => $name,
            ];
        }

        return $labels;
    }

    private function requireBoard(int $boardId): array
    {
        $board = $this->getBoard($boardId);

        if ($board === false) {
            throw new InvalidArgumentException('boardId does not reference an Ideas board.');
        }

        return $board;
    }

    private function requireConfirmed(bool $confirm, string $operation): void
    {
        if (! $confirm) {
            throw new InvalidArgumentException("{$operation} requires confirm=true.");
        }
    }

    private function requireIdea(int $ideaId): array
    {
        $idea = $this->getIdea($ideaId);

        if ($idea === false) {
            throw new InvalidArgumentException('ideaId does not reference an idea.');
        }

        return $idea;
    }

    private function requireKnownStatus(string $statusKey): string
    {
        $statusKey = $this->requireNonEmptyString($statusKey, 'statusKey');

        if (! array_key_exists($statusKey, self::DEFAULT_LABELS)) {
            throw new InvalidArgumentException("Unsupported statusKey: {$statusKey}");
        }

        return $statusKey;
    }

    private function resolveAuthor(?int $author): int
    {
        if ($author !== null && $author > 0) {
            return $author;
        }

        $sessionAuthor = session('userdata.id');

        if (is_numeric($sessionAuthor) && (int) $sessionAuthor > 0) {
            return (int) $sessionAuthor;
        }

        throw new InvalidArgumentException('author is required when no API session user is available.');
    }

    private function requireNonEmptyString(string $value, string $field): string
    {
        $value = trim($value);

        if ($value === '') {
            throw new InvalidArgumentException("$field must be a non-empty string.");
        }

        return $value;
    }

    private function requirePositiveInt(array $values, string $field): int
    {
        $value = $values[$field] ?? null;

        if (is_numeric($value) && (int) $value > 0) {
            return (int) $value;
        }

        throw new InvalidArgumentException("$field must be a positive integer.");
    }
}
