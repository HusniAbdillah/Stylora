import { LoadingLayout, Skeleton } from "@/components/ui";

export default function LoadingLook() {
  return (
    <div className="space-y-6 pb-24">
      <Skeleton className="h-12 max-w-3xl rounded-card" />
      <Skeleton className="h-12 max-w-xl" />
      <Skeleton className="h-14 max-w-xl" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]">
        <LoadingLayout
          kind="shopping"
          label="Loading outfit and shopping results"
        />
        <div className="space-y-4 rounded-card bg-paper p-6">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton />
          <Skeleton />
          <Skeleton className="w-2/3" />
        </div>
      </div>
    </div>
  );
}
