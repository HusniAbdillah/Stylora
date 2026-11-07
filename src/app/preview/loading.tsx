import { Skeleton } from "@/components/ui";

export default function LoadingPreview() {
  return (
    <div
      role="status"
      aria-label="Loading preview"
      className="mx-auto max-w-6xl space-y-6 p-6"
    >
      <Skeleton className="h-12 w-72" />
      <div className="grid gap-6 md:grid-cols-3">
        <Skeleton className="h-96" />
        <Skeleton className="aspect-[2/3]" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}
