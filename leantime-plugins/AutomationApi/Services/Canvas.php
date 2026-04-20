<?php

namespace Leantime\Plugins\AutomationApi\Services;

use InvalidArgumentException;
use Leantime\Domain\Canvas\Repositories\Canvas as BaseCanvasRepository;
use Leantime\Domain\Comments\Repositories\Comments as CommentsRepository;
use Leantime\Domain\Eacanvas\Repositories\Eacanvas as EacanvasRepository;
use Leantime\Domain\Insightscanvas\Repositories\Insightscanvas as InsightscanvasRepository;
use Leantime\Domain\Leancanvas\Repositories\Leancanvas as LeancanvasRepository;
use Leantime\Domain\Minempathycanvas\Repositories\Minempathycanvas as MinempathycanvasRepository;
use Leantime\Domain\Obmcanvas\Repositories\Obmcanvas as ObmcanvasRepository;
use Leantime\Domain\Retroscanvas\Repositories\Retroscanvas as RetroscanvasRepository;
use Leantime\Domain\Riskscanvas\Repositories\Riskscanvas as RiskscanvasRepository;
use Leantime\Domain\Sbcanvas\Repositories\Sbcanvas as SbcanvasRepository;
use Leantime\Domain\Swotcanvas\Repositories\Swotcanvas as SwotcanvasRepository;
use Leantime\Domain\Tickets\Services\Tickets as TicketService;
use Leantime\Domain\Valuecanvas\Repositories\Valuecanvas as ValuecanvasRepository;

class Canvas
{
    private const DEFAULT_BOARD_TYPE = 'value';

    private const SUPPORTED_BOARD_TYPES = [
        'ea' => 'Environmental Analysis',
        'insights' => 'Observe / Learn - Insights',
        'lean' => 'Lean Canvas',
        'minempathy' => 'Simple Empathy Map',
        'obm' => 'Business Model Board',
        'retros' => 'Retrospectives',
        'risks' => 'Risk Analysis',
        'sb' => 'Project Brief',
        'swot' => 'SWOT Analysis',
        'value' => 'Project Value Canvas',
    ];

    private const ITEM_WRITE_FIELDS = [
        'action',
        'assignedTo',
        'assumptions',
        'box',
        'canvasId',
        'conclusion',
        'currentValue',
        'data',
        'data1',
        'data2',
        'data3',
        'data4',
        'data5',
        'description',
        'effort',
        'endDate',
        'endValue',
        'impact',
        'kpi',
        'metricType',
        'milestoneId',
        'parent',
        'probability',
        'relates',
        'setting',
        'startDate',
        'startValue',
        'status',
        'tags',
        'title',
    ];

    private const ITEM_PATCH_FIELDS = [
        'action',
        'assignedTo',
        'assumptions',
        'conclusion',
        'currentValue',
        'data',
        'data1',
        'data2',
        'data3',
        'data4',
        'data5',
        'description',
        'effort',
        'endDate',
        'endValue',
        'impact',
        'kpi',
        'metricType',
        'milestoneId',
        'parent',
        'probability',
        'relates',
        'setting',
        'sortindex',
        'startDate',
        'startValue',
        'status',
        'tags',
        'title',
    ];

    public function __construct(
        private ValuecanvasRepository $valuecanvasRepository,
        private EacanvasRepository $eacanvasRepository,
        private InsightscanvasRepository $insightscanvasRepository,
        private LeancanvasRepository $leancanvasRepository,
        private MinempathycanvasRepository $minempathycanvasRepository,
        private ObmcanvasRepository $obmcanvasRepository,
        private RetroscanvasRepository $retroscanvasRepository,
        private RiskscanvasRepository $riskscanvasRepository,
        private SbcanvasRepository $sbcanvasRepository,
        private SwotcanvasRepository $swotcanvasRepository,
        private CommentsRepository $commentsRepository,
        private TicketService $ticketService,
    ) {}

    /**
     * @api
     */
    public function listBoardTypes(): array
    {
        $boardTypes = [];

        foreach (array_keys(self::SUPPORTED_BOARD_TYPES) as $boardType) {
            $boardTypes[$boardType] = $this->boardTypeMetadata($boardType);
        }

        return $boardTypes;
    }

    /**
     * @api
     */
    public function getBoardType(string $boardType = self::DEFAULT_BOARD_TYPE): array
    {
        return $this->boardTypeMetadata($this->requireSupportedBoardType($boardType));
    }

    /**
     * @api
     */
    public function listBoards(int $projectId, string $boardType = self::DEFAULT_BOARD_TYPE): array|false
    {
        return $this->repository($boardType)->getAllCanvas($projectId);
    }

    /**
     * @api
     */
    public function getBoard(int $boardId, string $boardType = self::DEFAULT_BOARD_TYPE): array|false
    {
        $boards = $this->repository($boardType)->getSingleCanvas($boardId);

        if ($boards === false || count($boards) === 0) {
            return false;
        }

        return $boards[0];
    }

    /**
     * @api
     */
    public function createBoard(int $projectId, string $title, ?int $author = null, string $boardType = self::DEFAULT_BOARD_TYPE, ?string $description = null): array|false
    {
        $repository = $this->repository($boardType);
        $boardId = $repository->addCanvas([
            'author' => $this->resolveAuthor($author),
            'description' => $description ?? '',
            'projectId' => $projectId,
            'title' => $this->requireNonEmptyString($title, 'title'),
        ]);

        if ($boardId === false) {
            return false;
        }

        return $this->getBoard((int) $boardId, $boardType);
    }

    /**
     * @api
     */
    public function updateBoard(int $boardId, string $title, string $boardType = self::DEFAULT_BOARD_TYPE, ?string $description = null): bool
    {
        $this->requireBoard($boardId, $boardType);

        return $this->repository($boardType)->updateCanvas([
            'description' => $description ?? '',
            'id' => $boardId,
            'title' => $this->requireNonEmptyString($title, 'title'),
        ]) >= 0;
    }

    /**
     * @api
     */
    public function deleteBoard(int $boardId, string $boardType = self::DEFAULT_BOARD_TYPE, bool $confirm = false): bool
    {
        $this->requireConfirmed($confirm, 'deleteBoard');
        $this->requireBoard($boardId, $boardType);

        $this->repository($boardType)->deleteCanvas($boardId);

        return $this->getBoard($boardId, $boardType) === false;
    }

    /**
     * @api
     */
    public function listItems(int $boardId, string $boardType = self::DEFAULT_BOARD_TYPE): array|false
    {
        $this->requireBoard($boardId, $boardType);

        return $this->repository($boardType)->getCanvasItemsById($boardId);
    }

    /**
     * @api
     */
    public function getItem(int $itemId, string $boardType = self::DEFAULT_BOARD_TYPE): array|false
    {
        $item = $this->repository($boardType)->getSingleCanvasItem($itemId);

        if ($item === false) {
            return false;
        }

        $this->requireBoard((int) $item['canvasId'], $boardType);

        return $item;
    }

    /**
     * @api
     */
    public function createItem(array $values, string $boardType = self::DEFAULT_BOARD_TYPE): array|false
    {
        $repository = $this->repository($boardType);
        $payload = $this->normalizeItemPayload($values, $boardType);
        $this->requireBoard((int) $payload['canvasId'], $boardType);

        $itemId = $repository->addCanvasItem($payload);

        if ($itemId === false) {
            return false;
        }

        return $this->getItem((int) $itemId, $boardType);
    }

    /**
     * @api
     */
    public function updateItem(int $itemId, array $values, string $boardType = self::DEFAULT_BOARD_TYPE): bool
    {
        $currentItem = $this->requireItem($itemId, $boardType);
        $payload = $this->normalizeItemPayload(array_merge($currentItem, $values), $boardType);
        $payload['itemId'] = $itemId;

        $this->repository($boardType)->editCanvasItem($payload);

        return true;
    }

    /**
     * @api
     */
    public function patchItem(int $itemId, array $fields, string $boardType = self::DEFAULT_BOARD_TYPE): bool
    {
        $this->requireItem($itemId, $boardType);
        $patch = $this->filterAllowedFields($fields, self::ITEM_PATCH_FIELDS);

        if ($patch === []) {
            throw new InvalidArgumentException('patchItem requires at least one supported field.');
        }

        if (array_key_exists('box', $patch)) {
            unset($patch['box']);
        }

        return $this->repository($boardType)->patchCanvasItem($itemId, $patch);
    }

    /**
     * @api
     */
    public function deleteItem(int $itemId, string $boardType = self::DEFAULT_BOARD_TYPE, bool $confirm = false): bool
    {
        $this->requireConfirmed($confirm, 'deleteItem');
        $this->requireItem($itemId, $boardType);

        $this->repository($boardType)->delCanvasItem($itemId);

        return $this->getItem($itemId, $boardType) === false;
    }

    /**
     * @api
     */
    public function listComments(int $itemId, string $boardType = self::DEFAULT_BOARD_TYPE, int $parent = 0): array|false
    {
        $this->requireItem($itemId, $boardType);

        return $this->commentsRepository->getComments($this->commentModule($boardType), $itemId, $parent);
    }

    /**
     * @api
     */
    public function createComment(int $itemId, string $text, ?int $author = null, string $boardType = self::DEFAULT_BOARD_TYPE, int $parent = 0, ?string $status = null): array|false
    {
        $this->requireItem($itemId, $boardType);

        $commentId = $this->commentsRepository->addComment([
            'commentParent' => $parent,
            'date' => date('Y-m-d H:i:s'),
            'moduleId' => $itemId,
            'status' => $status ?? '',
            'text' => $this->requireNonEmptyString($text, 'text'),
            'userId' => $this->resolveAuthor($author),
        ], $this->commentModule($boardType));

        if ($commentId === false) {
            return false;
        }

        return [
            'commentId' => (int) $commentId,
            'itemId' => $itemId,
            'module' => $this->commentModule($boardType),
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
    public function createAndLinkMilestone(int $itemId, string $headline, ?int $author = null, string $boardType = self::DEFAULT_BOARD_TYPE, array $values = []): array|false
    {
        $item = $this->requireItem($itemId, $boardType);
        $board = $this->requireBoard((int) $item['canvasId'], $boardType);
        $resolvedAuthor = $this->resolveAuthor($author);
        $milestoneId = $this->ticketService->quickAddMilestone([
            'editorId' => $resolvedAuthor,
            'headline' => $this->requireNonEmptyString($headline, 'headline'),
            'projectId' => (int) $board['projectId'],
            'tags' => $values['tags'] ?? '#ccc',
            'userId' => $resolvedAuthor,
        ]);

        if (is_array($milestoneId) || $milestoneId === false) {
            return false;
        }

        $this->repository($boardType)->patchCanvasItem($itemId, ['milestoneId' => (string) $milestoneId]);

        return $this->getItem($itemId, $boardType);
    }

    /**
     * @api
     */
    public function linkMilestone(int $itemId, int $milestoneId, string $boardType = self::DEFAULT_BOARD_TYPE): bool
    {
        $this->requireItem($itemId, $boardType);

        return $this->repository($boardType)->patchCanvasItem($itemId, ['milestoneId' => (string) $milestoneId]);
    }

    /**
     * @api
     */
    public function unlinkMilestone(int $itemId, string $boardType = self::DEFAULT_BOARD_TYPE): bool
    {
        $this->requireItem($itemId, $boardType);

        return $this->repository($boardType)->patchCanvasItem($itemId, ['milestoneId' => '']);
    }

    private function repository(string $boardType): BaseCanvasRepository
    {
        $boardType = $this->requireSupportedBoardType($boardType);

        return match ($boardType) {
            'ea' => $this->eacanvasRepository,
            'insights' => $this->insightscanvasRepository,
            'lean' => $this->leancanvasRepository,
            'minempathy' => $this->minempathycanvasRepository,
            'obm' => $this->obmcanvasRepository,
            'retros' => $this->retroscanvasRepository,
            'risks' => $this->riskscanvasRepository,
            'sb' => $this->sbcanvasRepository,
            'swot' => $this->swotcanvasRepository,
            self::DEFAULT_BOARD_TYPE => $this->valuecanvasRepository,
        };
    }

    private function boardTypeMetadata(string $boardType): array
    {
        $repository = $this->repository($boardType);

        return [
            'boardType' => $boardType,
            'boxes' => $repository->getCanvasTypes(),
            'canvasType' => "{$boardType}canvas",
            'dataLabels' => $repository->getDataLabels(),
            'deleteRequiresConfirm' => true,
            'disclaimer' => $repository->getDisclaimer(),
            'icon' => $repository->getIcon(),
            'relatesLabels' => $repository->getRelatesLabels(),
            'statusLabels' => $repository->getStatusLabels(),
            'title' => self::SUPPORTED_BOARD_TYPES[$boardType],
        ];
    }

    private function commentModule(string $boardType): string
    {
        return $this->requireSupportedBoardType($boardType).'canvasitem';
    }

    private function normalizeItemPayload(array $values, string $boardType): array
    {
        $payload = $this->filterAllowedFields($values, self::ITEM_WRITE_FIELDS);
        $payload['author'] = $this->resolveAuthor(isset($values['author']) && is_numeric($values['author']) ? (int) $values['author'] : null);
        $payload['box'] = $this->requireKnownBox((string) ($payload['box'] ?? ''), $boardType);
        $payload['canvasId'] = $this->requirePositiveInt($payload, 'canvasId');
        $payload['description'] = $this->requireNonEmptyString((string) ($payload['description'] ?? ''), 'description');

        if (! array_key_exists('status', $payload)) {
            $statusLabels = $this->repository($boardType)->getStatusLabels();
            $payload['status'] = $statusLabels === [] ? '' : array_key_first($statusLabels);
        }

        if (array_key_exists('relates', $payload) === false) {
            $relatesLabels = $this->repository($boardType)->getRelatesLabels();
            $payload['relates'] = $relatesLabels === [] ? '' : array_key_first($relatesLabels);
        }

        // Ensure all optional text fields are empty strings (not NULL) to prevent
        // canvas renderer errors when the UI performs string operations on these values.
        foreach (['assumptions', 'conclusion', 'data', 'data1', 'data2', 'data3', 'data4', 'data5', 'action', 'setting', 'tags', 'kpi'] as $textField) {
            if (array_key_exists($textField, $payload) === false || $payload[$textField] === null) {
                $payload[$textField] = '';
            }
        }

        return $payload;
    }

    private function filterAllowedFields(array $values, array $allowedFields): array
    {
        $allowed = array_flip($allowedFields);
        $filtered = [];

        foreach ($values as $key => $value) {
            if (is_string($key) && array_key_exists($key, $allowed)) {
                $filtered[$key] = $value;
            }
        }

        return $filtered;
    }

    private function requireBoard(int $boardId, string $boardType): array
    {
        $board = $this->getBoard($boardId, $boardType);

        if ($board === false) {
            throw new InvalidArgumentException('boardId does not reference the requested Canvas board type.');
        }

        return $board;
    }

    private function requireConfirmed(bool $confirm, string $operation): void
    {
        if (! $confirm) {
            throw new InvalidArgumentException("{$operation} requires confirm=true.");
        }
    }

    private function requireItem(int $itemId, string $boardType): array
    {
        $item = $this->getItem($itemId, $boardType);

        if ($item === false) {
            throw new InvalidArgumentException('itemId does not reference the requested Canvas board type.');
        }

        return $item;
    }

    private function requireKnownBox(string $box, string $boardType): string
    {
        $box = $this->requireNonEmptyString($box, 'box');

        if (! array_key_exists($box, $this->repository($boardType)->getCanvasTypes())) {
            throw new InvalidArgumentException("Unsupported box for {$boardType}: {$box}");
        }

        return $box;
    }

    private function requireSupportedBoardType(string $boardType): string
    {
        $boardType = $this->requireNonEmptyString($boardType, 'boardType');

        if (! array_key_exists($boardType, self::SUPPORTED_BOARD_TYPES)) {
            throw new InvalidArgumentException("Unsupported boardType: {$boardType}");
        }

        return $boardType;
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
