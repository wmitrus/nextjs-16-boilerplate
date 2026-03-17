'use client';

import { usePathname } from 'next/navigation';
import * as React from 'react';

import { getBrowserLogger } from '@/core/logger/browser';

export function OnboardingClientProbe() {
  const pathname = usePathname();
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    const logger = getBrowserLogger();

    setHydrated(true);

    logger.info(
      {
        event: 'onboarding_client:mount',
        component: 'OnboardingClientProbe',
        pathname,
        hydrationMarker: 'client-tree-committed',
      },
      'OnboardingClientProbe: mounted and hydrated',
    );

    return () => {
      getBrowserLogger().debug(
        {
          event: 'onboarding_client:unmount',
          component: 'OnboardingClientProbe',
          pathname,
        },
        'OnboardingClientProbe: unmounted',
      );
    };
  }, [pathname]);

  if (!hydrated) {
    return null;
  }

  return (
    <p className="mt-2 text-center text-xs opacity-20">[onboarding:hydrated]</p>
  );
}
