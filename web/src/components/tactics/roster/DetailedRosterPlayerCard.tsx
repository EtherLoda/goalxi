'use client';

/**
 * DetailedRosterPlayerCard — "PlayerStatsCard" style card used by the
 * tactics editor when the user picks `density = 'detailed'`. Renders the
 * 4-category skill grid (physical · technical · mental · setPieces) using
 * the same `SkillBar` / color tokens as `components/player/PlayerStatsCard`.
 *
 * Visual differs from PlayerStatsCard on purpose: this card slots into the
 * tactics editor's right-rail (~360px wide) and intentionally omits the
 * PWI/STA/FRM/EXP gauges and the `condition`/`experience` fields to keep
 * each row scannable when 17+ players are listed.
 */
import React, { useRef } from 'react';
import { useLocale } from 'next-intl';
import type { Player } from '@/lib/api';
import { SkillBar } from '@/components/player/PlayerStatsCard';
import {
  CATEGORY_COLORS,
  SKILL_CATEGORIES,
  type SkillCategory,
  formatSkillLabel,
  getCategoryName,
} from '@/components/player/skill-display';
import { usePlayerDrag } from '../shared/usePlayerDrag';

interface DetailedRosterPlayerCardProps {
  player: Player;
  isAssigned?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function DetailedRosterPlayerCard({
  player,
  isAssigned = false,
  onDragStart,
  onDragEnd,
}: DetailedRosterPlayerCardProps) {
  const locale = useLocale();
  const safeLocale: 'en' | 'zh' = locale === 'zh' ? 'zh' : 'en';
  const avatarRef = useRef<HTMLDivElement>(null);

  const drag = usePlayerDrag(player.id, {
    onStart: onDragStart,
    onEnd: onDragEnd ? () => onDragEnd({} as React.DragEvent) : undefined,
    dragImageRef: avatarRef,
  });

  return (
    <div
      draggable
      onDragStart={drag.onDragStart}
      onDragEnd={drag.onDragEnd}
      className={`group relative flex flex-col gap-2.5 p-3 rounded-xl border bg-[#001e17] cursor-grab active:cursor-grabbing transition-all ${
        isAssigned
          ? 'border-outline-variant/20 opacity-60 grayscale'
          : 'border-[#2f4e44]/40 hover:border-primary/60'
      }`}
      data-player-id={player.id}
      data-testid={`roster-player-detailed-${player.id}`}
    >
      {/* Header — avatar, name, position, overall, stamina/form bars */}
      <div className="flex items-center gap-2.5">
        <div
          ref={avatarRef}
          className={`w-9 h-9 rounded-lg flex items-center justify-center font-headline font-extrabold text-[10px] shrink-0 ${
            player.isGoalkeeper
              ? 'bg-tertiary/15 border border-tertiary/40 text-tertiary'
              : 'bg-primary/15 border border-primary/40 text-primary'
          }`}
        >
          {initials(player.name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-headline font-bold text-sm text-[#d3f5e8] truncate">
            {player.name}
          </div>
          {player.displayId && (
            <div className="font-mono text-[9px] text-[#91b2a6] truncate">
              ({player.displayId})
            </div>
          )}
          <div className="font-label text-[9px] tracking-widest uppercase text-outline truncate">
            {player.position}
          </div>
        </div>
        <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
          <div className="font-headline font-black text-lg text-primary leading-none">
            {player.overall}
          </div>
          {/* Age */}
          <div className="font-label text-[9px] tracking-widest uppercase text-outline">
            {player.age}y
          </div>
          {/* Form — 5 dots */}
          <div className="flex items-center gap-0.5 justify-end">
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full ${
                  i < Math.max(0, Math.min(5, Math.round(player.form)))
                    ? 'bg-primary'
                    : 'bg-outline-variant/30'
                }`}
                aria-label={`form ${player.form}`}
              />
            ))}
          </div>
          {/* Stamina — 5 bars */}
          <div className="flex items-center gap-0.5 justify-end">
            <span className="material-symbols-outlined text-[9px] text-outline">bolt</span>
            <div className="flex gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <span
                  key={i}
                  className={`w-1 h-2 rounded-sm ${
                    i < Math.max(0, Math.min(5, Math.round(player.stamina)))
                      ? 'bg-emerald-500'
                      : 'bg-outline-variant/30'
                  }`}
                  aria-label={`stamina ${player.stamina}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Skills — 2-column grid, one column per (category × 2) */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-[#2f4e44]/30 pt-2.5">
        {SKILL_CATEGORIES.map((cat) => (
          <SkillCategoryGroup
            key={cat}
            cat={cat}
            currentSkills={player.currentSkills}
            potentialSkills={player.potentialSkills}
            locale={safeLocale}
          />
        ))}
      </div>
    </div>
  );
}

interface SkillCategoryGroupProps {
  cat: SkillCategory;
  currentSkills: Player['currentSkills'] | undefined;
  potentialSkills: Player['potentialSkills'] | undefined;
  locale: 'en' | 'zh';
}

function SkillCategoryGroup({
  cat,
  currentSkills,
  potentialSkills,
  locale,
}: SkillCategoryGroupProps) {
  const entries = Object.entries(currentSkills?.[cat] ?? {});
  if (entries.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span
          className={`w-1 h-3 rounded-full ${
            CATEGORY_COLORS[cat].replace('text-', 'bg-')
          }`}
          aria-hidden
        />
        <span className="text-[9px] font-black uppercase tracking-widest text-[#91b2a6]">
          {getCategoryName(cat, locale)}
        </span>
      </div>
      <div className="space-y-1">
        {entries.map(([skill, value]) => {
          const current = value ?? 0;
          const potentialMap = potentialSkills?.[cat] as Record<string, number> | undefined;
          const potential = potentialMap?.[skill] ?? current;
          return (
            <SkillBar
              key={skill}
              label={formatSkillLabel(skill, locale)}
              current={current}
              potential={potential}
              colorClass={CATEGORY_COLORS[cat]}
            />
          );
        })}
      </div>
    </div>
  );
}
