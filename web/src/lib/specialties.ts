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
 * The `code` values match what the backend stores in
 * `PlayerEntity.coreSpecialty` (see `libs/database/src/entities/player.entity.ts`).
 * `file` is the SVG stem under `web/public/specialties/`.
 *
 * v2 design (2026-08):
 *   - 12 active codes (FIFA 25-style pentagon SVGs in `currentColor`)
 *   - 8 deprecated codes (legacy v1 single-ability pool) — kept in
 *     the table for migration compatibility; UI renders these as
 *     a neutral gray dot via `SpecialtyIcon`.
 *   - Tier is read separately from `coreSpecialtyTier` and applied
 *     by the consumer (e.g. `SpecialtyIcon` picks the tier-text class).
 */

/** v2 active codes (12) + v1 legacy codes (8, deprecated). */
export type SpecialtyCode =
  // v2 active
  | "AERIAL_THREAT"
  | "DRIBBLER"
  | "PLAYMAKER"
  | "TACKLER"
  | "WALL"
  | "SPEEDSTER"
  | "CROSSER"
  | "POACHER"
  | "COMPOSED"
  | "PHYSICAL_BEAST"
  | "SAVING_MASTER"
  | "SWEEPER_KEEPER"
  // v1 legacy (kept for migration compat; new code should never produce these)
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

export type SpecialtyTier = "GOLD" | "SILVER" | "BRONZE";

export interface SpecialtyMeta {
  code: SpecialtyCode;
  file: string; // SVG file stem under /specialties/
  zh: string;
  en: string;
}

/**
 * Master list of every specialty the FE knows how to render.
 * Order is: v2 active (12) first, then v1 legacy (8) — the active
 * block is the only one new code should ever reference.
 */
export const SPECIALTIES: readonly SpecialtyMeta[] = [
  // ─── v2 active (12) ───────────────────────────────────────
  { code: "AERIAL_THREAT",   file: "aerial_threat",   zh: "空霸",       en: "Aerial Threat"   },
  { code: "DRIBBLER",        file: "dribbler",        zh: "盘带大师",   en: "Dribbler"        },
  { code: "PLAYMAKER",       file: "playmaker",       zh: "组织核心",   en: "Playmaker"       },
  { code: "TACKLER",         file: "tackler",         zh: "抢断专家",   en: "Tackler"         },
  { code: "WALL",            file: "wall",            zh: "铁壁",       en: "Wall"            },
  { code: "SPEEDSTER",       file: "speedster",       zh: "闪电疾锋",   en: "Speedster"       },
  { code: "CROSSER",         file: "crosser",         zh: "传中狂魔",   en: "Crosser"         },
  { code: "POACHER",         file: "poacher",         zh: "禁区之狐",   en: "Poacher"         },
  { code: "COMPOSED",        file: "composed",        zh: "泰山",       en: "Composed"        },
  { code: "PHYSICAL_BEAST",  file: "physical_beast",  zh: "铁人",       en: "Physical Beast"  },
  { code: "SAVING_MASTER",   file: "saving_master",   zh: "扑救专家",   en: "Saving Master"   },
  { code: "SWEEPER_KEEPER",  file: "sweeper_keeper",  zh: "出击门将",   en: "Sweeper Keeper"  },
  // ─── v1 legacy (8, deprecated) ────────────────────────────
  { code: "HEADER", file: "header", zh: "头球专家", en: "Header" },
  { code: "LPASS",  file: "lpass",  zh: "长传手",   en: "Long Pass" },
  { code: "CROSS",  file: "cross",  zh: "传中专家", en: "Cross" },
  { code: "DRBLE",  file: "drble",  zh: "盘带",     en: "Dribble" },
  { code: "LSHT",   file: "lsht",   zh: "远射",     en: "Long Shot" },
  { code: "CLUCH",  file: "cluch",  zh: "关键先生", en: "Clutch" },
  { code: "TACKL",  file: "tackl",  zh: "抢断",     en: "Tackle" },
  { code: "PSAVE",  file: "psave",  zh: "点球门将", en: "PK Saver" },
  { code: "CNTR",   file: "cntr",   zh: "反击启动", en: "Counter" },
  { code: "REBND",  file: "rebnd",  zh: "补射专家", en: "Rebound" },
  { code: "FSTRT",  file: "fstrt",  zh: "快发",     en: "Fast Start" },
];

const META_BY_CODE: Record<string, SpecialtyMeta | undefined> =
  Object.fromEntries(SPECIALTIES.map((s) => [s.code, s]));

/** v2 active code set — used by the icon to pick the tier palette
 *  and decide whether to render a pentagon or fall back to a dot. */
const ACTIVE_V2_CODES = new Set<SpecialtyCode>([
  "AERIAL_THREAT", "DRIBBLER", "PLAYMAKER", "TACKLER", "WALL",
  "SPEEDSTER", "CROSSER", "POACHER", "COMPOSED", "PHYSICAL_BEAST",
  "SAVING_MASTER", "SWEEPER_KEEPER",
]);

/** Return the SVG file stem for a specialty code, or `null` if unknown. */
export function getSpecialtyFile(code: string | null | undefined): string | null {
  if (!code) return null;
  return META_BY_CODE[code]?.file ?? null;
}

/** True iff the given code is one of the 12 v2 active specialities. */
export function isV2ActiveSpecialty(code: string | null | undefined): code is SpecialtyCode {
  return code != null && ACTIVE_V2_CODES.has(code as SpecialtyCode);
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
