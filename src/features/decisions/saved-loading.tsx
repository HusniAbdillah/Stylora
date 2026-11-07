import { WorkspaceShell } from "@/components/shell";
import { Skeleton } from "@/components/ui";
import { SavedCardsSkeleton, SavedFilterSkeleton } from "./saved-skeletons";

export function SavedLooksLoading({ detail = false }: { detail?: boolean }) {
  return (
    <WorkspaceShell
      activeHref="/saved-looks"
      displayName="Studio guest"
      activity={[]}
      breadcrumbs={[{ label: "Saved looks" }]}
    >
      <div
        role="status"
        aria-label={detail ? "Preparing saved outfit" : "Preparing collection"}
        className="pb-8"
      >
        <span className="sr-only">
          {detail ? "Preparing saved outfit" : "Preparing collection"}
        </span>
        <div aria-hidden="true">
          {detail ? (
            <div className="grid items-start gap-6 md:grid-cols-[minmax(280px,420px)_minmax(0,1fr)] md:gap-8">
              <Skeleton className="aspect-[3/4] rounded-2xl md:aspect-[2/3]" />
              <div className="space-y-4">
                <Skeleton className="w-1/3" />
                <Skeleton className="h-12 w-3/4" />
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            </div>
          ) : (
            <>
              <Skeleton className="h-12 w-52" />
              <Skeleton className="mt-3 max-w-xl" />
              <SavedFilterSkeleton />
              <SavedCardsSkeleton />
            </>
          )}
        </div>
      </div>
    </WorkspaceShell>
  );
}
