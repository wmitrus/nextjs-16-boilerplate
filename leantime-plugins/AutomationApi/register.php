<?php

namespace Leantime\Plugins\AutomationApi;

use Leantime\Core\Events\EventDispatcher;

EventDispatcher::add_event_listener('leantime.plugin.enabled', function (): void {
    // Reserved for future bootstrapping if this plugin needs menus, assets, or middleware.
});
