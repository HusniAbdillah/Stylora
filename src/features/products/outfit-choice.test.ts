import { expect, it } from "vitest";
import { productChoiceContext, selectionChoices } from "./outfit-choice";

it("requires a current successful search and missing-slot reference before attaching a product", () => {
  const state = {
    detail: {
      slots: [
        {
          slotId: "top",
          candidates: [{ kind: "missing", optionItemId: "missing-top" }],
        },
      ],
    },
    shopping: {
      searches: [{ id: "search-top", slotId: "top", status: "succeeded" }],
    },
  };
  expect(productChoiceContext(state, "top")).toEqual({
    searchId: "search-top",
    optionItemId: "missing-top",
  });
  expect(
    productChoiceContext({ ...state, shopping: { searches: [] } }, "top"),
  ).toBeNull();
  expect(
    productChoiceContext(
      {
        ...state,
        detail: {
          slots: [
            {
              slotId: "top",
              candidates: [{ kind: "product", optionItemId: "product" }],
            },
          ],
        },
      },
      "top",
    ),
  ).toBeNull();
});

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
