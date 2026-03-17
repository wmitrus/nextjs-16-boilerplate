export default function OnboardingLoading() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">
      <div className="bg-card rounded-lg border p-8 shadow-sm">
        <div className="mb-2 h-8 w-56 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="mb-6 h-4 w-72 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="space-y-6">
          <div>
            <div className="mb-2 h-4 w-28 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-10 w-full animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-900" />
          </div>
          <div>
            <div className="mb-2 h-4 w-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-10 w-full animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-900" />
          </div>
          <div>
            <div className="mb-2 h-4 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-10 w-full animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-900" />
          </div>
          <div className="h-10 w-full animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>
    </div>
  );
}
