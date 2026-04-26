"use client";

import RecentEvents from "./RecentEvents";
import MatchweekResults from "./MatchweekResults";
import type { Match } from "@/lib/api";

interface NewsItem {
  id: string;
  type: "manager" | "transfer" | "general";
  title: string;
  excerpt: string;
  timeAgo: string;
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
  news: NewsItem[];
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
