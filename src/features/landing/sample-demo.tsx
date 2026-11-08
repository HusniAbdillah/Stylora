import { LandingDemo } from "./components/landing-demo";
import { getLandingSample } from "./sample";

export async function LandingSampleDemo() {
  const sample = await getLandingSample();
  return (
    <LandingDemo
      sample={
        sample
          ? {
              imageUrl: sample.imageUrl,
              pieces: sample.pieces.map(({ name, description }) => ({
                name,
                description,
              })),
              matches: sample.matches.map(({ name, outcome, imageUrl }) => ({
                name,
                outcome,
                imageUrl,
              })),
            }
          : undefined
      }
    />
  );
}
