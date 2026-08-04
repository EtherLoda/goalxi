/**
 * specialties.ts — single source of truth for player specialty metadata.
 *
 * Consumed by:
 *   - `components/player/SpecialtyIcon.tsx` (renders the SVG)
 *   - `app/[locale]/players/[id]/page.tsx` (player detail)
 *   - `app/[locale]/transfers/page.tsx` (transfer market filter)
 *   - `app/[locale]/teams/squad/page.tsx` (squad view + selected player)
 *   - `components/transfers/TransferPlayerCard.tsx`
 *   - `components/transfers/TransferTransactionCard.tsx`
 *
 * The `code` values match what the backend stores in `PlayerEntity.specialty`
 * (see `libs/database/src/entities/player.entity.ts`). `file` is the SVG name
 * under `web/public/specialties/`.
 */

export type SpecialtyCode =
  | "HEADER"
  | "LPASS"
  | "CROSS"
  | "DRBLE"
  | "LSHT"
  | "CLUCH"
  | "TACKL"
  | "PSAVE"
  | "CNTR"
  | "REBND"
  | "FSTRT";

export interface SpecialtyMeta {
  code: SpecialtyCode;
  file: string; // SVG file stem under /specialties/
  zh: string;
  en: string;
}

export const SPECIALTIES: readonly SpecialtyMeta[] = [
  { code: "HEADER", file: "header", zh: "头球专家", en: "Header" },
  { code: "LPASS",  file: "lpass",  zh: "长传手",   en: "Long Pass" },
  { code: "CROSS",  file: "cross",  zh: "传中专家", en: "Cross" },
  { code: "DRBLE",  file: "drble",  zh: "盘带大师", en: "Dribble" },
  { code: "LSHT",   file: "lsht",   zh: "远射",     en: "Long Shot" },
  { code: "CLUCH",  file: "cluch",  zh: "关键先生", en: "Clutch" },
  { code: "TACKL",  file: "tackl",  zh: "抢断大师", en: "Tackle" },
  { code: "PSAVE",  file: "psave",  zh: "点球门将", en: "PK Saver" },
  { code: "CNTR",   file: "cntr",   zh: "反击启动", en: "Counter" },
  { code: "REBND",  file: "rebnd",  zh: "补射专家", en: "Rebound" },
  { code: "FSTRT",  file: "fstrt",  zh: "快发",     en: "Fast Start" },
];

const META_BY_CODE: Record<string, SpecialtyMeta | undefined> =
  Object.fromEntries(SPECIALTIES.map((s) => [s.code, s]));

/** Return the SVG file stem for a specialty code, or `null` if unknown. */
export function getSpecialtyFile(code: string | null | undefined): string | null {
  if (!code) return null;
  return META_BY_CODE[code]?.file ?? null;
}

/** Return localized label for a specialty code. Falls back to the raw code. */
export function getSpecialtyLabel(
  code: string | null | undefined,
  locale: "zh" | "en" = "zh",
): string {
  if (!code) return "";
  const meta = META_BY_CODE[code];
  if (!meta) return code;
  return locale === "zh" ? meta.zh : meta.en;
}
