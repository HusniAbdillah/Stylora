export default function WardrobeItemLoading() {
  return (
    <div role="status" aria-label="Loading wardrobe item" className="grid gap-6 py-6 md:grid-cols-2">
      <div className="aspect-square animate-pulse rounded-panel bg-sand" />
      <div className="grid content-start gap-3">
        <div className="h-12 w-2/3 animate-pulse rounded-card bg-sand" />
        <div className="h-6 w-1/3 animate-pulse rounded-card bg-sand" />
        <div className="mt-4 grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-card bg-sand" />)}
        </div>
      </div>
    </div>
  );
}
