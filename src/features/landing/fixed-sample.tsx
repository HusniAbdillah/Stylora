"use client";

import { useState } from "react";
import { Chip } from "@/components/ui";
import {
  ReviewPieces,
  type DetectedPiece,
} from "@/features/inspiration/components";
import { WardrobeMatchView } from "@/features/matching/components";
import type { getLandingSample } from "./sample";

type Sample = NonNullable<Awaited<ReturnType<typeof getLandingSample>>>;

export function FixedSample({ sample }: { sample: Sample }) {
  const [step, setStep] = useState("review");
  return (
    <section className="py-6">
      <div className="rounded-panel border border-rose-wash bg-blush px-4 py-3 text-sm">
        <strong>Prepared sample</strong>
        <p className="mt-1">
          Read-only example stored in the shared database. No AI calls run while
          you explore it. Sample wardrobe is separate from live inventory.
        </p>
      </div>
      <nav
        aria-label="Sample sections"
        className="mt-5 flex gap-2 overflow-x-auto"
      >
        {["review", "matches", "ideas"].map((value) => (
          <Chip
            key={value}
            selected={step === value}
            onClick={() => setStep(value)}
          >
            {value === "review"
              ? "Review pieces"
              : value === "matches"
                ? "Wardrobe match"
                : "Outfit ideas"}
          </Chip>
        ))}
      </nav>
      {step === "review" && (
        <ReviewPieces
          imageUrl={sample.imageUrl}
          pieces={sample.pieces.map((piece, index) => ({
            id: String(index),
            name: piece.name,
            category: piece.category as DetectedPiece["category"],
            attributes: Object.entries(piece.attributes)
              .filter(([, v]) => typeof v === "string")
              .slice(0, 5)
              .map(([label, value]) => ({
                label: label.replace(/([A-Z])/g, " $1"),
                value: String(value),
              })),
            evidence: piece.description,
          }))}
          confidence={{
            status: "ready",
            insights: sample.confidence.insights,
            occasions: sample.confidence.occasions,
            uncertainty: sample.confidence.explanation.uncertainty.join(" "),
          }}
        />
      )}
      {step === "matches" && (
        <WardrobeMatchView
          matches={sample.matches.map((match, index) => ({
            id: String(index),
            outcome:
              match.outcome === "owned"
                ? "owned_match"
                : match.outcome === "alternative"
                  ? "wardrobe_alternative"
                  : "missing",
            inspiration: { name: match.inspirationName },
            wardrobeItem: match.wardrobeItemId
              ? {
                  id: match.wardrobeItemId,
                  name: match.name,
                  imageUrl: match.imageUrl,
                }
              : null,
          }))}
        />
      )}
      {step === "ideas" && (
        <div className="py-8">
          <p className="text-sm text-crimson">Prepared directions</p>
          <h1 className="mt-2 font-serif text-[34px] leading-[38px] md:text-[48px] md:leading-[52px]">
            Three ways to <em className="text-crimson">wear it.</em>
          </h1>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {sample.ideas.map((idea) => (
              <article
                key={idea.direction}
                className="rounded-panel border border-stone bg-paper p-5"
              >
                <p className="text-xs font-semibold text-crimson">
                  {idea.direction.replaceAll("_", " ")}
                </p>
                <h2 className="mt-4 font-serif text-2xl">{idea.title}</h2>
                <h3 className="mt-5 text-sm font-semibold">Why this</h3>
                <ul className="mt-2 list-disc space-y-2 pl-4 text-sm text-secondary">
                  {idea.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                {idea.differences.map((text) => (
                  <p key={text} className="mt-3 text-sm">
                    {text}
                  </p>
                ))}
                {idea.uncertainty.map((text) => (
                  <p key={text} className="mt-3 text-sm text-secondary">
                    {text}
                  </p>
                ))}
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
