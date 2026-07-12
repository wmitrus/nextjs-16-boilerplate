import type { MouseEventHandler, ReactNode } from 'react';

type SortDirection = false | 'asc' | 'desc';

function SortIndicator({ direction }: { direction: SortDirection }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex min-w-8 items-center justify-end gap-1 text-zinc-400"
    >
      <span
        className={[
          'block h-0 w-0 border-r-[4px] border-b-[5px] border-l-[4px] border-r-transparent border-l-transparent',
          direction === 'asc'
            ? 'border-b-zinc-700 dark:border-b-zinc-100'
            : 'border-b-zinc-300 dark:border-b-zinc-600',
        ].join(' ')}
      />
      <span
        className={[
          'block h-0 w-0 border-t-[5px] border-r-[4px] border-l-[4px] border-r-transparent border-l-transparent',
          direction === 'desc'
            ? 'border-t-zinc-700 dark:border-t-zinc-100'
            : 'border-t-zinc-300 dark:border-t-zinc-600',
        ].join(' ')}
      />
    </span>
  );
}

export function SortableHeaderButton({
  children,
  direction,
  onClick,
  label,
}: {
  children: ReactNode;
  direction: SortDirection;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1 text-left transition-colors hover:bg-zinc-100 focus:ring-2 focus:ring-zinc-400 focus:outline-none dark:hover:bg-zinc-700/60 dark:focus:ring-zinc-500"
      aria-label={label}
    >
      <span>{children}</span>
      <SortIndicator direction={direction} />
    </button>
  );
}
