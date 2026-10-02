"use client";

import RecentEvents from "./RecentEvents";
import MatchweekResults from "./MatchweekResults";
import type { LeagueNewsItem } from "@/lib/api";

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

interface LeftColumnProps {
  news: (LeagueNewsItem & { timeAgo: string })[];
  /** Matchweek of the last completed matchday, or null pre-kickoff. */
  lastMatchweek: number | null;
  /** Matchweek of the next scheduled matchday, or null when finished. */
  nextMatchweek: number | null;
  lastRoundResults: MatchResult[];
  nextRoundMatches: MatchResult[];
  userTeamId?: string;
  /** Locale for the tactics entry href. */
  locale: string;
}

export default function LeftColumn({
  news,
  lastMatchweek,
  nextMatchweek,
  lastRoundResults,
  nextRoundMatches,
  userTeamId,
  locale,
}: LeftColumnProps) {
  return (
    <div className="space-y-6">
      <MatchweekResults
        lastMatchweek={lastMatchweek}
        nextMatchweek={nextMatchweek}
        lastRoundResults={lastRoundResults}
        nextRoundMatches={nextRoundMatches}
        userTeamId={userTeamId}
        locale={locale}
      />
      <RecentEvents news={news} />
    </div>
  );
}
