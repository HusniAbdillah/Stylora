type Context = {
  draftId: string | null;
  revision: number;
  preferenceRevision: number;
  epoch: number;
  renderFingerprint: string | null;
};

export function isCurrentPreviewResponse(
  current: Context,
  requested: Context,
  response: {
    draftId: string;
    revision: number;
    preferenceRevision: number;
    renderRequestId?: string;
  },
  pendingRender?: string,
) {
  return (
    current.draftId === requested.draftId &&
    response.draftId === current.draftId &&
    current.preferenceRevision === requested.preferenceRevision &&
    response.preferenceRevision >= current.preferenceRevision &&
    current.epoch === requested.epoch &&
    current.renderFingerprint === requested.renderFingerprint &&
    response.revision >= requested.revision &&
    (current.revision === requested.revision ||
      (!!pendingRender && response.renderRequestId === pendingRender))
  );
}
