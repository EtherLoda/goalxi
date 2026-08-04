"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api, type SearchTeamResult, type SearchPlayerResult, type SearchLeagueResult } from "@/lib/api";
import { useGameStore } from "@/stores/gameStore";
import { clsx } from "clsx";

type SearchType = "team" | "player" | "league";

function SearchPageContent() {
  const t = useTranslations("search");
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { viewTeamId, setViewTeam, teamId } = useGameStore();

  const locale = (params.locale as string) || "en";

  const [searchType, setSearchType] = useState<SearchType>("team");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchTeamResult[] | SearchPlayerResult[] | SearchLeagueResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Sync search type from URL on mount and trigger search
  useEffect(() => {
    const type = searchParams.get("type") as SearchType;
    if (type && ["team", "player", "league"].includes(type)) {
      setSearchType(type);
    }
    const q = searchParams.get("q");
    if (q && q.length >= 2) {
      setQuery(q);
      // Trigger search after a short delay to ensure state is set
      const timer = setTimeout(() => {
        performSearch(q, type || "team");
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  const performSearch = useCallback(async (q: string, type: SearchType) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    try {
      let data: SearchTeamResult[] | SearchPlayerResult[] | SearchLeagueResult[];
      switch (type) {
        case "team":
          data = await api.search.teams(q);
          break;
        case "player":
          data = await api.search.players(q);
          break;
        case "league":
          data = await api.search.leagues(q);
          break;
      }
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced search + update URL
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(() => {
      // Update URL with search params
      const url = new URL(window.location.href);
      url.searchParams.set("q", query);
      url.searchParams.set("type", searchType);
      router.replace(url.pathname + url.search, { scroll: false });
      performSearch(query, searchType);
    }, 400);

    return () => clearTimeout(timer);
  }, [query, searchType, performSearch, router]);

  // Clear URL params when query is cleared
  useEffect(() => {
    if (query === "") {
      const url = new URL(window.location.href);
      url.searchParams.delete("q");
      router.replace(url.pathname + url.search, { scroll: false });
    }
  }, [query, router]);

  const handleTypeChange = (type: SearchType) => {
    setSearchType(type);
    setResults([]);
    // Re-run search with new type if we have a query
    if (query.length >= 2) {
      const timer = setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.set("type", type);
        router.replace(url.pathname + url.search, { scroll: false });
        performSearch(query, type);
      }, 100);
      return () => clearTimeout(timer);
    } else {
      const url = new URL(window.location.href);
      url.searchParams.set("type", type);
      router.replace(url.pathname + url.search, { scroll: false });
    }
  };

  const handleResultClick = (result: SearchTeamResult | SearchPlayerResult | SearchLeagueResult, type: SearchType) => {
    if (type === "team") {
      const team = result as SearchTeamResult;
      setViewTeam(team.id);
      router.push(`/${locale}/dashboard?team=${team.id}`);
    } else if (type === "player") {
      const player = result as SearchPlayerResult;
      router.push(`/${locale}/players/${player.id}`);
    } else if (type === "league") {
      const league = result as SearchLeagueResult;
      router.push(`/${locale}/league/${league.id}`);
    }
  };

  const getResultItem = (result: SearchTeamResult | SearchPlayerResult | SearchLeagueResult, type: SearchType) => {
    if (type === "team") {
      const team = result as SearchTeamResult;
      return (
        <div key={team.id} className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center overflow-hidden">
            {team.logoUrl ? (
              <img src={team.logoUrl} alt={team.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-lg font-bold text-primary">{team.name.charAt(0)}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-headline text-sm font-bold text-on-surface truncate">{team.name}</div>
            <div className="font-body text-xs text-on-surface-variant">Team</div>
          </div>
          <span className="material-symbols-outlined text-on-surface-variant text-lg">chevron_right</span>
        </div>
      );
    } else if (type === "player") {
      const player = result as SearchPlayerResult;
      return (
        <div key={player.id} className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center">
            <span className="material-symbols-outlined text-lg text-primary">
              {player.isGoalkeeper ? "sports" : "sports_soccer"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-headline text-sm font-bold text-on-surface truncate">{player.name}</div>
            <div className="font-body text-xs text-on-surface-variant">
              {player.teamName || "Free Agent"}
            </div>
          </div>
          <span className="material-symbols-outlined text-on-surface-variant text-lg">chevron_right</span>
        </div>
      );
    } else {
      const league = result as SearchLeagueResult;
      return (
        <div key={league.id} className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center">
            <span className="text-xs font-black text-primary">T{league.tier}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-headline text-sm font-bold text-on-surface truncate">{league.name}</div>
            <div className="font-body text-xs text-on-surface-variant">
              Tier {league.tier} · Division {league.tierDivision}
            </div>
          </div>
          <span className="material-symbols-outlined text-on-surface-variant text-lg">chevron_right</span>
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-surface/95 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-3xl mx-auto px-6 py-4">
          {/* Search Type Tabs */}
          <div className="flex gap-1 p-1 rounded-lg bg-surface-container-low mb-4">
            {(["league", "team", "player"] as SearchType[]).map((type) => (
              <button
                key={type}
                onClick={() => handleTypeChange(type)}
                className={clsx(
                  "flex-1 py-2.5 text-xs font-headline font-black uppercase tracking-widest rounded-md transition-all",
                  searchType === type
                    ? "bg-primary text-on-primary shadow-lg"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-white/5"
                )}
              >
                {t(`types.${type}`)}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant">
              search
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("placeholder")}
              className="w-full h-12 pl-12 pr-4 bg-surface-container rounded-xl text-on-surface font-body text-sm placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoFocus
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant hover:text-on-surface"
              >
                close
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="max-w-3xl mx-auto px-6 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : query.length < 2 ? (
          <div className="text-center py-12">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-4">
              search
            </span>
            <p className="font-body text-sm text-on-surface-variant">{t("hint")}</p>
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-12">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-4">
              search_off
            </span>
            <p className="font-body text-sm text-on-surface-variant">{t("noResults")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {results.map((result) => (
              <button
                key={result.id}
                onClick={() => handleResultClick(result, searchType)}
                className="w-full p-4 bg-surface-container rounded-xl hover:bg-surface-container-high transition-colors text-left"
              >
                {getResultItem(result, searchType)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface" />}>
      <SearchPageContent />
    </Suspense>
  );
}
