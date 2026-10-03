export default function PlayerDetailSkeleton() {
  return (
    <div className="p-6 flex-1 custom-scrollbar">
      {/* Header Image */}
      <div className="h-56 rounded-2xl bg-ink-600 animate-pulse mb-6" />

      {/* Pricing Cards */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-ink-600 p-4 rounded-2xl animate-pulse h-24" />
        <div className="bg-ink-600 p-4 rounded-2xl animate-pulse h-24" />
      </div>

      {/* Tactical Profile */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-4 w-4 bg-ink-600 rounded animate-pulse" />
          <div className="h-3 w-24 bg-ink-600 rounded animate-pulse" />
        </div>

        <div className="space-y-5">
          {/* Technical */}
          <div>
            <div className="h-3 w-16 bg-ink-600 rounded animate-pulse mb-3" />
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="h-3 w-16 bg-ink-600 rounded animate-pulse" />
                  <div className="flex-1 h-1.5 bg-ink-600 rounded-full animate-pulse" />
                </div>
              ))}
            </div>
          </div>

          {/* Physical */}
          <div>
            <div className="h-3 w-16 bg-ink-600 rounded animate-pulse mb-3" />
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="h-3 w-16 bg-ink-600 rounded animate-pulse" />
                  <div className="flex-1 h-1.5 bg-ink-600 rounded-full animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}