'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AppIcon, type MaterialIconName } from '@/components/icons/AppIcon';
import { SkillBar } from '@/components/player/PlayerStatsCard';
import { CATEGORY_BARS, CATEGORY_COLORS } from '@/components/player/skill-display';
import { SpecialtyIcon } from '@/components/player/SpecialtyIcon';
import { ExperienceTierLabel } from '@/components/ExperienceTierLabel';
import { KickerLabel } from '@/components/ui/KickerLabel';
import { conditionToneClass } from './SquadPlayerRow';
import {
  groupSkills,
  readSkillPair,
  skillSpecsFor,
  type SkillCategoryKey,
} from './skill-groups';
import { getSpecialtyLabel } from '@/lib/specialties';
import type { Player, PlayerEvent } from '@/lib/api';

const EVENT_ICONS: Record<string, MaterialIconName> = {
  TRANSFER: 'swap_horiz',
  YOUTH_PROMOTION: 'trending_up',
  HAT_TRICK: 'sports_kabaddi',
  CHAMPIONSHIP_TITLE: 'emoji_events',
  GOLDEN_BOOT: 'military_tech',
  ASSISTS_LEADER: 'assist_hand',
  TACKLES_LEADER: 'shield',
  MAN_OF_THE_MATCH: 'star',
  INJURY: 'local_hospital',
  DEBUT: 'play_circle',
  LEAGUE_DEBUT: 'stadium',
  CAPTAIN_DEBUT: 'captain',
  RECORD_BROKEN: 'record_voice_over',
  CONTRACT_RENEWAL: 'renewal',
};

const EVENT_COLORS: Record<string, string> = {
  TRANSFER: 'text-signal-blue',
  YOUTH_PROMOTION: 'text-positive-bright',
  HAT_TRICK: 'text-signal-gold',
  CHAMPIONSHIP_TITLE: 'text-signal-amber',
  GOLDEN_BOOT: 'text-signal-gold',
  ASSISTS_LEADER: 'text-signal-blue',
  TACKLES_LEADER: 'text-positive-bright',
  MAN_OF_THE_MATCH: 'text-signal-magenta',
  INJURY: 'text-error',
  DEBUT: 'text-signal-violet',
  LEAGUE_DEBUT: 'text-signal-violet',
  CAPTAIN_DEBUT: 'text-signal-gold',
  RECORD_BROKEN: 'text-signal-cyan',
  CONTRACT_RENEWAL: 'text-signal-blue',
};

interface SquadPlayerDetailProps {
  player: Player;
  locale: string;
  events: readonly PlayerEvent[];
  jerseyColor?: string | null;
  /** Listing is only offered on your own squad and only while unlisted. */
  canList: boolean;
  onList: () => void;
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** One "label above value" cell used in the meta strip. */
function MetaCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-micro">
      <KickerLabel>{label}</KickerLabel>
      <span className="font-headline text-body font-bold text-on-surface">{children}</span>
    </div>
  );
}

/** Big number + caption used in the three-up quick stats strip. */
function StatTile({
  label,
  value,
  suffix,
  tone = 'text-on-surface',
}: {
  label: string;
  value: React.ReactNode;
  suffix?: string;
  tone?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-micro rounded-xl bg-surface-container/60 px-tight py-2">
      <span className={`font-headline text-xl font-black leading-none tabular-nums ${tone}`}>
        {value}
        {suffix ? <span className="ml-0.5 font-label text-kicker font-bold text-outline">{suffix}</span> : null}
      </span>
      <KickerLabel>{label}</KickerLabel>
    </div>
  );
}

const CATEGORY_ACCENT: Record<SkillCategoryKey, string> = {
  physical: 'bg-accent',
  technical: 'bg-signal-blue',
  mental: 'bg-signal-lilac',
  setPieces: 'bg-signal-gold',
};

export function SquadPlayerDetail({
  player,
  locale,
  events,
  jerseyColor,
  canList,
  onList,
}: SquadPlayerDetailProps) {
  const t = useTranslations();
  const te = useTranslations('player_events');
  const lang: 'en' | 'zh' = locale === 'en' ? 'en' : 'zh';
  const jersey = jerseyColor ?? '#00e479';

  const groups = groupSkills(skillSpecsFor(player.isGoalkeeper));

  return (
    <div className="flex flex-col">
      {/* ── Identity ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-gutter p-panel sm:flex-row sm:items-start">
        <div
          className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] font-headline text-3xl font-black text-on-surface"
          style={{ background: `linear-gradient(135deg, ${jersey}26, ${jersey}0a)` }}
        >
          {initialsOf(player.name)}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-tight">
          <div className="flex flex-wrap items-center gap-tight">
            <Link
              href={`/${locale}/players/${player.id}`}
              className="font-headline text-2xl font-black leading-none tracking-tight text-on-surface transition-colors duration-quick hover:text-primary"
            >
              {player.name}
            </Link>
            {player.coreSpecialty ? (
              <span
                className={`inline-flex items-center gap-micro font-label text-label font-bold ${
                  player.coreSpecialtyTier === 'GOLD'
                    ? 'text-tertiary'
                    : player.coreSpecialtyTier === 'SILVER'
                      ? 'text-on-surface-variant'
                      : 'text-outline'
                }`}
              >
                <SpecialtyIcon code={player.coreSpecialty} tier={player.coreSpecialtyTier} size="md" />
                {getSpecialtyLabel(player.coreSpecialty, lang)}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-tight">
            <span className="rounded-md border border-outline-variant/40 bg-surface-container-high px-1.5 py-0.5 font-label text-kicker font-bold uppercase tracking-[0.08em] text-on-surface-variant">
              {player.isGoalkeeper ? 'GK' : (player.position ?? '—').toUpperCase()}
            </span>
            {player.onTransfer ? (
              <span className="inline-flex items-center gap-micro rounded-md border border-secondary/30 bg-secondary/10 px-1.5 py-0.5 font-label text-kicker font-bold uppercase tracking-[0.08em] text-secondary">
                <AppIcon name="sell" className="text-kicker" />
                {t('squad.transfer.onTransfer')}
              </span>
            ) : null}
          </div>

          <div className="mt-tight grid grid-cols-2 gap-x-gutter gap-y-tight sm:grid-cols-4">
            <MetaCell label={t('squad.age')}>
              {t('common.ageFormat', { y: player.age, d: player.ageDays })}
            </MetaCell>
            <MetaCell label={t('squad.exp')}>
              <ExperienceTierLabel value={player.experience} className="font-bold text-on-surface" />
            </MetaCell>
            <MetaCell label={t('squad.wage')}>
              <span className="text-secondary">
                {t('common.currencySymbol')}
                {(player.currentWage || 0).toLocaleString()}
              </span>
            </MetaCell>
            <MetaCell label={t('squad.overall')}>
              <span className="text-primary">{(player.overall ?? 0).toLocaleString()}</span>
            </MetaCell>
          </div>
        </div>
      </div>

      {/* ── Quick stats + actions ────────────────────────────────────── */}
      <div className="flex flex-wrap items-stretch gap-tight px-panel pb-panel">
        <div className="flex min-w-0 flex-1 gap-tight">
          <StatTile
            label={t('squad.stamina')}
            value={Math.round(player.stamina)}
            suffix="/6"
            tone={conditionToneClass(player.stamina, 4, 2)}
          />
          <StatTile
            label={t('squad.form')}
            value={Math.round(player.form)}
            suffix="/5"
            tone={conditionToneClass(player.form, 4, 2)}
          />
          <StatTile
            label={t('squad.potential')}
            value={player.potentialAbility || 0}
            suffix="/100"
            tone="text-primary"
          />
        </div>
        <div className="flex items-center gap-tight">
          <Link
            href={`/${locale}/players/${player.id}`}
            className="inline-flex h-9 items-center gap-micro rounded-lg border border-outline-variant/40 px-tight font-label text-label font-bold text-on-surface-variant transition-colors duration-quick hover:border-outline hover:text-on-surface"
          >
            <AppIcon name="open_in_full" className="text-kicker" />
            {t('squad.fullProfile')}
          </Link>
          {canList ? (
            <button
              type="button"
              onClick={onList}
              className="inline-flex h-9 items-center gap-micro rounded-lg border border-primary/30 bg-primary/12 px-tight font-label text-label font-bold text-primary transition-colors duration-quick hover:bg-primary/20"
            >
              <AppIcon name="sell" className="text-kicker" />
              {t('squad.transfer.listPlayer')}
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Skills ───────────────────────────────────────────────────── */}
      <div className="border-t border-outline-variant/30 p-panel">
        <div className="grid min-w-0 gap-x-gutter gap-y-panel sm:grid-cols-2">
          {groups.map((group) => (
              <div key={group.category} className="flex flex-col gap-tight">
                <div className="flex items-center gap-micro">
                  <span className={`h-3 w-1 rounded-full ${CATEGORY_ACCENT[group.category]}`} />
                  <KickerLabel>{t(`squad.skills.${groupTitleKey(group.category, player.isGoalkeeper)}`)}</KickerLabel>
                </div>
                <div className="flex flex-col gap-tight">
                  {group.specs.map((spec) => {
                    const pair = readSkillPair(player.currentSkills, player.potentialSkills, spec);
                    return (
                      <SkillBar
                        key={spec.key}
                        label={t(`squad.skills.${spec.key}`)}
                        current={pair.current}
                        potential={pair.potential}
                        colorClass={CATEGORY_COLORS[group.category]}
                        barClass={CATEGORY_BARS[group.category]}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* ── Career events ────────────────────────────────────────────── */}
      <div className="border-t border-outline-variant/30 p-panel">
        <div className="mb-tight flex items-center justify-between">
          <KickerLabel>{t('player_events.title')}</KickerLabel>
          {events.length > 5 ? (
            <span className="font-label text-kicker tabular-nums text-outline">
              {events.length}
            </span>
          ) : null}
        </div>
        {events.length === 0 ? (
          <p className="font-label text-label text-on-surface-variant/60">
            {t('player_events.no_events')}
          </p>
        ) : (
          <ul className="flex flex-col gap-tight">
            {events.slice(0, 5).map((event) => {
              const icon = EVENT_ICONS[event.eventType] ?? 'event';
              const tone = EVENT_COLORS[event.eventType] ?? 'text-primary';
              const date = new Date(event.date);
              const dateLabel = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
              return (
                <li key={event.id} className="flex items-center gap-tight">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-container ${tone}`}>
                    <AppIcon name={icon} className="text-body" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-label font-semibold text-on-surface">
                    {event.titleKey
                      ? te(event.titleKey.replace(/^player_events\./, ''))
                      : event.eventType}
                  </span>
                  <span className="shrink-0 font-label text-kicker tabular-nums text-outline">
                    S{event.season} · {dateLabel}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * `squad.skills.*` mixes skill keys and four category-title keys in one
 * namespace, so the group heading needs its own lookup. Goalkeepers keep
 * reflexes/handling/aerial in the `technical` bucket, and the copy for that
 * group is "goalkeeper skills" — that is the only per-position branch.
 */
function groupTitleKey(category: SkillCategoryKey, isGoalkeeper: boolean): string {
  switch (category) {
    case 'physical':
      return 'physicalAttributes';
    case 'technical':
      return isGoalkeeper ? 'goalkeeperSkills' : 'technicalSkills';
    case 'mental':
      return 'mentalProfile';
    case 'setPieces':
      return 'setPieces';
  }
}
