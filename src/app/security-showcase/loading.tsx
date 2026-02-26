export default function SecurityShowcaseLoading() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-12">
      <div className="mb-8 h-10 w-80 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-lg border bg-zinc-100 dark:bg-zinc-900" />
        <div className="h-24 animate-pulse rounded-lg border bg-zinc-100 dark:bg-zinc-900" />
        <div className="h-24 animate-pulse rounded-lg border bg-zinc-100 dark:bg-zinc-900" />
      </div>
    </div>
  );
}
