import { Button, Icon } from "@/components/ui";
import styles from "./wardrobe.module.css";

export type WardrobeEmptyStateProps = {
  onAddItem: () => void;
  onUseSample?: () => void;
  localPreview?: boolean;
};

export function WardrobeEmptyState({
  onAddItem,
  onUseSample,
  localPreview = false,
}: WardrobeEmptyStateProps) {
  return (
    <div className={styles.emptyCard}>
      <div className={styles.emptyImage} aria-hidden="true" />
      <div className={styles.emptyContent}>
        <h2>Start with three to five pieces you wear often</h2>
        <p>
          {localPreview
            ? "One photo per piece is enough. Add the details you know, then keep the piece in this sample workspace."
            : "One photo per piece is enough. AI writes the description; you confirm it. More pieces mean better matches and capsules."}
        </p>
        <ul>
          <li>
            <Icon name="upload" /> Take a photo on a plain background
          </li>
          <li>
            <Icon name="sparkle" />{" "}
            {localPreview
              ? "Add a clear name and category"
              : "Review the AI description and fix anything"}
          </li>
          <li>
            <Icon name="layers" />{" "}
            {localPreview
              ? "Edit or delete pieces later"
              : "Use it in matches, capsules and previews"}
          </li>
        </ul>
        <div className={styles.emptyActions}>
          <Button variant="primary" onClick={onAddItem}>
            Add your first item
          </Button>
          {onUseSample && (
            <Button variant="secondary" onClick={onUseSample}>
              Use sample wardrobe
            </Button>
          )}
        </div>
        {onUseSample && (
          <small>Sample items are labeled and never counted as owned.</small>
        )}
      </div>
    </div>
  );
}
