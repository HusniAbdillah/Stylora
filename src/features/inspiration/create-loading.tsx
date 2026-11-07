import { Skeleton } from "@/components/ui";

export function CreateLoading({ step = "upload" }: { step?: string }) {
  return (
    <div role="status" aria-label={`Loading ${step}`} className="py-6">
      <Skeleton className="mb-6 h-14 w-full max-w-3xl rounded-panel" />
      <Skeleton className="h-12 w-80 max-w-full" />
      <div
        className={`mt-8 grid gap-5 ${step === "ideas" ? "md:grid-cols-3" : "md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]"}`}
      >
        {Array.from({ length: step === "ideas" ? 3 : 2 }, (_, index) => (
          <div
            key={index}
            className="rounded-panel border border-stone bg-paper p-4"
          >
            <Skeleton
              className={`${index === 0 && step !== "ideas" ? "h-[440px]" : "h-64"} w-full rounded-card`}
            />
            <Skeleton className="mt-4 h-5 w-3/4" />
            <Skeleton className="mt-3 h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
