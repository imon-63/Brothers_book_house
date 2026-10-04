/* Loading placeholders sized like the real blocks, so nothing jumps when data lands. */

export function CardSkeleton() {
  return (
    <div className="sf-skel-card" aria-hidden="true">
      <i className="sf-skel sf-skel-media" />
      <div className="sf-skel-body">
        <i className="sf-skel sf-skel-line" style={{ width: "88%" }} />
        <i className="sf-skel sf-skel-line" style={{ width: "62%" }} />
        <i className="sf-skel sf-skel-line sm" style={{ width: "40%" }} />
        <i className="sf-skel sf-skel-price" />
      </div>
    </div>
  );
}

export function SkeletonGrid({ n = 8, className = "grid" }: { n?: number; className?: string }) {
  return (
    <div className={className} role="status" aria-label="লোড হচ্ছে">
      {Array.from({ length: n }, (_, i) => <CardSkeleton key={i} />)}
    </div>
  );
}

export function SkeletonRail({ n = 5 }: { n?: number }) {
  return (
    <div className="sf-skel-rail" role="status" aria-label="লোড হচ্ছে">
      {Array.from({ length: n }, (_, i) => <CardSkeleton key={i} />)}
    </div>
  );
}

export function RowSkeleton({ n = 3, tall = false }: { n?: number; tall?: boolean }) {
  return (
    <div className="sf-skel-rows" role="status" aria-label="লোড হচ্ছে">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={`sf-skel-row${tall ? " tall" : ""}`} aria-hidden="true">
          <i className="sf-skel sf-skel-thumb" />
          <div>
            <i className="sf-skel sf-skel-line" style={{ width: "46%" }} />
            <i className="sf-skel sf-skel-line sm" style={{ width: "28%" }} />
          </div>
          <i className="sf-skel sf-skel-pill" />
        </div>
      ))}
    </div>
  );
}

export function TileSkeleton({ n = 8, className = "sf-author-grid" }: { n?: number; className?: string }) {
  return (
    <div className={className} role="status" aria-label="লোড হচ্ছে">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="sf-skel-tile" aria-hidden="true">
          <i className="sf-skel sf-skel-av" />
          <i className="sf-skel sf-skel-line" style={{ width: "70%", margin: "0 auto" }} />
          <i className="sf-skel sf-skel-line sm" style={{ width: "40%", margin: "0 auto" }} />
        </div>
      ))}
    </div>
  );
}
