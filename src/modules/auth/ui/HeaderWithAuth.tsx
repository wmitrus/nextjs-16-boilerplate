import { env } from '@/core/env';

import { Header } from '@/shared/components/Header';

import { HeaderAuthControlsAuthjs } from './authjs/HeaderAuthControlsAuthjs';
import { HeaderAuthControls } from './HeaderAuthControls';
import { HeaderAuthFallback } from './HeaderAuthFallback';

export function HeaderWithAuth() {
  const provider = env.AUTH_PROVIDER;

  return (
    <Header
      rightContent={
        provider === 'clerk' ? (
          <HeaderAuthControls />
        ) : provider === 'authjs' ? (
          <HeaderAuthControlsAuthjs />
        ) : (
          <HeaderAuthFallback />
        )
      }
    />
  );
}
