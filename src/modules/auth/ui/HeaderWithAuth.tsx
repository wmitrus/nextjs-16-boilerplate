import { Header } from '@/shared/components/Header';

import { HeaderAuthControls } from './HeaderAuthControls';

export function HeaderWithAuth() {
  return <Header rightContent={<HeaderAuthControls />} />;
}
