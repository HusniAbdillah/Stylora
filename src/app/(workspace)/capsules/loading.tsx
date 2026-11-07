import { Skeleton } from "@/components/ui";

export default function CapsuleLoading() {
  return (
    <div
      role="status"
      aria-label="Loading Capsule Studio"
      className="mx-auto max-w-6xl space-y-6 p-6"
    >
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-12 w-1/2" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((index) => (
          <Skeleton key={index} className="aspect-[4/5]" />
        ))}
      </div>
    </div>
  );
}
