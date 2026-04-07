<?php

namespace Leantime\Plugins\AutomationApi\Services;

class AutomationApi
{
    public function install(): bool
    {
        return true;
    }

    public function uninstall(): bool
    {
        return true;
    }

    /**
     * @api
     */
    public function ping(): array
    {
        return [
            'ok' => true,
            'plugin' => 'AutomationApi',
            'version' => '0.1.0',
        ];
    }
}
