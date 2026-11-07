export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl items-center px-6 py-12 sm:px-12">
      <div className="w-full rounded-2xl border border-stone bg-paper px-6 py-12 sm:px-12">
        <p className="text-sm font-semibold text-crimson">Stylora fashion studio</p>
        <h1 className="mt-4 max-w-2xl font-serif text-4xl tracking-tight sm:text-6xl">
          Turn outfit inspiration into everyday decisions
        </h1>
        <p className="mt-5 max-w-prose text-base leading-7 text-secondary">
          Stylora is being built to help you understand a look, find pieces you own, and decide what
          to wear next.
        </p>
      </div>
    </main>
  );
}
