import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import Image from "next/image";

const meta = { title: "Foundations/Design library" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const colors = [
  "crimson",
  "crimson-deep",
  "ink",
  "porcelain",
  "paper",
  "night",
  "blush",
  "rose-wash",
  "camel",
  "sand",
  "sage",
  "stone",
  "secondary",
  "owned",
  "owned-bg",
  "alternative",
  "alternative-bg",
  "missing",
  "missing-bg",
] as const;
export const Tokens: Story = {
  render: () => (
    <div className="grid gap-6">
      <h2 className="font-display text-4xl">
        Stylora <em>in type.</em>
      </h2>
      <p className="font-sans">Inter for evidence, navigation and controls.</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        {colors.map((color) => (
          <figure key={color}>
            <div
              className="h-16 rounded-field border border-stone"
              style={{ backgroundColor: `var(--color-${color})` }}
            />
            <figcaption className="mt-2 break-words text-sm">
              --color-{color}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  ),
};

const assets = {
  "Sample wardrobe and references": [
    {
      label: "inspiration sample",
      file: "inspiration-sample.webp",
    },
    {
      label: "inspiration street",
      file: "inspiration-street.webp",
    },
    {
      label: "wardrobe ivory shirt",
      file: "wardrobe-ivory-shirt.webp",
    },
    {
      label: "wardrobe charcoal trousers",
      file: "wardrobe-charcoal-trousers.webp",
    },
    {
      label: "wardrobe dark loafers",
      file: "wardrobe-dark-loafers.webp",
    },
    {
      label: "wardrobe oxblood tote",
      file: "wardrobe-oxblood-tote.webp",
    },
    {
      label: "ds denim skirt",
      file: "ds-denim-skirt.webp",
    },
    {
      label: "ds white graphic tee",
      file: "ds-white-graphic-tee.webp",
    },
    {
      label: "ds pink floral dress",
      file: "ds-pink-floral-dress.webp",
    },
    {
      label: "ds navy zip hoodie",
      file: "ds-navy-zip-hoodie.webp",
    },
    {
      label: "ds grey trail runner",
      file: "ds-grey-trail-runner.webp",
    },
    {
      label: "ds white tennis polo",
      file: "ds-white-tennis-polo.webp",
    },
    {
      label: "ds brown stripe polo",
      file: "ds-brown-stripe-polo.webp",
    },
    {
      label: "ds purple team jersey",
      file: "ds-purple-team-jersey.webp",
    },
    {
      label: "ds grey yoga pants",
      file: "ds-grey-yoga-pants.webp",
    },
  ],
  "Illustrative avatars": [
    {
      label: "avatar a ivory charcoal",
      file: "avatar-aivory-charcoal.webp",
    },
    {
      label: "avatar b trench denim",
      file: "avatar-btrench-denim.webp",
    },
    {
      label: "avatar c evening",
      file: "avatar-cevening.webp",
    },
    {
      label: "avatar d navy polo",
      file: "avatar-dnavy-polo.webp",
    },
  ],
  "Marketplace mockups": [
    {
      label: "product trench 1",
      file: "product-trench1.webp",
    },
    {
      label: "product trench 2",
      file: "product-trench2.webp",
    },
    {
      label: "product trench 3",
      file: "product-trench3.webp",
    },
  ],
  "Editorial and templates": [
    {
      label: "about flatlay",
      file: "about-flatlay.webp",
    },
    {
      label: "tpl everyday ease",
      file: "tpl-everyday-ease.webp",
    },
    {
      label: "tpl modern workweek",
      file: "tpl-modern-workweek.webp",
    },
    {
      label: "tpl weekend travel",
      file: "tpl-weekend-travel.webp",
    },
    {
      label: "tpl warm weather",
      file: "tpl-warm-weather.webp",
    },
    {
      label: "tpl evening",
      file: "tpl-evening.webp",
    },
  ],
} as const;
export const Artwork: Story = {
  render: () => (
    <div className="space-y-8">
      {Object.entries(assets).map(([section, files]) => (
        <section key={section}>
          <h2 className="mb-3 font-display text-3xl">{section}</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
            {files.map(({ label, file }) => (
              <figure key={file}>
                <div className="relative aspect-square overflow-hidden rounded-card bg-paper">
                  <Image
                    src={`/design/images/${file}`}
                    alt={label}
                    unoptimized
                    fill
                    sizes="(max-width: 767px) 50vw, 220px"
                    className="object-contain"
                  />
                </div>
                <figcaption className="mt-2 text-sm">{label}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
    </div>
  ),
};
