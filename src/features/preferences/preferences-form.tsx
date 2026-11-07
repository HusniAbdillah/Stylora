"use client";

/* eslint-disable @next/next/no-img-element */
import { useState, type ReactNode } from "react";
import { Badge, Button, Chip, ConfirmDialog, Icon } from "@/components/ui";
import {
  type BodyIllustrationGroup,
  type IllustrationOption,
  type PreferencesDraft,
  type SkinSwatchOption,
  fitIllustrations,
  menBodyIllustrations,
  skinSwatchOptions,
  styleIllustrations,
  womenBodyIllustrations,
} from "./preferences-types";
import styles from "./preferences.module.css";

type PreferenceSectionProps = {
  id: string;
  title: string;
  description: string;
  usedIn: string;
  example?: string;
  children: ReactNode;
};

function PreferenceSection({
  id,
  title,
  description,
  usedIn,
  example,
  children,
}: PreferenceSectionProps) {
  return (
    <section className={styles.section} id={id} aria-labelledby={`${id}-title`}>
      <div className={styles.sectionHeading}>
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          <p>{description}</p>
        </div>
        <Badge tone="neutral" className={styles.usage}>
          <Icon name="sparkle" size={12} /> {usedIn}
        </Badge>
      </div>
      {children}
      {example && (
        <p className={styles.example}>
          <Icon name="info" size={14} /> {example}
        </p>
      )}
    </section>
  );
}

function ChoiceCard({
  option,
  selected,
  onClick,
  imageClassName,
}: {
  option: IllustrationOption;
  selected: boolean;
  onClick: () => void;
  imageClassName?: string;
}) {
  return (
    <button
      className={styles.choiceCard}
      type="button"
      aria-pressed={selected}
      onClick={onClick}
    >
      <span className={`${styles.choiceImage} ${imageClassName ?? ""}`}>
        <img src={option.imageSrc} alt="" />
      </span>
      <strong>{option.label}</strong>
      <small>{option.description}</small>
      {selected && (
        <span className={styles.check}>
          <Icon name="check" size={12} />
        </span>
      )}
    </button>
  );
}

const undertones = [
  {
    id: "warm",
    label: "Warm",
    description: "Ivory, rust, olive, camel",
    imageSrc: "/design/preferences/undertone-warm.svg",
  },
  {
    id: "cool",
    label: "Cool",
    description: "Icy blue, berry, slate, silver",
    imageSrc: "/design/preferences/undertone-cool.svg",
  },
  {
    id: "neutral",
    label: "Neutral",
    description: "Soft white, navy, rose, taupe",
    imageSrc: "/design/preferences/undertone-neutral.svg",
  },
  {
    id: "olive",
    label: "Olive",
    description: "Cream, sage, plum, bronze",
    imageSrc: "/design/preferences/undertone-olive.svg",
  },
  {
    id: "unsure",
    label: "Not sure",
    description: "We use the reference palette",
    imageSrc: "/design/preferences/undertone-unsure.svg",
  },
];

const contrastOptions = [
  {
    id: "soft",
    label: "Soft",
    description: "Tonal, close shades",
    imageSrc: "/design/preferences/contrast-soft.svg",
  },
  {
    id: "medium",
    label: "Medium",
    description: "Ivory with charcoal",
    imageSrc: "/design/preferences/contrast-medium.svg",
  },
  {
    id: "strong",
    label: "Strong",
    description: "Black and white",
    imageSrc: "/design/preferences/contrast-strong.svg",
  },
];

const practicalGroups: Array<{
  key: keyof PreferencesDraft;
  label: string;
  choices: string[];
}> = [
  {
    key: "proportions",
    label: "Proportions",
    choices: ["Short torso", "Long torso", "Shorter legs", "Longer legs"],
  },
  {
    key: "climate",
    label: "Climate",
    choices: ["Hot and humid", "Mild", "Many seasons"],
  },
  {
    key: "occasions",
    label: "Occasions",
    choices: ["Everyday", "Work", "Travel", "Evening"],
  },
  {
    key: "coverage",
    label: "Coverage",
    choices: ["Shoulders covered", "Modest full coverage", "No preference"],
  },
  {
    key: "lengths",
    label: "Lengths",
    choices: ["Shorter hems", "Knee length", "Longer hems"],
  },
  {
    key: "layering",
    label: "Layering",
    choices: ["Light layers", "Structured layers", "Minimal layers"],
  },
  {
    key: "fabricDislikes",
    label: "Fabric dislikes",
    choices: ["Scratchy textures", "Heavy fabrics", "Shiny surfaces"],
  },
  {
    key: "footwearComfort",
    label: "Footwear comfort",
    choices: ["Flats only", "Low heels is fine", "Any height"],
  },
  {
    key: "careTolerance",
    label: "Care",
    choices: ["Easy care", "Hand wash is fine"],
  },
];

export type PreferencesFormProps = {
  value: PreferencesDraft;
  skinSwatches?: SkinSwatchOption[];
  bodyIllustrations?: Partial<
    Record<BodyIllustrationGroup, IllustrationOption[]>
  >;
  status?: "idle" | "draftSaving" | "saving" | "saved" | "error";
  statusMessage?: string;
  onChange: (value: PreferencesDraft) => void;
  onSave: () => void;
  onReset: () => void;
};

export function PreferencesForm({
  value,
  skinSwatches = skinSwatchOptions,
  bodyIllustrations,
  status = "idle",
  statusMessage,
  onChange,
  onSave,
  onReset,
}: PreferencesFormProps) {
  const [bodyGroupOverride, setBodyGroupOverride] =
    useState<BodyIllustrationGroup | null>(null);
  const bodyGroup = bodyGroupOverride ?? value.bodyIllustrationGroup ?? "women";
  const [resetOpen, setResetOpen] = useState(false);
  const saveStatusText =
    status === "draftSaving"
      ? "Saving draft…"
      : status === "saving"
        ? "Saving…"
        : status === "saved"
          ? (statusMessage ?? "Draft saved")
          : status === "error"
            ? (statusMessage ?? "Could not save")
            : "";

  const update = <K extends keyof PreferencesDraft>(
    key: K,
    next: PreferencesDraft[K],
  ) => onChange({ ...value, [key]: next });
  const toggleList = (key: keyof PreferencesDraft, choice: string) => {
    const current = Array.isArray(value[key]) ? (value[key] as string[]) : [];
    update(
      key,
      (current.includes(choice)
        ? current.filter((item) => item !== choice)
        : [...current, choice]) as never,
    );
  };
  const selectedBodyGroup =
    bodyGroup === "women"
      ? (bodyIllustrations?.women ?? womenBodyIllustrations)
      : (bodyIllustrations?.men ?? menBodyIllustrations);

  return (
    <div className={styles.preferences}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Optional and self-selected</p>
          <h1>
            Your style <em>profile.</em>
          </h1>
          <p className={styles.intro}>
            Tap pictures, not forms. Each choice shows where Stylora uses it.
            Nothing here is ever guessed from your photos, and you can skip any
            section. This sample profile stays in this browser.
          </p>
        </div>
        <div className={styles.saveTop}>
          <span className={styles.saveStatus} role="status">
            {saveStatusText}
          </span>
          <Button
            variant="primary"
            disabled={status === "saving"}
            onClick={onSave}
          >
            Save preferences
          </Button>
        </div>
      </header>

      <nav className={styles.sectionNav} aria-label="Preference sections">
        <a href="#skin-and-color">Skin and color</a>
        <a href="#body-and-fit">Body and fit</a>
        <a href="#style">Style</a>
        <a href="#life-and-comfort">Life and comfort</a>
      </nav>

      <div id="skin-and-color" className={styles.sectionGroup}>
        <PreferenceSection
          id="skin-tone"
          title="Skin tone"
          description="Sets the color of your avatar and helps balance contrast near the face. It never limits what you can wear."
          usedIn="Used in avatar, outfit advice"
          example="A medium contrast palette can look balanced. Strong black and white is still yours to choose."
        >
          <div className={styles.swatchGrid}>
            {skinSwatches.map((swatch) => (
              <button
                className={styles.swatchCard}
                key={swatch.id}
                type="button"
                aria-pressed={value.skinSwatchId === swatch.id}
                aria-label={`${swatch.label}, ${swatch.hex}`}
                onClick={() =>
                  onChange({
                    ...value,
                    skinSwatchId: swatch.id,
                    skinSwatchHex: swatch.hex,
                  })
                }
              >
                <img src={swatch.imageSrc} alt="" />
                <strong>{swatch.label}</strong>
                <small>{swatch.hex}</small>
                {value.skinSwatchId === swatch.id && (
                  <span className={styles.check}>
                    <Icon name="check" size={12} />
                  </span>
                )}
              </button>
            ))}
            <button
              className={styles.swatchCard}
              type="button"
              aria-pressed={!value.skinSwatchId}
              onClick={() =>
                onChange({ ...value, skinSwatchId: null, skinSwatchHex: null })
              }
            >
              <span className={styles.skipSwatch} />
              <strong>Skip</strong>
              <small>Neutral mannequin</small>
            </button>
          </div>
        </PreferenceSection>

        <PreferenceSection
          id="undertone"
          title="Undertone"
          description="Guides which colors feel harmonious next to your face. Treat it as a palette experiment, not a rule."
          usedIn="Used in color advice, avatar"
          example="Warm example: an ivory shirt near the face and charcoal lower down keeps warmth where it shows most."
        >
          <div className={styles.paletteGrid}>
            {undertones.map((option) => (
              <ChoiceCard
                key={option.id}
                option={option}
                selected={value.undertone === option.id}
                onClick={() =>
                  update(
                    "undertone",
                    value.undertone === option.id ? null : option.id,
                  )
                }
                imageClassName={styles.paletteImage}
              />
            ))}
          </div>
        </PreferenceSection>

        <PreferenceSection
          id="contrast"
          title="Contrast you enjoy"
          description="How much light and dark you like within one outfit."
          usedIn="Used in outfit ideas, capsules"
          example="A soft tonal look uses close shades; a stronger look pairs light and dark pieces. Choose what feels right for you."
        >
          <div className={styles.contrastGrid}>
            {contrastOptions.map((option) => (
              <ChoiceCard
                key={option.id}
                option={option}
                selected={value.contrast === option.id}
                onClick={() =>
                  update(
                    "contrast",
                    value.contrast === option.id ? null : option.id,
                  )
                }
                imageClassName={styles.contrastImage}
              />
            ))}
          </div>
        </PreferenceSection>
      </div>

      <div id="body-and-fit" className={styles.sectionGroup}>
        <PreferenceSection
          id="body-shape"
          title="Body shape"
          description="Helps explain where hems fall and how volume sits. Shapes are shorthand for silhouette advice, never a judgment or a goal."
          usedIn="Used in fit advice, avatar"
          example="A half tuck or belted layer can add a waist point if you want one. Straight, boxy shapes work just as well."
        >
          <div
            className={styles.groupTabs}
            role="group"
            aria-label="Body illustration set"
          >
            {(["women", "men"] as const).map((group) => (
              <button
                key={group}
                type="button"
                aria-pressed={bodyGroup === group}
                onClick={() => setBodyGroupOverride(group)}
              >
                {group === "women"
                  ? "Women’s illustrations"
                  : "Men’s illustrations"}
              </button>
            ))}
          </div>
          {selectedBodyGroup.length > 0 ? (
            <div className={styles.bodyGrid}>
              {selectedBodyGroup.map((option) => (
                <ChoiceCard
                  key={option.id}
                  option={option}
                  selected={
                    value.bodyIllustrationGroup === bodyGroup &&
                    value.bodyIllustrationId === option.id
                  }
                  onClick={() =>
                    onChange({
                      ...value,
                      bodyIllustrationGroup: bodyGroup,
                      bodyIllustrationId: option.id,
                    })
                  }
                  imageClassName={styles.bodyImage}
                />
              ))}
              <button
                className={styles.skipCard}
                type="button"
                onClick={() =>
                  onChange({
                    ...value,
                    bodyIllustrationGroup: null,
                    bodyIllustrationId: null,
                  })
                }
              >
                Skip
              </button>
            </div>
          ) : (
            <p className={styles.missingIllustrations}>
              Illustrations for this tab are unavailable. You can skip this
              choice and continue.
            </p>
          )}
          <button
            className={styles.clearLink}
            type="button"
            onClick={() =>
              onChange({
                ...value,
                bodyIllustrationGroup: null,
                bodyIllustrationId: null,
              })
            }
          >
            Clear selection
          </button>
        </PreferenceSection>

        <PreferenceSection
          id="fit"
          title="Fit you feel good in"
          description="The ease you prefer around the body. We never promise fit without sizes and measurements."
          usedIn="Used in outfit ideas, avatar"
          example="A relaxed shirt and straight trousers leave room to move while keeping a clear silhouette."
        >
          <div className={styles.fitGrid}>
            {fitIllustrations.map((option) => (
              <ChoiceCard
                key={option.id}
                option={option}
                selected={value.fit === option.id}
                onClick={() =>
                  update("fit", value.fit === option.id ? null : option.id)
                }
                imageClassName={styles.fitImage}
              />
            ))}
          </div>
        </PreferenceSection>
      </div>

      <div id="style" className={styles.sectionGroup}>
        <PreferenceSection
          id="style-references"
          title="Styles you reach for"
          description="Pick a few. They steer the fresh alternative idea and capsule templates."
          usedIn="Used in outfit ideas, capsules"
          example="A smart tailoring reference can suggest a crisp layer over pieces you already own."
        >
          <div className={styles.styleGrid}>
            {styleIllustrations.map((option) => (
              <ChoiceCard
                key={option.id}
                option={option}
                selected={value.styles?.includes(option.id) ?? false}
                onClick={() => toggleList("styles", option.id)}
                imageClassName={styles.styleImage}
              />
            ))}
          </div>
          <div className={styles.practicalRow}>
            <strong>Color families</strong>
            <div className={styles.chipRow}>
              {[
                "Warm neutrals",
                "Cool neutrals",
                "Earth tones",
                "Soft color",
                "Vivid accents",
              ].map((choice) => (
                <Chip
                  key={choice}
                  selected={value.colorFamilies?.includes(choice) ?? false}
                  onClick={() => toggleList("colorFamilies", choice)}
                >
                  {choice}
                </Chip>
              ))}
            </div>
          </div>
        </PreferenceSection>
      </div>

      <div id="life-and-comfort" className={styles.sectionGroup}>
        <PreferenceSection
          id="life-comfort"
          title="Life and comfort"
          description="Practical limits Stylora respects in every suggestion. Skip anything you are unsure about."
          usedIn="Used in all suggestions"
          example="Choosing flats and easy care keeps later recommendations aligned with your day."
        >
          <div className={styles.practicalGroups}>
            {practicalGroups.map((group) => (
              <div className={styles.practicalRow} key={group.key}>
                <strong>{group.label}</strong>
                <div className={styles.chipRow}>
                  {group.choices.map((choice) => (
                    <Chip
                      key={choice}
                      selected={
                        Array.isArray(value[group.key]) &&
                        (value[group.key] as string[]).includes(choice)
                      }
                      onClick={() => toggleList(group.key, choice)}
                    >
                      {choice}
                    </Chip>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </PreferenceSection>
      </div>

      <footer className={styles.footer}>
        <Button variant="quiet" onClick={() => setResetOpen(true)}>
          Reset all preferences
        </Button>
        <span className={styles.mobileSaveStatus} role="status">
          {saveStatusText}
        </span>
        <Button
          variant="primary"
          disabled={status === "saving"}
          onClick={onSave}
        >
          Save preferences
        </Button>
      </footer>

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset all preferences?"
        description="This clears saved style choices and the current draft in this browser. Wardrobe pieces stay in place."
        confirmLabel="Reset preferences"
        cancelLabel="Keep preferences"
        onConfirm={() => {
          setResetOpen(false);
          onReset();
        }}
      />
    </div>
  );
}
