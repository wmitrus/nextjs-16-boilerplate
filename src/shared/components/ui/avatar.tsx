import Image from 'next/image';
import * as React from 'react';

import { cn } from '@/shared/utils/cn';

interface AvatarProps {
  name?: string | null;
  email?: string | null;
  imageUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (
        (parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')
      ).toUpperCase();
    }
    return (parts[0]?.[0] ?? '?').toUpperCase();
  }
  if (email) {
    return (email[0] ?? '?').toUpperCase();
  }
  return '?';
}

function getSizeClass(size: 'sm' | 'md' | 'lg'): string {
  if (size === 'sm') return 'h-7 w-7 text-xs';
  if (size === 'lg') return 'h-11 w-11 text-base';
  return 'h-9 w-9 text-sm';
}

function getSizePx(size: 'sm' | 'md' | 'lg'): number {
  if (size === 'sm') return 28;
  if (size === 'lg') return 44;
  return 36;
}

export function Avatar({
  name,
  email,
  imageUrl,
  size = 'md',
  className,
}: AvatarProps) {
  const initials = getInitials(name, email);
  const px = getSizePx(size);

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-800 font-medium text-white select-none dark:bg-zinc-200 dark:text-black',
        getSizeClass(size),
        className,
      )}
      aria-label={name ?? email ?? 'User avatar'}
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={name ?? email ?? 'User avatar'}
          width={px}
          height={px}
          className="h-full w-full object-cover"
          unoptimized
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </span>
  );
}
