"use client";

import RecentEvents from "./RecentEvents";
import MatchweekResults from "./MatchweekResults";
import type { Match, LeagueNewsItem } from "@/lib/api";

interface NewsItem {
  id: string;
  type: "manager" | "transfer" | "general";
  title: string;
  excerpt: string;
  timeAgo: string;
  playerId?: string;
  playerName?: string;
  fromTeamId?: string;
  fromTeamName?: string;
  toTeamId?: string;
  toTeamName?: string;
}

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
}

export default function LeftColumn({
  news,
  currentRound,
  lastRoundResults,
  nextRoundMatches,
  userTeamId,
}: LeftColumnProps) {
  return (
    <div className="space-y-6">
      <MatchweekResults
        currentRound={currentRound}
        lastRoundResults={lastRoundResults}
        nextRoundMatches={nextRoundMatches}
        userTeamId={userTeamId}
      />
      <RecentEvents news={news} />
    </div>
  );
}
