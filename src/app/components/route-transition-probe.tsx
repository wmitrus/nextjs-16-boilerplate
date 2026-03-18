'use client';

import { usePathname } from 'next/navigation';
import * as React from 'react';

import { getBrowserLogger } from '@/core/logger/browser';

export function RouteTransitionProbe() {
  const pathname = usePathname();
  const [committedPath, setCommittedPath] = React.useState(pathname);

  React.useEffect(() => {
    const logger = getBrowserLogger();

    setCommittedPath(pathname);

    logger.info(
      {
        event: 'route_probe:pathname_committed',
        component: 'RouteTransitionProbe',
        pathname,
      },
      'RouteTransitionProbe: pathname committed to client tree',
    );

    return () => {
      getBrowserLogger().debug(
        {
          event: 'route_probe:cleanup',
          component: 'RouteTransitionProbe',
          pathname,
        },
        'RouteTransitionProbe: effect cleanup',
      );
    };
  }, [pathname]);

  return (
    <p className="pointer-events-none fixed right-0 bottom-0 z-50 p-1 font-mono text-[10px] text-black/10 select-none">
      [route:{committedPath}]
    </p>
  );
}
