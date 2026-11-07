import { Skeleton } from "@/components/ui";

export function SavedFilterSkeleton() {
  return (
    <div aria-hidden="true" className="mt-5 flex gap-2">
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} className="h-11 w-24 rounded-full" />
      ))}
    </div>
  );
}

export function SavedCardsSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="mt-5 grid grid-cols-2 gap-4 xl:grid-cols-4"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="space-y-3">
          <Skeleton className="aspect-[3/4] rounded-2xl" />
          <Skeleton className="w-3/4" />
          <Skeleton className="w-1/2" />
        </div>
      ))}
    </div>
  );
}
