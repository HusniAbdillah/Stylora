export type Choice = { slotId: string; optionItemId: string };

export function productChoiceContext(
  state: {
    detail: {
      slots: {
        slotId: string;
        candidates: Record<string, unknown>[];
      }[];
    };
    shopping: {
      searches: { id: string; slotId: string; status: string }[];
    };
  },
  slotId: string,
) {
  const search = state.shopping.searches.find(
    (entry) => entry.slotId === slotId && entry.status === "succeeded",
  );
  const missing = state.detail.slots
    .find((entry) => entry.slotId === slotId)
    ?.candidates.find(
      (entry) =>
        entry.kind === "missing" && typeof entry.optionItemId === "string",
    );
  if (!search || !missing || typeof missing.optionItemId !== "string")
    return null;
  return { searchId: search.id, optionItemId: missing.optionItemId };
}

export function selectionChoices(
  detail: {
    option: { revision: number };
    selection: { choices: Choice[] } | null;
    slots: { slotId: string; candidates: Record<string, unknown>[] }[];
  },
  draft?: { revision?: number; choices?: Choice[] },
): Choice[] {
  return detail.slots.flatMap((slot) => {
    const proposed =
      draft?.revision === detail.option.revision
        ? draft.choices?.find((choice) => choice.slotId === slot.slotId)
            ?.optionItemId
        : undefined;
    const previous = detail.selection?.choices.find(
      (choice) => choice.slotId === slot.slotId,
    )?.optionItemId;
    const chosenId = proposed ?? previous;
    const candidate =
      chosenId === undefined
        ? slot.candidates.find((item) => item.available === true)
        : slot.candidates.find(
            (item) => item.optionItemId === chosenId && item.available === true,
          );
    return candidate && typeof candidate.optionItemId === "string"
      ? [{ slotId: slot.slotId, optionItemId: candidate.optionItemId }]
      : [];
  });
}
