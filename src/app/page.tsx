import {
  LandingAbout,
  LandingCallToAction,
  LandingFeatures,
  LandingFooter,
  LandingHeader,
  LandingHero,
  LandingSteps,
} from "@/features/landing/components";
import { getLandingSample } from "@/features/landing/sample";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const sample = await getLandingSample();
  const links = {
    createHref: "/create",
    sampleHref: "/sample",
    wardrobeHref: "/wardrobe",
    capsulesHref: "/capsules",
    previewHref: "/preview",
    savedLooksHref: "/saved-looks",
    preferencesHref: "/preferences",
  };
  return (
    <>
      <LandingHeader links={links} />
      <main>
        <LandingHero {...links} sample={sample ?? undefined} />
        <LandingSteps />
        <LandingFeatures {...links} />
        <LandingAbout />
        <LandingCallToAction {...links} />
      </main>
      <LandingFooter />
    </>
  );
}
