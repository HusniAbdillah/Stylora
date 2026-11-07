import styles from "./wardrobe.module.css";

export function WardrobeCollectionLoading() {
  return (
    <section
      className={styles.wardrobe}
      aria-label="Loading wardrobe"
      aria-busy="true"
    >
      <div className={styles.loadingHeading}>
        <span className={styles.loadingEyebrow} />
        <span className={styles.loadingTitle} />
        <span className={styles.loadingIntro} />
      </div>
      <div className={styles.loadingTabs} />
      <div className={styles.loadingSearch} />
      <div className={styles.grid}>
        {Array.from({ length: 8 }, (_, index) => (
          <div className={styles.skeletonItem} key={index}>
            <div className={styles.skeletonImage} />
            <div className={styles.skeletonLine} />
            <div className={styles.skeletonLineShort} />
          </div>
        ))}
      </div>
    </section>
  );
}
