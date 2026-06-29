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
  currentRound: number;
  lastRoundResults: MatchResult[];
  nextRoundMatches: MatchResult[];
  userTeamId?: string;
  userTeamColor?: string;
}

export default function LeftColumn({
  news,
  currentRound,
  lastRoundResults,
  nextRoundMatches,
  userTeamId,
  userTeamColor,
}: LeftColumnProps) {
  return (
    <div className="space-y-6">
      <MatchweekResults
        currentRound={currentRound}
        lastRoundResults={lastRoundResults}
        nextRoundMatches={nextRoundMatches}
        userTeamId={userTeamId}
        userTeamColor={userTeamColor}
      />
      <RecentEvents news={news} />
    </div>
  );
}
