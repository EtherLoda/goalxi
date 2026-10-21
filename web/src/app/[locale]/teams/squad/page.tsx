'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AppIcon } from '@/components/icons/AppIcon';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { KickerLabel } from '@/components/ui/KickerLabel';
import { SquadPlayerDetail } from '@/components/squad/SquadPlayerDetail';
import { SquadPlayerRow } from '@/components/squad/SquadPlayerRow';
import { SquadSortMenu } from '@/components/squad/SquadSortMenu';
import {
  DEFAULT_SQUAD_SORT,
  sortSquad,
  type SquadSort,
} from '@/components/squad/squad-sort';
import { useAuth } from '@/contexts/AuthContext';
import { useGameStore } from '@/stores/gameStore';
import { conditionToneClass } from '@/lib/condition-tone';
import { api, type Player, type PlayerEvent, type Team } from '@/lib/api';

/** One "label + value" cell in the page header strip. */
function HeaderStat({ label, value, tone = 'text-on-surface' }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className={`font-headline text-title font-black leading-none tabular-nums ${tone}`}>{value}</span>
      <span className="font-label text-kicker uppercase tracking-[0.12em] text-outline">{label}</span>
    </div>
  );
}

function SquadSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-gutter p-4 md:p-6" aria-busy="true" aria-live="polite">
      <div className="h-[68px] animate-pulse rounded-2xl bg-surface-container-low" />
      <div className="grid grid-cols-1 items-start gap-section lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="flex flex-col gap-tight rounded-2xl bg-surface-container-low p-tight">
          {Array.from({ length: 9 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-xl bg-surface-container/70" />
          ))}
        </div>
        <div className="flex flex-col gap-tight rounded-2xl bg-surface-container-low p-panel">
          <div className="h-24 w-24 animate-pulse rounded-2xl bg-surface-container" />
          <div className="h-6 w-48 animate-pulse rounded bg-surface-container" />
          <div className="mt-tight h-20 w-full animate-pulse rounded-xl bg-surface-container" />
          <div className="mt-tight h-52 w-full animate-pulse rounded-xl bg-surface-container" />
        </div>
      </div>
    </div>
  );
}

function SquadPageContent() {
  const t = useTranslations();
  const { team } = useAuth();
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = params.locale as string;

  const { viewTeamId, setViewTeam, teamId } = useGameStore();

  useEffect(() => {
    const urlTeamId = searchParams.get('team');
    if (urlTeamId && urlTeamId !== viewTeamId) {
      setViewTeam(urlTeamId);
    }
    // Runs once on mount: the URL is an entry point, not a controlled input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isViewingMyTeam = viewTeamId === null || viewTeamId === teamId;
  const currentTeamId = isViewingMyTeam ? teamId : viewTeamId;

  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [playerEvents, setPlayerEvents] = useState<PlayerEvent[]>([]);
  const [viewedTeam, setViewedTeam] = useState<Team | null>(null);
  const [sort, setSort] = useState<SquadSort>(DEFAULT_SQUAD_SORT);

  useEffect(() => {
    if (isViewingMyTeam) {
      setViewedTeam(null);
      return;
    }
    if (viewTeamId) {
      api.teams
        .getById(viewTeamId)
        .then(setViewedTeam)
        .catch(() => setViewedTeam(null));
    }
  }, [viewTeamId, isViewingMyTeam]);

  const displayTeam = isViewingMyTeam ? team : viewedTeam;

  useEffect(() => {
    if (!currentTeamId) return;
    let cancelled = false;

    setIsLoading(true);
    api.players
      .getByTeam(currentTeamId, isViewingMyTeam)
      .then((data) => {
        if (cancelled) return;
        // Raw roster only — ordering is the user's choice and lives in
        // `sortedPlayers`. Nothing is auto-selected either: the detail pane
        // should describe a player you picked.
        setPlayers(data.items);
      })
      .catch(() => {
        if (!cancelled) setPlayers([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentTeamId, isViewingMyTeam]);

  const selectedPlayerId = selectedPlayer?.id ?? null;

  useEffect(() => {
    if (selectedPlayerId == null) {
      setPlayerEvents([]);
      return;
    }
    let cancelled = false;
    api.players
      .getEvents(selectedPlayerId)
      .then((events) => {
        if (!cancelled) setPlayerEvents(events);
      })
      .catch(() => {
        if (!cancelled) setPlayerEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPlayerId]);

  const sortedPlayers = useMemo(() => sortSquad(players, sort), [players, sort]);

  const averageOverall = useMemo(() => {
    if (players.length === 0) return 0;
    return Math.round(players.reduce((sum, p) => sum + p.overall, 0) / players.length);
  }, [players]);

  const averageCondition = useMemo(() => {
    if (players.length === 0) return { stamina: 0, form: 0 };
    const totals = players.reduce(
      (acc, p) => ({
        stamina: acc.stamina + (p.stamina || 0),
        form: acc.form + (p.form || 0),
      }),
      { stamina: 0, form: 0 },
    );
    return {
      stamina: totals.stamina / players.length,
      form: totals.form / players.length,
    };
  }, [players]);

  const totalWage = useMemo(
    () => players.reduce((sum, p) => sum + (p.currentWage || 0), 0),
    [players],
  );

  if (isLoading) return <SquadSkeleton />;

  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-gutter p-4 md:p-6">
      <header className="glass-panel flex flex-wrap items-center justify-between gap-x-gutter gap-y-tight rounded-2xl px-panel py-2.5">
        <div className="flex min-w-0 items-center gap-tight">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <AppIcon name="groups" className="text-body" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="truncate font-headline text-title font-bold text-on-surface">
              {displayTeam?.name || t('squad.squad')}
            </h1>
            <KickerLabel>{isViewingMyTeam ? t('squad.title') : t('squad.titleOther')}</KickerLabel>
          </div>
        </div>

        <div className="flex items-center gap-gutter">
          <HeaderStat label={t('squad.players')} value={players.length} />
          <span className="h-7 w-px bg-outline-variant/40" />
          <HeaderStat label={t('squad.avgOverall')} value={averageOverall} tone="text-primary" />
          <span className="h-7 w-px bg-outline-variant/40" />
          <HeaderStat
            label={t('squad.avgStamina')}
            value={averageCondition.stamina.toFixed(1)}
            tone={conditionToneClass(averageCondition.stamina, 4, 2)}
          />
          <span className="h-7 w-px bg-outline-variant/40" />
          <HeaderStat
            label={t('squad.avgForm')}
            value={averageCondition.form.toFixed(1)}
            tone={conditionToneClass(averageCondition.form, 4, 2)}
          />
          <span className="h-7 w-px bg-outline-variant/40" />
          <HeaderStat
            label={t('squad.payroll')}
            value={`${t('common.currencySymbol')}${totalWage.toLocaleString()}`}
            tone="text-secondary"
          />
        </div>
      </header>

      {players.length === 0 ? (
        <GlassPanel size="md" className="flex flex-col items-center gap-tight py-16">
          <AppIcon name="person" className="text-2xl text-outline" />
          <p className="font-headline text-title font-bold text-on-surface">{t('squad.noPlayers')}</p>
          <p className="max-w-[320px] text-center text-label text-on-surface-variant/75">
            {t('squad.noPlayersHint')}
          </p>
        </GlassPanel>
      ) : (
        <div className="grid grid-cols-1 items-start gap-section lg:grid-cols-[360px_minmax(0,1fr)]">
          <GlassPanel size="sm" className="flex flex-col overflow-hidden lg:sticky lg:top-4 lg:max-h-[calc(100dvh-140px)]">
            <div className="flex items-center justify-between gap-tight px-micro pb-tight pt-micro">
              <div className="flex items-baseline gap-tight">
                <KickerLabel>{t('squad.squad')}</KickerLabel>
                <span className="font-label text-kicker tabular-nums text-outline">
                  {players.length} {t('squad.players')}
                </span>
              </div>
              <SquadSortMenu sort={sort} onChange={setSort} />
            </div>

            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="flex flex-col gap-0.5">
                {sortedPlayers.map((player) => (
                  <SquadPlayerRow
                    key={player.id}
                    player={player}
                    isSelected={selectedPlayer?.id === player.id}
                    locale={locale}
                    onSelect={setSelectedPlayer}
                  />
                ))}
              </div>
            </div>
          </GlassPanel>

          <GlassPanel size="sm" className="overflow-hidden lg:sticky lg:top-4 lg:max-h-[calc(100dvh-140px)] lg:overflow-y-auto">
            {selectedPlayer ? (
              <SquadPlayerDetail
                player={selectedPlayer}
                locale={locale}
                events={playerEvents}
                jerseyColor={displayTeam?.jerseyColorPrimary}
              />
            ) : (
              <div className="flex flex-col items-center gap-micro py-16 text-on-surface-variant/75">
                <AppIcon name="person" className="text-2xl text-outline" />
                <span className="text-label">{t('squad.selectPlayer')}</span>
              </div>
            )}
          </GlassPanel>
        </div>
      )}

    </div>
  );
}

function SquadPageLoading() {
  return <SquadSkeleton />;
}

export default function SquadPageWrapper() {
  return (
    <Suspense fallback={<SquadPageLoading />}>
      <Suspense fallback={null}>
        <SquadPageContent />
      </Suspense>
    </Suspense>
  );
}
