import { expect, it } from "vitest";
import { changeField, intakeFields } from "./client";
it("keeps the seven design groups after category while editing canonical fields independently", () => {
  const item = {
    name: "Shirt",
    category: "top" as const,
    subcategory: null,
    description: "",
    attributes: {
      colors: ["blue"],
      silhouette: "straight",
      fit: "relaxed",
      neckline: "crew",
      sleeve: "short",
      closure: "buttons",
    },
  };
  expect([...new Set(intakeFields(item).map((field) => field.group))]).toEqual([
    "Colors",
    "Pattern",
    "Fabric look",
    "Silhouette and fit",
    "Length",
    "Neckline and sleeve",
    "Occasion",
  ]);
  const edited = changeField(
    changeField(item, "attributes.fit", "close"),
    "attributes.colors",
    "blue, white",
  );
  expect(edited.attributes).toMatchObject({
    colors: ["blue", "white"],
    silhouette: "straight",
    fit: "close",
    neckline: "crew",
    sleeve: "short",
    closure: "buttons",
  });
});
