import { expect, it } from "vitest";
import { selectionChoices } from "./outfit-choice";

it("requires review of an unavailable saved or proposed choice instead of silently substituting a candidate", () => {
  const detail = {
    option: { revision: 1 },
    selection: { choices: [{ slotId: "top", optionItemId: "archived" }] },
    slots: [
      {
        slotId: "top",
        candidates: [
          { optionItemId: "archived", available: false },
          { optionItemId: "missing", available: true },
        ],
      },
    ],
  };
  expect(selectionChoices(detail)).toEqual([]);
  expect(
    selectionChoices(
      { ...detail, selection: null },
      { revision: 1, choices: [{ slotId: "top", optionItemId: "removed" }] },
    ),
  ).toEqual([]);
  expect(selectionChoices({ ...detail, selection: null })).toEqual([
    { slotId: "top", optionItemId: "missing" },
  ]);
  expect(
    selectionChoices(detail, {
      revision: 1,
      choices: [{ slotId: "top", optionItemId: "missing" }],
    }),
  ).toEqual([{ slotId: "top", optionItemId: "missing" }]);
});
