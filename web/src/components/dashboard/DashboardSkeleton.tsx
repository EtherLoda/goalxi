/**
 * DashboardSkeleton — the loading state for the manager home.
 *
 * Why this exists: the dashboard fetches five endpoints in a
 * `Promise.all` inside `useEffect`, so on first paint it used to render
 * its *empty* state — "NO MATCHES", "-- : --", "TBD" and blank tables —
 * which then silently filled in. That is a lie the user can't distinguish
 * from "my club genuinely has no fixtures".
 *
 * Shape rule: a skeleton must be structurally isomorphic to the real
 * layout, or the content jumps when it lands. The grid classes, card
 * spans and block heights below mirror `dashboard/page.tsx` one-for-one —
 * if you change the real layout, change this in the same commit.
 *
 * Blocks use the same vocabulary as `TransferListSkeleton`
 * (`bg-ink-600` + `animate-pulse`), and the reduced-motion rule in
 * `globals.css` freezes the pulse on its own.
 */
export default function DashboardSkeleton() {
    return (
        <div
            className="p-6 space-y-6 max-w-7xl mx-auto w-full"
            aria-busy="true"
            aria-live="polite"
        >
            {/* Hero grid — 4 columns; the next-match card spans 2 */}
            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                {/* Next match */}
                <div className="xl:col-span-2 glass-panel rounded-2xl overflow-hidden p-8 relative">
                    <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                        <div className="flex-1 space-y-4">
                            <div className="h-6 w-32 rounded-full bg-ink-600 animate-pulse" />
                            <div className="h-12 w-3/4 rounded bg-ink-600 animate-pulse" />
                            <div className="h-4 w-1/2 rounded bg-ink-600 animate-pulse" />
                            <div className="flex gap-6 pt-2">
                                <div className="space-y-2">
                                    <div className="h-3 w-16 rounded bg-ink-600 animate-pulse" />
                                    <div className="h-5 w-24 rounded bg-ink-600 animate-pulse" />
                                </div>
                                <div className="w-px h-8 bg-white/10" />
                                <div className="space-y-2">
                                    <div className="h-3 w-16 rounded bg-ink-600 animate-pulse" />
                                    <div className="h-5 w-24 rounded bg-ink-600 animate-pulse" />
                                </div>
                            </div>
                        </div>

                        {/* VS block */}
                        <div className="flex items-center gap-6 px-8 py-6 rounded-2xl bg-surface-container-low/80 backdrop-blur-md border border-white/5">
                            <div className="space-y-2 text-center">
                                <div className="w-16 h-16 rounded-full bg-ink-600 animate-pulse mx-auto" />
                                <div className="h-3 w-12 mx-auto rounded bg-ink-600 animate-pulse" />
                            </div>
                            <div className="h-6 w-8 rounded bg-ink-600 animate-pulse" />
                            <div className="space-y-2 text-center">
                                <div className="w-16 h-16 rounded-full bg-ink-600 animate-pulse mx-auto" />
                                <div className="h-3 w-12 mx-auto rounded bg-ink-600 animate-pulse" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Squad status */}
                <div className="glass-panel rounded-2xl p-6 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-6">
                            <div className="h-3 w-24 rounded bg-ink-600 animate-pulse" />
                            <div className="h-3 w-20 rounded bg-ink-600 animate-pulse" />
                        </div>
                        <div className="flex items-center gap-4 mb-6">
                            <div className="h-14 w-20 rounded bg-ink-600 animate-pulse" />
                            <div className="space-y-2">
                                <div className="h-3 w-24 rounded bg-ink-600 animate-pulse" />
                                <div className="h-3 w-16 rounded bg-ink-600 animate-pulse" />
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div className="h-2 w-20 rounded bg-ink-600 animate-pulse" />
                            {/* 5 form chips, w-9 h-9 in the real card */}
                            <div className="flex gap-2">
                                {[1, 2, 3, 4, 5].map((i) => (
                                    <div key={i} className="w-9 h-9 rounded-lg bg-ink-600 animate-pulse" />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Fan & mood */}
                <div className="glass-panel rounded-2xl p-6 flex flex-col justify-between">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="h-3 w-20 rounded bg-ink-600 animate-pulse" />
                            <div className="h-3 w-16 rounded bg-ink-600 animate-pulse" />
                        </div>
                        <div className="space-y-2">
                            <div className="h-11 w-28 rounded bg-ink-600 animate-pulse" />
                            <div className="h-3 w-36 rounded bg-ink-600 animate-pulse" />
                            {/* 10-dot thermometer, h-1.5 flex-1 in the real card */}
                            <div className="flex items-center gap-1">
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
                                    <div key={i} className="h-1.5 flex-1 rounded-full bg-ink-600 animate-pulse" />
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="space-y-3 mt-5">
                        <div className="h-2 w-20 rounded bg-ink-600 animate-pulse" />
                        <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="w-9 h-9 rounded-lg bg-ink-600 animate-pulse" />
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Second grid — team news + announcements */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {[0, 1].map((panel) => (
                    <div key={panel} className="glass-panel rounded-2xl p-6">
                        <div className="h-3 w-32 rounded bg-ink-600 animate-pulse mb-6" />
                        <div className="space-y-4">
                            {[0, 1, 2].map((row) => (
                                <div key={row} className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-ink-600 animate-pulse shrink-0" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-3 w-1/3 rounded bg-ink-600 animate-pulse" />
                                        <div className="h-2.5 w-2/3 rounded bg-ink-600 animate-pulse" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </section>
        </div>
    );
}