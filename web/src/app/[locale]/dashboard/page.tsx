"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { api, type Standing, type Match, type Notification, type Team } from "@/lib/api";
import { useGameStore } from "@/stores/gameStore";

// Mock announcements for System Announcements panel
const MOCK_ANNOUNCEMENTS = [
  {
    id: '1',
    type: 'FEATURE',
    title: 'Season 2 Coming Soon!',
    content: 'Get ready for Season 2! New features including enhanced tactical options and improved youth academy system.',
    createdAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
  },
  {
    id: '2',
    type: 'EVENT',
    title: 'Transfer Window Opens',
    content: 'The winter transfer window is now open. Teams can buy and sell players until the deadline.',
    createdAt: Date.now() - 24 * 60 * 60 * 1000, // 1 day ago
  },
  {
    id: '3',
    type: 'MAINTENANCE',
    title: 'Server Maintenance Scheduled',
    content: 'Scheduled maintenance on April 30th from 02:00 to 04:00 UTC.',
    createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000, // 3 days ago
  },
];

function DashboardPageContent() {
  const t = useTranslations();
  const params = useParams();
  const searchParams = useSearchParams();
  const { user, team, isLoading: authLoading } = useAuth();
  const { viewTeamId, setViewTeam, teamId } = useGameStore();

  // Sync URL params to Zustand on mount
  useEffect(() => {
    const urlTeamId = searchParams.get("team");
    if (urlTeamId && urlTeamId !== viewTeamId) {
      setViewTeam(urlTeamId);
    }
  }, []);

  const myTeam = viewTeamId === null || viewTeamId === teamId;
  const displayTeamId = myTeam ? teamId : viewTeamId;
  const isViewingMyTeam = myTeam;

  const [viewedTeam, setViewedTeam] = useState<Team | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [upcomingMatch, setUpcomingMatch] = useState<Match | null>(null);
  const [recentMatches, setRecentMatches] = useState<Match[]>([]);
  const [teamNotifications, setTeamNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch viewed team info when teamId changes
  useEffect(() => {
    if (myTeam) {
      setViewedTeam(null);
      return;
    }
    if (viewTeamId) {
      api.teams.getById(viewTeamId).then(setViewedTeam).catch(() => setViewedTeam(null));
    }
  }, [viewTeamId, myTeam]);

  // Use viewedTeam when viewing another team, otherwise use team from auth
  const currentTeam = myTeam ? team : viewedTeam;

  // Fetch dashboard data - depends on viewedTeam to re-run when team data is loaded
  useEffect(() => {
    if (!currentTeam?.leagueId) return;

    setIsLoading(true);

    Promise.all([
      api.leagues.getStandings(currentTeam.leagueId),
      api.matches.getByTeam(currentTeam.id, { status: "scheduled" }),
      api.matches.getByTeam(currentTeam.id, { status: "completed", season: 1 }),
      api.notifications.getNotifications(1, 50).catch(() => ({ items: [] })),
    ])
      .then(([standingsData, upcomingData, recentData, notificationsData]) => {
        setStandings(standingsData);
        // Sort by round to get the actual next match (same logic as League page)
        const sortedUpcoming = [...(upcomingData?.data || [])].sort((a, b) => {
          const roundA = a.round ?? a.week * 2;
          const roundB = b.round ?? b.week * 2;
          return roundA - roundB;
        });
        const upcoming = sortedUpcoming[0] || null;
        setUpcomingMatch(upcoming);
        // Get last 5 completed matches for form
        const recent = (recentData?.data || [])
          .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
          .slice(0, 5);
        setRecentMatches(recent);
        // Set team notifications (personal notifications)
        setTeamNotifications(notificationsData?.items || []);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [currentTeam?.id, currentTeam?.leagueId, viewedTeam]);

  const userStanding = standings.find((s) => s.teamId === currentTeam?.id);

  const getFormResults = () => {
    return recentMatches.map((match) => {
      const isHome = match.homeTeamId === currentTeam?.id;
      const userScore = isHome ? match.homeScore : match.awayScore;
      const opponentScore = isHome ? match.awayScore : match.homeScore;

      if (userScore === null || opponentScore === null) return { result: "-", type: "pending" as const };
      if (userScore > opponentScore) return { result: "W", type: "win" as const };
      if (userScore < opponentScore) return { result: "L", type: "loss" as const };
      return { result: "D", type: "draw" as const };
    });
  };

  const formResults = getFormResults();

  const getOpponentName = (match: Match) => {
    if (!currentTeam) return "";
    return match.homeTeamId === currentTeam.id ? match.awayTeam?.name : match.homeTeam?.name;
  };

  const getOpponentInitials = (name: string) => {
    // Handle "Team X" or "Team XX" pattern -> "T1" or "T11"
    const teamMatch = name.match(/^Team\s+(\d+)$/i);
    if (teamMatch) {
      return `T${teamMatch[1]}`;
    }
    // For other names, take first letter of each word
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 3)
      .toUpperCase();
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  const formatAmount = (amount: number) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K`;
    return amount.toString();
  };

  const getNotificationMessage = (notification: Notification) => {
    const { type, data } = notification;
    switch (type) {
      case 'MATCH_RESULT_WIN': return `Victory! ${data.homeTeamName} ${data.homeScore} - ${data.awayScore} ${data.awayTeamName}`;
      case 'MATCH_RESULT_LOSS': return `Defeat. ${data.homeTeamName} ${data.homeScore} - ${data.awayScore} ${data.awayTeamName}`;
      case 'MATCH_RESULT_DRAW': return `Draw. ${data.homeTeamName} ${data.homeScore} - ${data.awayScore} ${data.awayTeamName}`;
      case 'PLAYER_PURCHASED': return `Purchased ${data.playerName} for ${formatAmount(data.amount)}`;
      case 'PLAYER_SOLD': return `Sold ${data.playerName} for ${formatAmount(data.amount)}`;
      case 'AUCTION_OUTBID': return `Outbid on ${data.playerName}`;
      case 'AUCTION_WON': return `Won auction for ${data.playerName}!`;
      case 'AUCTION_LOST': return `Lost auction for ${data.playerName}`;
      case 'PLAYER_INJURED': return `${data.playerName} is injured`;
      case 'PLAYER_RECOVERED': return `${data.playerName} has recovered`;
      case 'PLAYER_SKILL_IMPROVED': return `${data.playerName}'s ${data.skillType} improved`;
      case 'PLAYER_SKILL_DECREASED': return `${data.playerName}'s ${data.skillType} dropped`;
      default: return data.message || type;
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
          {/* Hero Grid: Next Match */}
          <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Next Match Card */}
            <div className="xl:col-span-2 glass-panel rounded-2xl overflow-hidden p-8 relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />
              <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                {/* Left info */}
                <div className="flex-1 space-y-4 text-center md:text-left">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="font-label text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                      {t("dashboard.matchday")} {upcomingMatch?.round || "--"}
                    </span>
                  </div>
                  <h2 className="font-headline text-5xl font-black tracking-tighter text-on-surface">
                    {upcomingMatch ? getOpponentName(upcomingMatch).toUpperCase() : "NO MATCHES"}
                  </h2>
                  <p className="font-body text-sm text-on-surface-variant max-w-sm leading-relaxed">
                    {upcomingMatch
                      ? `${t("dashboard.venue")}: ${upcomingMatch.venue || "TBD"}`
                      : "No upcoming matches scheduled"}
                  </p>
                  <div className="flex flex-wrap gap-6 pt-2 justify-center md:justify-start">
                    <div className="flex flex-col">
                      <span className="font-label text-[9px] uppercase tracking-[0.2em] text-primary font-black mb-1">
                        {t("dashboard.kickoff")}
                      </span>
                      <span className="font-headline font-bold text-on-surface">
                        {upcomingMatch ? formatDate(upcomingMatch.scheduledAt) : "-- : --"}
                      </span>
                    </div>
                    <div className="w-px h-8 bg-white/10" />
                    <div className="flex flex-col">
                      <span className="font-label text-[9px] uppercase tracking-[0.2em] text-primary font-black mb-1">
                        {t("dashboard.venue")}
                      </span>
                      <span className="font-headline font-bold text-on-surface">
                        {upcomingMatch?.venue || "TBD"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* VS Block */}
                <div className="flex items-center gap-6 px-8 py-6 rounded-3xl bg-surface-container-low/80 backdrop-blur-md border border-white/5">
                  <div className="text-center space-y-2">
                    <div
                      className="w-16 h-16 rounded-full border-2 flex items-center justify-center"
                      style={{
                        backgroundColor: `${currentTeam?.jerseyColorPrimary || "#00E479"}20`,
                        borderColor: currentTeam?.jerseyColorPrimary || "#00E479",
                      }}
                    >
                      <span
                        className="font-headline font-black text-lg"
                        style={{ color: currentTeam?.jerseyColorPrimary || "#00E479" }}
                      >
                        {currentTeam ? getOpponentInitials(currentTeam.name) : "EF"}
                      </span>
                    </div>
                    <span className="font-label text-[10px] font-black text-secondary uppercase tracking-widest">
                      {t("dashboard.home")}
                    </span>
                  </div>
                  <div className="font-headline font-black text-2xl text-on-surface-variant/30">VS</div>
                  <div className="text-center space-y-2">
                    <div className="w-16 h-16 rounded-full bg-error/10 border-2 border-error/30 flex items-center justify-center">
                      <span className="font-headline font-black text-lg text-error">
                        {upcomingMatch ? getOpponentInitials(getOpponentName(upcomingMatch)) : "TBD"}
                      </span>
                    </div>
                    <span className="font-label text-[10px] font-black text-error uppercase tracking-widest">
                      {t("dashboard.away")}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Squad Status */}
            <div className="glass-panel rounded-2xl p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-headline font-black text-xs uppercase tracking-[0.2em] text-primary">
                    {t("dashboard.squadStatus")}
                  </h3>
                  <span className="font-label text-[9px] font-black text-on-surface-variant uppercase tracking-widest">
                    {currentTeam?.name || "Loading..."}
                  </span>
                </div>
                <div className="flex items-center gap-4 mb-6">
                  <span className="font-headline text-6xl font-black text-on-surface tracking-tighter">
                    {userStanding ? `#${userStanding.position}` : "--"}
                  </span>
                  <div className="space-y-1">
                    {userStanding && userStanding.position <= 4 ? (
                      <div className="flex items-center gap-2 text-primary">
                        <span className="material-symbols-outlined text-sm">trending_up</span>
                        <span className="font-label text-[10px] font-black uppercase tracking-wider">
                          Playoff Zone
                        </span>
                      </div>
                    ) : userStanding && userStanding.position > 12 ? (
                      <div className="flex items-center gap-2 text-error">
                        <span className="material-symbols-outlined text-sm">trending_down</span>
                        <span className="font-label text-[10px] font-black uppercase tracking-wider">
                          Relegation Zone
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-on-surface-variant">
                        <span className="material-symbols-outlined text-sm">trending_flat</span>
                        <span className="font-label text-[10px] font-black uppercase tracking-wider">
                          Mid Table
                        </span>
                      </div>
                    )}
                    <p className="font-body text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
                      {userStanding
                        ? `${userStanding.points} ${t("dashboard.points")} | ${userStanding.played} ${t("dashboard.games")}`
                        : "Loading..."}
                    </p>
                  </div>
                </div>
              </div>

              {/* Recent Form */}
              <div className="space-y-3">
                <p className="font-label text-[9px] uppercase tracking-[0.2em] text-primary font-black">
                  {t("dashboard.recentForm")}
                </p>
                <div className="flex gap-2">
                  {formResults.length > 0 ? (
                    formResults.map((r, i) => (
                      <div
                        key={i}
                        className={`w-9 h-9 rounded-lg flex items-center justify-center font-headline font-black text-xs border ${
                          r.type === "win"
                            ? "bg-primary text-on-primary border-primary shadow-[0_0_12px_rgba(0,228,121,0.3)]"
                            : r.type === "draw"
                            ? "bg-white/5 text-on-surface-variant border-white/10"
                            : r.type === "loss"
                            ? "bg-error/10 text-error border-error/20"
                            : "bg-white/5 text-on-surface-variant border-white/10"
                        }`}
                      >
                        {r.result}
                      </div>
                    ))
                  ) : (
                    <div className="text-on-surface-variant text-sm">No recent matches</div>
                  )}
                </div>
                <div className="pt-3 border-t border-white/5 flex justify-between items-center">
                  <span className="font-label text-[10px] text-on-surface-variant font-bold uppercase">
                    {upcomingMatch
                      ? `Next: ${getOpponentName(upcomingMatch)}`
                      : "No upcoming matches"}
                  </span>
                  <a href="#" className="font-label text-[10px] font-black text-primary uppercase tracking-widest hover:underline">
                    Full Table →
                  </a>
                </div>
              </div>
            </div>
          </section>

          {/* Second Grid */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Team News - Action Required */}
            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <h3 className="font-headline font-black text-xs uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg">assignment_late</span>
                  {isViewingMyTeam ? "Team News" : `${currentTeam?.name || "Team"} News`}
                </h3>
                {isViewingMyTeam && (
                  <span className="font-label text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    {teamNotifications.length} Updates
                  </span>
                )}
              </div>
              <div className="bg-surface-container-low/75 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden shadow-glass divide-y divide-white/5">
                {!isViewingMyTeam ? (
                  <div className="p-8 text-center">
                    <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-2 block">
                      visibility
                    </span>
                    <p className="font-body text-sm text-on-surface-variant">
                      You are viewing {currentTeam?.name || "this team"}'s dashboard
                    </p>
                  </div>
                ) : teamNotifications.length === 0 ? (
                  <div className="p-8 text-center">
                    <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-2 block">
                      check_circle
                    </span>
                    <p className="font-body text-sm text-on-surface-variant">
                      No team news at this time
                    </p>
                  </div>
                ) : (
                  teamNotifications.map((notification) => {
                    const getNotificationIcon = (type: string) => {
                      switch (type) {
                        case 'MATCH_RESULT_WIN': return { icon: 'emoji_events', bg: 'bg-tertiary/10', border: 'border-tertiary/20', text: 'text-tertiary' };
                        case 'MATCH_RESULT_LOSS': return { icon: 'sentiment_dissatisfied', bg: 'bg-error/10', border: 'border-error/20', text: 'text-error' };
                        case 'MATCH_RESULT_DRAW': return { icon: 'remove', bg: 'bg-white/10', border: 'border-white/20', text: 'text-on-surface-variant' };
                        case 'PLAYER_SKILL_IMPROVED': return { icon: 'trending_up', bg: 'bg-primary/10', border: 'border-primary/20', text: 'text-primary' };
                        case 'PLAYER_SKILL_DECREASED': return { icon: 'trending_down', bg: 'bg-error/10', border: 'border-error/20', text: 'text-error' };
                        case 'PLAYER_INJURED': return { icon: 'medical_services', bg: 'bg-error/10', border: 'border-error/20', text: 'text-error' };
                        case 'PLAYER_RECOVERED': return { icon: 'healing', bg: 'bg-primary/10', border: 'border-primary/20', text: 'text-primary' };
                        case 'PLAYER_PURCHASED': return { icon: 'person_add', bg: 'bg-primary/10', border: 'border-primary/20', text: 'text-primary' };
                        case 'PLAYER_SOLD': return { icon: 'person_remove', bg: 'bg-white/10', border: 'border-white/20', text: 'text-on-surface-variant' };
                        case 'AUCTION_OUTBID': return { icon: 'gavel', bg: 'bg-tertiary/10', border: 'border-tertiary/20', text: 'text-tertiary' };
                        case 'AUCTION_WON': return { icon: 'workspace_premium', bg: 'bg-tertiary/10', border: 'border-tertiary/20', text: 'text-tertiary' };
                        case 'AUCTION_LOST': return { icon: 'cancel', bg: 'bg-white/10', border: 'border-white/20', text: 'text-on-surface-variant' };
                        default: return { icon: 'notifications', bg: 'bg-white/10', border: 'border-white/20', text: 'text-on-surface-variant' };
                      }
                    };
                    const iconStyle = getNotificationIcon(notification.type);
                    const hasPlayerLink = notification.data?.playerId;
                    const content = (
                      <div className="p-5 flex items-center gap-4 hover:bg-primary/5 transition-colors cursor-pointer group">
                        <div className={`w-10 h-10 rounded-xl ${iconStyle.bg} border ${iconStyle.border} flex items-center justify-center ${iconStyle.text} shrink-0`}>
                          <span className="material-symbols-outlined text-sm">{iconStyle.icon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors line-clamp-1">
                            {getNotificationMessage(notification)}
                          </h4>
                          <p className="text-xs text-on-surface-variant">
                            {formatRelativeTime(notification.createdAt)}
                          </p>
                        </div>
                        <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary">chevron_right</span>
                      </div>
                    );
                    return hasPlayerLink ? (
                      <Link key={notification.id} href={`/players/${notification.data.playerId}`}>
                        {content}
                      </Link>
                    ) : (
                      <div key={notification.id}>{content}</div>
                    );
                  })
                )}
              </div>
            </div>

            {/* System Announcements */}
            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <h3 className="font-headline font-black text-xs uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>campaign</span>
                  System Announcements
                </h3>
                <a href="#" className="font-label text-[10px] font-black text-on-surface-variant uppercase tracking-widest hover:text-primary transition-colors">
                  Archive
                </a>
              </div>
              <div className="space-y-4 overflow-visible">
                {MOCK_ANNOUNCEMENTS.length === 0 ? (
                  <div className="bg-surface-container-low/75 backdrop-blur-xl border border-white/5 rounded-2xl p-8 text-center shadow-glass">
                    <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-2 block">
                      newsmode
                    </span>
                    <p className="font-body text-sm text-on-surface-variant">
                      No announcements at this time
                    </p>
                  </div>
                ) : (
                  MOCK_ANNOUNCEMENTS.slice(0, 5).map((item) => (
                    <div key={item.id} className="bg-surface-container-low/75 backdrop-blur-xl border border-white/5 rounded-2xl p-5 border-l-4 border-primary relative group overflow-hidden shadow-glass">
                      <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <span className="text-[9px] font-black text-primary uppercase tracking-[0.3em] block mb-2 relative z-10">{item.type}</span>
                      <h4 className="text-on-surface font-headline font-bold mb-1 relative z-10">{item.title}</h4>
                      <p className="text-xs text-on-surface-variant leading-relaxed relative z-10">{item.content}</p>
                      <div className="mt-4 flex justify-between items-center relative z-10">
                        <span className="text-[9px] text-on-surface-variant/50 font-black uppercase tracking-widest">{formatRelativeTime(item.createdAt)}</span>
                        <span className="text-[9px] font-black text-primary uppercase tracking-widest cursor-pointer hover:underline">Read More</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardPageLoading />}>
      <DashboardPageContent />
    </Suspense>
  );
}

function DashboardPageLoading() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
      <div className="animate-pulse space-y-6">
        <div className="h-12 w-64 bg-surface-container rounded-lg" />
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 h-48 bg-surface-container-highest rounded-2xl" />
          <div className="h-48 bg-surface-container-highest rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
