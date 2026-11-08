import { Suspense } from "react";
import {
  LandingAbout,
  LandingCallToAction,
  LandingFeatures,
  LandingFooter,
  LandingHeader,
  LandingHero,
  LandingSteps,
  LandingDemo,
} from "@/features/landing/components";
import { LandingSampleDemo } from "@/features/landing/sample-demo";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const links = {
    createHref: "/create",
    sampleHref: "/create?sample=1",
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
        <LandingHero
          {...links}
          demo={
            <Suspense fallback={<LandingDemo loading />}>
              <LandingSampleDemo />
            </Suspense>
          }
        />
        <LandingSteps />
        <LandingFeatures {...links} />
        <LandingAbout />
        <LandingCallToAction {...links} />
      </main>
      <LandingFooter />
    </>
  );
}
