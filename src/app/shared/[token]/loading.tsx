import { Logo, Skeleton } from "@/components/ui";

export default function SharedLookLoading() {
  return (
    <main
      className="min-h-dvh bg-porcelain px-4 py-4 sm:px-10 lg:px-16"
      aria-busy="true"
    >
      <Logo />
      <p role="status" className="sr-only">
        Loading the shared look.
      </p>
      <div className="mx-auto mt-8 grid max-w-[1200px] items-center gap-8 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:gap-[72px]">
        <Skeleton className="block aspect-[3/4] w-full rounded-3xl lg:aspect-[2/3]" />
        <div>
          <Skeleton className="block h-14 w-3/4" />
          <Skeleton className="mt-5 block h-8 w-full" />
          <div className="mt-6 grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton
                key={index}
                className="block aspect-square rounded-xl"
              />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
