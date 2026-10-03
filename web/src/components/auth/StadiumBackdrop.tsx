import Image from "next/image";

/**
 * Stadium backdrop for the unauthenticated pages — login, register and
 * the onboarding wait screen.
 *
 * The image is the same floodlit-bowl photo the marketing hero uses,
 * served from `public/`. It used to be hot-linked from Unsplash, which
 * the Content-Security-Policy in `next.config.ts` blocks outright
 * (`img-src 'self' data: blob:`): the request was refused in the
 * browser and the pages silently rendered as flat dark green. Vendoring
 * the asset keeps the policy strict — no external image origin, no
 * visitor IP handed to a third party — and removes the dependency on
 * someone else's uptime.
 *
 * Decorative: the alt is empty and every caller puts its real content
 * on top, so this is background texture, not information.
 */
export default function StadiumBackdrop() {
    return (
        <div className="fixed inset-0 z-0">
            <Image
                src="/hero-stadium.jpg"
                alt=""
                fill
                priority
                sizes="100vw"
                quality={60}
                className="object-cover grayscale brightness-30"
            />
            <div className="absolute inset-0 bg-surface/80" />
        </div>
    );
}