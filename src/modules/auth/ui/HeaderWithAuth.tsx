import { env } from '@/core/env';

import { Header } from '@/shared/components/Header';

import { HeaderAuthControls } from './HeaderAuthControls';
import { HeaderAuthFallback } from './HeaderAuthFallback';

export function HeaderWithAuth() {
  return (
    <Header
      rightContent={
        env.AUTH_PROVIDER === 'clerk' ? (
          <HeaderAuthControls />
        ) : (
          <HeaderAuthFallback />
        )
      }
    />
  );
}
