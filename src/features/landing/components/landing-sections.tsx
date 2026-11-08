import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button, Icon } from "@/components/ui";
import { LandingDemo, type LandingSample } from "./landing-demo";
import styles from "./landing.module.css";

export type LandingLinks = {
  createHref: string;
  sampleHref?: string;
  wardrobeHref: string;
  capsulesHref: string;
  previewHref: string;
  savedLooksHref: string;
  preferencesHref: string;
};

const images = "/design/images/";
const avatars = [
  "avatar-aivory-charcoal.webp",
  "avatar-btrench-denim.webp",
  "avatar-cevening.webp",
  "avatar-dnavy-polo.webp",
];
const steps = [
  {
    title: "Scan",
    description: "Upload a photo. We read the outfit, never the person.",
    mobile: "We read the outfit, never the person.",
    image: "inspiration-sample.webp",
  },
  {
    title: "Describe",
    description: "Each piece becomes an editable description with evidence.",
    mobile: "Editable descriptions with evidence.",
    image: null,
  },
  {
    title: "Match",
    description: "See what you own, what could stand in and what is missing.",
    mobile: "What you own, what can stand in, what is missing.",
    image: "wardrobe-ivory-shirt.webp",
  },
  {
    title: "Style and shop",
    description: "Three ideas, then shopping only for the missing pieces.",
    mobile: "Three ideas, shopping only for gaps.",
    image: "product-trench1.webp",
  },
] as const;

function Picture({
  file,
  className = "",
}: {
  file: string;
  className?: string;
}) {
  return (
    <Image
      src={images + file}
      width={600}
      height={600}
      alt=""
      className={`${styles.picture} ${className}`}
    />
  );
}

export function LandingHero({
  createHref,
  sampleHref,
  sample,
  demo,
}: Pick<LandingLinks, "createHref" | "sampleHref"> & {
  sample?: LandingSample;
  demo?: ReactNode;
}) {
  return (
    <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>
          <Icon name="sparkle" size={14} />
          <span className={styles.desktop}>
            An AI stylist for the clothes you already own
          </span>
          <span className={styles.mobile}>AI stylist for clothes you own</span>
        </p>
        <h1>
          Wear the look you saved,<em>with what you own.</em>
        </h1>
        <p className={styles.heroDescription}>
          <span className={styles.desktop}>
            Upload an outfit from your feed. Stylora describes every piece,
            finds what is already in your wardrobe, suggests three ways to wear
            it and shops only for the real gaps.
          </span>
          <span className={styles.mobile}>
            Upload an outfit. See every piece, what you already own and three
            ways to wear it.
          </span>
        </p>
      </div>
      <div className={styles.heroVisual}>
        {demo ?? <LandingDemo sample={sample} />}
      </div>
      <div className={styles.heroActions}>
        <div className={styles.actions}>
          <Button size="large" asChild>
            <Link href={createHref}>Upload inspiration</Link>
          </Button>
          {sampleHref && (
            <Button variant="secondary" size="large" asChild>
              <Link href={sampleHref}>Try the sample look</Link>
            </Button>
          )}
        </div>
        <ul className={styles.claims}>
          <li>
            <Icon name="check" size={16} />
            Editable text descriptions
          </li>
          <li>
            <Icon name="swap" size={16} />
            Real wardrobe matches
          </li>
          <li>
            <Icon name="bag" size={16} />
            Shopping for gaps only
          </li>
        </ul>
      </div>
    </section>
  );
}

export function LandingSteps() {
  return (
    <section className={`${styles.section} ${styles.stepsSection}`}>
      <div className={styles.sectionInner}>
        <p className={styles.kicker}>How it works</p>
        <h2>
          <span className={styles.desktop}>
            From a saved post to a plan in four steps
          </span>
          <span className={styles.mobile}>Four steps, about a minute</span>
        </h2>
        <div className={styles.steps}>
          {steps.map((step, index) => (
            <article key={step.title} className={styles.step}>
              <div className={styles.stepProgress} />
              <div className={styles.stepVisual}>
                {step.image ? (
                  <Picture file={step.image} />
                ) : (
                  <div className={styles.descriptionExample}>
                    <strong>Stone trench coat</strong>
                    <span>Outerwear, belted trench</span>
                    <p>Fabric look: Gabardine-like</p>
                    <p>Fit: Relaxed</p>
                    <p>Length: Below the knee</p>
                    <p>
                      <Icon name="sparkle" size={12} />
                      For you: warm neutral
                    </p>
                  </div>
                )}
              </div>
              <div className={styles.stepText}>
                <span className={styles.stepNumber}>{index + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>
                    <span className={styles.desktop}>{step.description}</span>
                    <span className={styles.mobile}>{step.mobile}</span>
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
        <p className={styles.illustrative}>
          Illustrative process and sample imagery
        </p>
      </div>
    </section>
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
  const cards = [
    {
      title: "Wardrobe",
      href: wardrobeHref,
      description:
        "Add a piece with one photo. AI writes the description; you confirm it.",
      files: [
        "wardrobe-ivory-shirt.webp",
        "wardrobe-charcoal-trousers.webp",
        "wardrobe-dark-loafers.webp",
        "wardrobe-oxblood-tote.webp",
        "ds-pink-floral-dress.webp",
        "ds-brown-stripe-polo.webp",
      ],
      kind: "wardrobe",
    },
    {
      title: "Capsules",
      href: capsulesHref,
      description:
        "Pick one of five templates and get several outfits from the same pieces.",
      files: ["tpl-weekend-travel.webp"],
      kind: "capsules",
    },
    {
      title: "Preview",
      href: previewHref,
      description:
        "Choose one piece per category and see it on an avatar that uses your selected swatch and body reference.",
      files: avatars.slice(1),
      kind: "preview",
    },
    {
      title: "Saved looks",
      href: savedLooksHref,
      description:
        "Every saved look gets an avatar image and a clean public page you can control.",
      files: [avatars[0]],
      kind: "saved",
    },
  ];
  return (
    <section className={`${styles.section} ${styles.featuresSection}`}>
      <div className={styles.sectionInner}>
        <p className={`${styles.kicker} ${styles.desktop}`}>
          One wardrobe, many ways
        </p>
        <h2>Everything connects to what you own</h2>
        <div className={styles.features}>
          {cards.map((card) => (
            <Link
              key={card.title}
              href={card.href}
              className={styles.feature}
              data-kind={card.kind}
            >
              <div className={styles.featureImages}>
                {card.files.map((file) => (
                  <Picture key={file} file={file} />
                ))}
                {card.kind === "saved" && (
                  <div className={styles.savedExample}>
                    <h4>Ivory and charcoal</h4>
                    <p>Relaxed tailoring for everyday plans.</p>
                    <div>
                      {[
                        "wardrobe-ivory-shirt.webp",
                        "wardrobe-charcoal-trousers.webp",
                        "wardrobe-dark-loafers.webp",
                      ].map((file) => (
                        <Picture key={file} file={file} />
                      ))}
                    </div>
                    <span>
                      <Icon name="link" size={14} />
                      Share link, expires in 7 days
                    </span>
                  </div>
                )}
              </div>
              <div className={styles.featureHeading}>
                <h3>{card.title}</h3>
                <span>
                  Open {card.title.toLowerCase()}
                  <Icon name="arrowRight" size={16} />
                </span>
              </div>
              <p className={styles.featureDescription}>{card.description}</p>
            </Link>
          ))}
        </div>
        <p className={styles.illustrative}>Illustrative feature previews</p>
      </div>
    </section>
  );
}

export function LandingAbout() {
  return (
    <section id="about" className={`${styles.section} ${styles.aboutSection}`}>
      <div className={styles.about}>
        <Picture file="about-flatlay.webp" />
        <div>
          <p className={styles.kicker}>About Stylora</p>
          <h2>The best outfit is often already in your closet</h2>
          <p className={styles.aboutIntro}>
            We built Stylora for people who save outfits but rarely recreate
            them. It reads the look like a senior stylist, then starts with what
            you own.
          </p>
          <ul>
            <li>
              <Icon name="search" size={22} />
              <div>
                <h3>Transparent reasoning</h3>
                <p>
                  Every idea lists why it works, which of your inputs it used
                  and what it cannot know.
                </p>
              </div>
            </li>
            <li>
              <Icon name="swap" size={22} />
              <div>
                <h3>Strict, honest matches</h3>
                <p>
                  A football jersey is never sold to you as a blouse
                  alternative. Missing is a valid answer.
                </p>
              </div>
            </li>
            <li>
              <Icon name="heart" size={22} />
              <div>
                <h3>Reuse before buying</h3>
                <p>
                  Shopping appears only for a real gap, and saved items stay
                  candidates until you own them.
                </p>
              </div>
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
    <section className={styles.cta}>
      <div>
        <h2>Start with one saved outfit.</h2>
        <p>It takes a minute. Your draft is kept if you leave and come back.</p>
      </div>
      <Button variant="secondary" size="large" asChild>
        <Link href={createHref}>Upload inspiration</Link>
      </Button>
      <div
        className={styles.ctaPortraits}
        aria-label="Illustrative outfit previews"
      >
        {avatars.map((file) => (
          <Picture key={file} file={file} />
        ))}
      </div>
    </section>
  );
}
