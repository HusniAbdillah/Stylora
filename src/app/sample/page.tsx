import Link from "next/link";
import { Button, Logo } from "@/components/ui";
import { getLandingSample } from "@/features/landing/sample";
import { FixedSample } from "@/features/landing/fixed-sample";

export const dynamic = "force-dynamic";

export default async function SamplePage() {
  const sample = await getLandingSample();
  return (
    <main className="mx-auto max-w-[1320px] px-4 py-5 lg:px-16">
      <header className="flex items-center justify-between gap-4">
        <Link href="/" aria-label="Stylora home">
          <Logo />
        </Link>
        <Button asChild>
          <Link href="/create">Upload inspiration</Link>
        </Button>
      </header>
      {sample ? (
        <FixedSample sample={sample} />
      ) : (
        <section className="my-12 rounded-panel border border-stone bg-paper p-8">
          <h1 className="font-serif text-4xl">Sample unavailable</h1>
          <p className="mt-4 text-secondary">
            The prepared sample could not be loaded. No live analysis has been
            started.
          </p>
          <Button asChild variant="secondary" className="mt-6">
            <Link href="/sample">Reload sample</Link>
          </Button>
        </section>
      )}
    </main>
  );
}
