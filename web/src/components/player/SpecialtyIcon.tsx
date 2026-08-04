import clsx from "clsx";
import { getSpecialtyFile } from "@/lib/specialties";

/**
 * SpecialtyIcon — renders a player specialty as an inline SVG via <img>.
 *
 * The SVGs live in `web/public/specialties/<file>.svg` and ship with a
 * `color="#a1ffc2"` default that matches the project's emerald accent.
 * The icon stroke uses `currentColor`, so wrapping this in a `text-*`
 * Tailwind class swaps the colour without touching the asset.
 *
 * Falls back to a tiny star dot if the code is unknown so the layout
 * never collapses.
 */
type Size = "xs" | "sm" | "md" | "lg";

const SIZE_CLASS: Record<Size, string> = {
  xs: "w-3 h-3",       // 12px — for compact badges in cards / tables
  sm: "w-3.5 h-3.5",   // 14px — for filter rows, dropdown options
  md: "w-4 h-4",       // 16px — for detail-page badges
  lg: "w-5 h-5",       // 20px — for hero / large callouts
};

type Props = {
  code: string | null | undefined;
  size?: Size;
  className?: string;
  /** Optional title for hover tooltips (defaults to the code). */
  title?: string;
};

export function SpecialtyIcon({
  code,
  size = "md",
  className,
  title,
}: Props) {
  const file = getSpecialtyFile(code);
  if (!file) {
    // Unknown code — render a tiny fallback dot so layout stays intact.
    return (
      <span
        className={clsx(
          "inline-block rounded-full bg-current opacity-40",
          SIZE_CLASS[size],
          className,
        )}
        aria-hidden
      />
    );
  }
  return (
    <img
      src={`/specialties/${file}.svg`}
      alt=""
      aria-hidden
      title={title ?? code ?? undefined}
      className={clsx("inline-block align-middle", SIZE_CLASS[size], className)}
    />
  );
}
