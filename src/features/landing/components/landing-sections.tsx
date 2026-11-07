import Image from "next/image";
import Link from "next/link";
import { Button, Icon } from "@/components/ui";
import { LandingDemo } from "./landing-demo";

export type LandingLinks = {
  createHref: string;
  sampleHref?: string;
  wardrobeHref: string;
  capsulesHref: string;
  previewHref: string;
  savedLooksHref: string;
  preferencesHref: string;
};

const steps = [
  {
    number: "1",
    title: "Scan",
    description: "Upload a photo. We read the outfit, never the person.",
    image: "/design/images/inspiration-sample.webp",
  },
  {
    number: "2",
    title: "Describe",
    description: "Every piece becomes an editable description with evidence.",
    image: "/design/images/wardrobe-ivory-shirt.webp",
  },
  {
    number: "3",
    title: "Match",
    description: "See what you own, what could stand in, and what is missing.",
    image: "/design/images/wardrobe-charcoal-trousers.webp",
  },
  {
    number: "4",
    title: "Style and shop",
    description: "Three ideas, then shopping only for the missing pieces.",
    image: "/design/images/product-trench1.webp",
  },
] as const;

export function LandingHero({
  createHref,
  sampleHref,
}: Pick<LandingLinks, "createHref" | "sampleHref">) {
  return (
    <section className="mx-auto grid max-w-[1320px] items-center gap-10 px-4 pb-16 pt-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-16 lg:px-12 lg:pb-24 lg:pt-20">
      <div className="order-1 max-w-[650px]">
        <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-blush px-3 py-1.5 text-xs font-medium text-crimson">
          <Icon name="sparkle" className="size-3.5" />
          AI stylist for clothes you own
        </p>
        <h1 className="font-serif text-[clamp(2.65rem,5vw,5rem)] leading-[1.04] tracking-[-0.045em] text-ink">
          Wear the look you saved,{" "}
          <em className="font-normal text-crimson">with what you own.</em>
        </h1>
        <p className="mt-6 max-w-[530px] text-base leading-7 text-secondary">
          Upload an outfit from your feed. Stylora describes every piece, finds
          what is already in your wardrobe, suggests three ways to wear it and
          helps shop for the real gaps.
        </p>
        <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
          <Button variant="primary" asChild>
            <Link href={createHref}>Upload inspiration</Link>
          </Button>
          {sampleHref && (
            <Button variant="secondary" asChild>
              <Link href={sampleHref}>Try the sample look</Link>
            </Button>
          )}
        </div>
        <p className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-secondary">
          <span>✓ Editable text descriptions</span>
          <span>✓ Real wardrobe matches</span>
          <span>✓ Shopping for gaps only</span>
        </p>
      </div>
      <div className="order-2">
        <LandingDemo />
      </div>
    </section>
  );
}

export function LandingSteps() {
  return (
    <section className="bg-paper px-4 py-14 sm:px-8 lg:px-12 lg:py-20">
      <div className="mx-auto max-w-[1320px]">
        <p className="text-xs font-semibold text-crimson">How it works</p>
        <h2 className="mt-2 font-serif text-3xl tracking-tight sm:text-[40px]">
          From a saved post to a plan in four steps
        </h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <article
              key={step.number}
              className="overflow-hidden rounded-2xl border border-stone bg-porcelain p-3"
            >
              <div className="relative hidden aspect-[1.35] overflow-hidden rounded-xl bg-sand sm:block">
                <Image
                  src={step.image}
                  alt=""
                  fill
                  sizes="(max-width: 1024px) 45vw, 23vw"
                  className="object-contain"
                />
              </div>
              <div className="flex items-start gap-3 pt-2 sm:pt-4">
                <span className="font-serif text-2xl italic text-crimson">
                  {step.number}
                </span>
                <div>
                  <h3 className="font-semibold text-ink">{step.title}</h3>
                  <p className="mt-1 text-sm leading-5 text-secondary">
                    {step.description}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  title,
  description,
  href,
  images,
  className = "",
}: {
  title: string;
  description: string;
  href: string;
  images: string[];
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`group block min-w-0 overflow-hidden rounded-[20px] bg-paper p-3 transition-shadow hover:shadow-lg focus-visible:outline-crimson ${className}`}
    >
      <div
        className={`grid h-[200px] gap-1.5 overflow-hidden rounded-xl bg-sand ${images.length > 1 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1"}`}
      >
        {images.map((src) => (
          <div key={src} className="relative min-w-0 overflow-hidden">
            <Image
              src={src}
              alt=""
              fill
              sizes="(max-width: 640px) 45vw, 20vw"
              className="object-cover"
            />
          </div>
        ))}
      </div>
      <div className="flex items-start justify-between gap-3 px-1 pb-2 pt-4">
        <div>
          <h3 className="font-serif text-2xl">{title}</h3>
          <p className="mt-1 max-w-[480px] text-sm leading-5 text-secondary">
            {description}
          </p>
        </div>
        <Icon
          name="arrow-right"
          className="mt-1 size-5 shrink-0 text-crimson transition-transform group-hover:translate-x-1"
        />
      </div>
    </Link>
  );
}

export function LandingFeatures({
  wardrobeHref,
  capsulesHref,
  previewHref,
  savedLooksHref,
}: Pick<
  LandingLinks,
  "wardrobeHref" | "capsulesHref" | "previewHref" | "savedLooksHref"
>) {
  return (
    <section className="px-4 py-16 sm:px-8 lg:px-12 lg:py-20">
      <div className="mx-auto max-w-[1320px]">
        <p className="text-xs font-semibold text-crimson">
          One wardrobe, many ways
        </p>
        <h2 className="mt-2 max-w-xl font-serif text-3xl tracking-tight sm:text-[40px]">
          Everything connects to what you own
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <FeatureCard
            title="Wardrobe"
            description="Add a piece with one photo. AI writes the description; you confirm it."
            href={wardrobeHref}
            images={[
              "/design/images/wardrobe-ivory-shirt.webp",
              "/design/images/wardrobe-charcoal-trousers.webp",
              "/design/images/wardrobe-dark-loafers.webp",
              "/design/images/wardrobe-oxblood-tote.webp",
            ]}
          />
          <FeatureCard
            title="Capsules"
            description="Pick one of five templates and get several outfits from the clothes you own."
            href={capsulesHref}
            images={["/design/images/tpl-weekend-travel.webp"]}
          />
          <FeatureCard
            title="Preview"
            description="Choose one piece per category and see it on an avatar that uses your own selections."
            href={previewHref}
            images={["/design/images/avatar-btrench-denim.webp"]}
          />
          <FeatureCard
            title="Saved looks"
            description="Every saved look gets an avatar image and a clean public page you can control."
            href={savedLooksHref}
            images={["/design/images/avatar-aivory-charcoal.webp"]}
          />
        </div>
      </div>
    </section>
  );
}

export function LandingAbout() {
  return (
    <section
      id="about"
      className="bg-paper px-4 py-16 sm:px-8 lg:px-12 lg:py-20"
    >
      <div className="mx-auto grid max-w-[1320px] items-center gap-8 lg:grid-cols-2 lg:gap-14">
        <div className="relative aspect-[1.35] overflow-hidden rounded-[20px] bg-sand">
          <Image
            src="/design/images/about-flatlay.webp"
            alt="A considered flat-lay of clothing and accessories"
            fill
            sizes="(max-width: 1024px) 100vw, 48vw"
            className="object-cover"
          />
        </div>
        <div>
          <p className="text-xs font-semibold text-crimson">About Stylora</p>
          <h2 className="mt-2 font-serif text-3xl tracking-tight sm:text-[40px]">
            The best outfit is often already in your closet
          </h2>
          <p className="mt-4 text-base leading-7 text-secondary">
            We built Stylora for people who save outfits but rarely recreate
            them. It reads the details, finds a credible match, and shows what
            is worth looking for when something is missing.
          </p>
          <ul className="mt-7 space-y-5 text-sm leading-6">
            <li className="flex gap-3">
              <Icon
                name="search"
                className="mt-1 size-5 shrink-0 text-crimson"
              />
              <span>
                <strong className="block text-ink">
                  Transparent reasoning
                </strong>
                <span className="text-secondary">
                  Every idea tells why it works, what you own and what it cannot
                  know.
                </span>
              </span>
            </li>
            <li className="flex gap-3">
              <Icon name="swap" className="mt-1 size-5 shrink-0 text-crimson" />
              <span>
                <strong className="block text-ink">
                  Strict, honest matches
                </strong>
                <span className="text-secondary">
                  A football jersey is never sold to you as a blouse
                  alternative. Missing is a valid answer.
                </span>
              </span>
            </li>
            <li className="flex gap-3">
              <Icon
                name="heart"
                className="mt-1 size-5 shrink-0 text-crimson"
              />
              <span>
                <strong className="block text-ink">Reuse before buying</strong>
                <span className="text-secondary">
                  Shopping appears only for a real gap, and saved items stay
                  candidates until you own them.
                </span>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

export function LandingCallToAction({
  createHref,
}: Pick<LandingLinks, "createHref">) {
  return (
    <section className="bg-crimson px-4 py-10 text-paper sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-[1320px] flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-serif text-3xl tracking-tight">
            Start with one saved outfit.
          </h2>
          <p className="mt-1 text-sm text-rose-wash">
            It takes an image. Your closet is already less of a mystery.
          </p>
        </div>
        <Button variant="secondary" asChild>
          <Link href={createHref}>Upload inspiration</Link>
        </Button>
      </div>
    </section>
  );
}
