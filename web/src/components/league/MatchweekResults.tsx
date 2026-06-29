"use client";

import { useTranslations } from "next-intl";
import { clsx } from "clsx";

interface MatchResult {
  id: string;
  homeTeam: string;
  homeTeamShort: string;
  homeTeamId?: string;
  awayTeam: string;
  awayTeamShort: string;
  awayTeamId?: string;
  homeScore: number;
  awayScore: number;
  scheduledAt?: string;
  status?: string;
}

interface MatchweekResultsProps {
  currentRound: number;
  lastRoundResults: MatchResult[];
  nextRoundMatches: MatchResult[];
  userTeamId?: string;
  userTeamColor?: string;
}

function MatchRow({
  match,
  showScore,
  showIcon = false,
  isUserHome = false,
  isUserAway = false,
  userTeamColor = "#00e479",
}: {
  match: MatchResult;
  showScore: boolean;
  showIcon?: boolean;
  isUserHome?: boolean;
  isUserAway?: boolean;
  userTeamColor?: string;
}) {
  const homeWin = showScore && match.homeScore > match.awayScore;
  const awayWin = showScore && match.awayScore > match.homeScore;
  const draw = showScore && match.homeScore === match.awayScore;

  return (
    <div className="flex items-center justify-between py-2 px-2.5 rounded-xl hover:bg-white/5 transition-colors group">
      {/* Home */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span
          className={clsx(
            'w-1.5 h-1.5 rounded-full shrink-0',
            homeWin && 'bg-primary shadow-[0_0_6px_rgba(0,228,121,0.7)]',
            awayWin && 'bg-error/70',
            draw && 'bg-on-surface-variant/40',
            !showScore && 'bg-on-surface-variant/30',
          )}
        />
        <span
          className={clsx(
            'font-headline text-sm font-bold truncate',
            homeWin ? 'text-on-surface' : showScore ? 'text-on-surface-variant' : 'text-on-surface',
            isUserHome && 'text-primary',
          )}
        >
          {match.homeTeamShort}
        </span>
        {showIcon && isUserHome && (
          <span
            className="material-symbols-outlined text-sm shrink-0"
            style={{ color: userTeamColor }}
          >
            sports
          </span>
        )}
      </div>

      {/* Score or VS */}
      <div
        className={clsx(
          'font-headline font-black px-2.5 py-0.5 rounded-md shrink-0 mx-2 min-w-[58px] text-center text-xs',
          showScore
            ? homeWin
              ? 'bg-primary/15 text-primary'
              : awayWin
                ? 'bg-error/10 text-error'
                : 'bg-white/5 text-on-surface'
            : 'bg-white/5 text-on-surface-variant/60',
        )}
      >
        {showScore ? `${match.homeScore} - ${match.awayScore}` : 'vs'}
      </div>

      {/* Away */}
      <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
        {showIcon && isUserAway && (
          <span
            className="material-symbols-outlined text-sm shrink-0"
            style={{ color: userTeamColor }}
          >
            sports
          </span>
        )}
        <span
          className={clsx(
            'font-headline text-sm font-bold truncate text-right',
            awayWin ? 'text-on-surface' : showScore ? 'text-on-surface-variant' : 'text-on-surface',
            isUserAway && 'text-primary',
          )}
        >
          {match.awayTeamShort}
        </span>
        <span
          className={clsx(
            'w-1.5 h-1.5 rounded-full shrink-0',
            awayWin && 'bg-primary shadow-[0_0_6px_rgba(0,228,121,0.7)]',
            homeWin && 'bg-error/70',
            draw && 'bg-on-surface-variant/40',
            !showScore && 'bg-on-surface-variant/30',
          )}
        />
      </div>
    </div>
  );
}

function RoundPanel({
  kicker,
  round,
  status,
  statusAccent,
  children,
}: {
  kicker: string;
  round: number;
  status: string;
  statusAccent: 'primary' | 'tertiary';
  children: React.ReactNode;
}) {
  const statusClass =
    statusAccent === 'primary'
      ? 'bg-primary/10 text-primary border border-primary/20'
      : 'bg-tertiary/10 text-tertiary border border-tertiary/20';

  return (
    <div className="glass-panel rounded-2xl overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="font-label text-[9px] font-black uppercase tracking-[0.25em] text-primary">
            {kicker}
          </span>
          <span className="font-headline text-sm font-black text-on-surface">
            {round}
          </span>
        </div>
        <span
          className={clsx(
            'font-label text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full',
            statusClass,
          )}
        >
          {status}
        </span>
      </div>
      <div className="p-2 space-y-0.5 flex-1">{children}</div>
    </div>
  );
}

export default function MatchweekResults({
  currentRound,
  lastRoundResults,
  nextRoundMatches,
  userTeamId,
  userTeamColor = "#00e479",
}: MatchweekResultsProps) {
  const t = useTranslations();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* This Round (Last Completed) */}
      <RoundPanel
        kicker={t('league.sections.matchweek')}
        round={currentRound}
        status={t('league.matchweek.completed')}
        statusAccent="primary"
      >
        {lastRoundResults.length > 0 ? (
          lastRoundResults.map((match) => (
            <MatchRow
              key={match.id}
              match={match}
              showScore={true}
              isUserHome={userTeamId === match.homeTeamId}
              isUserAway={userTeamId === match.awayTeamId}
              userTeamColor={userTeamColor}
            />
          ))
        ) : (
          <div className="text-center py-8 text-on-surface-variant text-xs">
            {t('league.matchweek.noResults')}
          </div>
        )}
      </RoundPanel>

      {/* Next Round */}
      <RoundPanel
        kicker={t('league.sections.nextMatchweek')}
        round={currentRound + 1}
        status={t('league.matchweek.upcoming')}
        statusAccent="tertiary"
      >
        {nextRoundMatches.length > 0 ? (
          nextRoundMatches.map((match) => {
            const isUserHome = !!userTeamId && match.homeTeamId === userTeamId;
            const isUserAway = !!userTeamId && match.awayTeamId === userTeamId;
            return (
              <MatchRow
                key={match.id}
                match={match}
                showScore={false}
                showIcon={true}
                isUserHome={isUserHome}
                isUserAway={isUserAway}
                userTeamColor={userTeamColor}
              />
            );
          })
        ) : (
          <div className="text-center py-8 text-on-surface-variant text-xs">
            {t('league.matchweek.noUpcoming')}
          </div>
        )}
      </RoundPanel>
    </div>
  );
}
