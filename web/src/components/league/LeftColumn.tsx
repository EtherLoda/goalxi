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
  awayTeam: string;
  awayTeamShort: string;
  homeScore: number;
  awayScore: number;
}

interface LeftColumnProps {
  news: NewsItem[];
  matchday: number;
  matchResults: MatchResult[];
}

export default function LeftColumn({
  news,
  matchday,
  matchResults,
}: LeftColumnProps) {
  return (
    <div className="space-y-6">
      <RecentEvents news={news} />
      <MatchweekResults matchday={matchday} results={matchResults} />
    </div>
  );
}
