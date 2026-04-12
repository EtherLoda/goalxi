"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useCallback } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { api, type Player, type TransferAuction } from "@/lib/api";
import TransferListSkeleton from "@/components/transfers/TransferListSkeleton";
import PlayerDetailSkeleton from "@/components/transfers/PlayerDetailSkeleton";

// Mock data for transfers
const MOCK_TRANSFERS = [
  {
    id: "1",
    player: {
      id: "p1",
      name: "Khéphren Thuram",
      nationality: "France",
      age: 22,
      ageDays: 156,
      currentWage: 45000,
      isGoalkeeper: false,
      overall: 82,
      position: "CM",
      teamName: "OGC Nice",
      currentSkills: { physical: { pace: 16, strength: 15 }, technical: { finishing: 14, passing: 18, dribbling: 16, defending: 12 }, mental: { composure: 14, positioning: 15 }, setPieces: { freeKicks: 8, penalties: 10 } },
      potentialSkills: { physical: { pace: 18, strength: 17 }, technical: { finishing: 16, passing: 19, dribbling: 18, defending: 14 }, mental: { composure: 16, positioning: 17 }, setPieces: { freeKicks: 10, penalties: 12 } },
    },
    currentPrice: 52000000,
    buyoutPrice: 75000000,
    expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // Fixed for demo
    isKeyTarget: true,
  },
  {
    id: "2",
    player: {
      id: "p2",
      name: "Antonio Nusa",
      nationality: "Norway",
      age: 18,
      ageDays: 89,
      currentWage: 15000,
      isGoalkeeper: false,
      overall: 72,
      position: "LWF",
      teamName: "Club Brugge",
      currentSkills: { physical: { pace: 18, strength: 10 }, technical: { finishing: 15, passing: 12, dribbling: 17, defending: 8 }, mental: { composure: 11, positioning: 10 }, setPieces: { freeKicks: 6, penalties: 8 } },
      potentialSkills: { physical: { pace: 20, strength: 14 }, technical: { finishing: 18, passing: 16, dribbling: 19, defending: 12 }, mental: { composure: 14, positioning: 13 }, setPieces: { freeKicks: 8, penalties: 10 } },
    },
    currentPrice: 22000000,
    buyoutPrice: 35000000,
    expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 10 * 60 * 60 * 1000).toISOString(), // Fixed for demo
    isKeyTarget: false,
  },
  {
    id: "3",
    player: {
      id: "p3",
      name: "Vini Júnior",
      nationality: "Brazil",
      age: 23,
      ageDays: 45,
      currentWage: 350000,
      isGoalkeeper: false,
      overall: 89,
      position: "LWF",
      teamName: "Real Madrid",
      currentSkills: { physical: { pace: 20, strength: 14 }, technical: { finishing: 18, passing: 16, dribbling: 19, defending: 10 }, mental: { composure: 17, positioning: 15 }, setPieces: { freeKicks: 12, penalties: 14 } },
      potentialSkills: { physical: { pace: 20, strength: 15 }, technical: { finishing: 20, passing: 18, dribbling: 20, defending: 12 }, mental: { composure: 18, positioning: 17 }, setPieces: { freeKicks: 14, penalties: 16 } },
    },
    currentPrice: 142000000,
    buyoutPrice: 200000000,
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000 + 45 * 60 * 1000).toISOString(), // Fixed for demo
    isKeyTarget: false,
  },
];

const MOCK_BUDGET = 145250000;

const COUNTRY_FLAGS: Record<string, string> = {
  France: "🇫🇷",
  Norway: "🇳🇴",
  Brazil: "🇧🇷",
  Spain: "🇪🇸",
  England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  Germany: "🇩🇪",
  Italy: "🇮🇹",
  Portugal: "🇵🇹",
  Argentina: "🇦🇷",
  Netherlands: "🇳🇱",
  Belgium: "🇧🇪",
  Croatia: "🇭🇷",
};

type TransferPlayer = Player;

export default function TransfersPage() {
  const t = useTranslations();
  const { user, team } = useAuth();
  const [transfers, setTransfers] = useState<TransferAuction[]>([]);
  const [selectedTransfer, setSelectedTransfer] = useState<TransferAuction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [budget, setBudget] = useState<number | null>(null);
  const [isSubmittingBid, setIsSubmittingBid] = useState(false);
  const [showBuyoutConfirm, setShowBuyoutConfirm] = useState(false);
  const [showBidHistoryModal, setShowBidHistoryModal] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filter states
  const [attributeFilters, setAttributeFilters] = useState<Array<{ id: string; attribute: string; range: { min: number; max: number } }>>([]);
  const [showAddFilterDropdown, setShowAddFilterDropdown] = useState(false);
  const [ageEnabled, setAgeEnabled] = useState(false);
  const [ageRange, setAgeRange] = useState({ min: 20, max: 25 });
  const [specialtyEnabled, setSpecialtyEnabled] = useState(false);
  const [selectedSpecialty, setSelectedSpecialty] = useState("");
  const [playerTypeFilter, setPlayerTypeFilter] = useState<"outfield" | "gk">("outfield");

  const OUTFIELD_ATTRIBUTES = [
    { value: "pace", label: "Pace", icon: "directions_run" },
    { value: "strength", label: "Strength", icon: "fitness_center" },
    { value: "finishing", label: "Finishing", icon: "sports_soccer" },
    { value: "dribbling", label: "Dribbling", icon: "sports_basketball" },
    { value: "passing", label: "Passing", icon: "swap_horiz" },
    { value: "defending", label: "Defending", icon: "shield" },
    { value: "composure", label: "Composure", icon: "psychology" },
    { value: "positioning", label: "Positioning", icon: "place_item" },
    { value: "freeKicks", label: "Free Kicks", icon: "sports" },
    { value: "penalties", label: "Penalties", icon: "flag" },
  ];

  const GK_ATTRIBUTES = [
    { value: "reflexes", label: "Reflexes", icon: "pan_tool" },
    { value: "handling", label: "Handling", icon: "back_hand" },
    { value: "aerial", label: "Aerial", icon: "sports" },
    { value: "pace", label: "Pace", icon: "directions_run" },
    { value: "strength", label: "Strength", icon: "fitness_center" },
    { value: "positioning", label: "Positioning", icon: "place_item" },
    { value: "composure", label: "Composure", icon: "psychology" },
    { value: "freeKicks", label: "Free Kicks", icon: "sports" },
    { value: "penalties", label: "Penalties", icon: "flag" },
  ];

  const ATTRIBUTES = playerTypeFilter === "gk" ? GK_ATTRIBUTES : OUTFIELD_ATTRIBUTES;

  const SPECIALTIES = [
    { value: "header_specialist", label: "头球专家", icon: "sports_kabaddi" },
    { value: "long_passer", label: "长传手", icon: "near_me" },
    { value: "cross_specialist", label: "传中专家", icon: "swap_vert" },
    { value: "dribble_master", label: "盘带大师", icon: "cruelty_free" },
    { value: "long_shooter", label: "远射", icon: "my_location" },
    { value: "clutch_player", label: "关键先生", icon: "emoji_events" },
    { value: "tackle_master", label: "抢断大师", icon: "shield" },
    { value: "penalty_saver", label: "点球门将", icon: "pan_tool" },
    { value: "counter_starter", label: "反击启动", icon: "bolt" },
    { value: "rebound_specialist", label: "补射专家", icon: "replay" },
    { value: "fast_start", label: "快发", icon: "timer" },
  ];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.add-filter-dropdown')) {
        setShowAddFilterDropdown(false);
      }
      if (!target.closest('#specialty-dropdown') && !target.closest('.specialty-trigger')) {
        document.getElementById('specialty-dropdown')?.classList.add('hidden');
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const addAttributeFilter = (attribute: string) => {
    if (attributeFilters.length >= 3) return;
    const newFilter = {
      id: Date.now().toString(),
      attribute,
      range: { min: 8, max: 12 },
    };
    setAttributeFilters([...attributeFilters, newFilter]);
    setShowAddFilterDropdown(false);
  };

  const removeAttributeFilter = (id: string) => {
    setAttributeFilters(attributeFilters.filter(f => f.id !== id));
  };

  const updateAttributeFilterRange = (id: string, min: number, max: number) => {
    setAttributeFilters(attributeFilters.map(f => f.id === id ? { ...f, range: { min, max } } : f));
  };

  const resetAllFilters = () => {
    setAttributeFilters([]);
    setAgeEnabled(false);
    setSpecialtyEnabled(false);
    setSelectedSpecialty("");
  };

  const getAttributeValue = (player: TransferPlayer, attr: string): number => {
    const skill = player.currentSkills as any;
    if (attr === "age") return player.age;
    if (attr === "overall") return player.overall;
    if (skill.physical?.[attr]) return skill.physical[attr];
    if (skill.technical?.[attr]) return skill.technical[attr];
    if (skill.mental?.[attr]) return skill.mental[attr];
    if (skill.setPieces?.[attr]) return skill.setPieces[attr];
    return 0;
  };

  // Fetch transfers data
  const fetchTransfers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [auctionsData, teamData] = await Promise.all([
        api.transfers.getAuctions(),
        team ? api.teams.getByUser(user!.id) : null,
      ]);
      setTransfers(auctionsData);
      if (teamData) {
        // @ts-ignore - backend may have budget field
        setBudget(teamData.budget || null);
      }
      // Select first transfer if available
      if (auctionsData.length > 0 && !selectedTransfer) {
        setSelectedTransfer(auctionsData[0]);
      }
      return auctionsData;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transfers");
      console.error("Failed to fetch transfers:", err);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [user, team, selectedTransfer]);

  useEffect(() => {
    fetchTransfers();
  }, [fetchTransfers]);

  const filteredTransfers = transfers.filter((t) => {
    // Attribute filters
    for (const filter of attributeFilters) {
      const attrValue = getAttributeValue(t.player, filter.attribute);
      if (attrValue < filter.range.min || attrValue > filter.range.max) {
        return false;
      }
    }
    // Age filter
    if (ageEnabled && (t.player.age < ageRange.min || t.player.age > ageRange.max)) {
      return false;
    }
    // Specialty filter
    if (specialtyEnabled && selectedSpecialty) {
      const playerSpecialties = (t.player as any).specialties || [];
      if (!playerSpecialties.includes(selectedSpecialty)) {
        return false;
      }
    }
    return true;
  });

  const formatCurrency = (value: number) => {
    return `£${value.toLocaleString()}`;
  };

  const formatTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();

    if (diff <= 0) return "Expired";

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours >= 48) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    if (hours >= 24) {
      return `${Math.floor(hours / 24)}d ${hours % 24}h`;
    }
    return `${hours}h ${minutes}m`;
  };

  const formatBidTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours >= 24) {
      return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
    if (hours >= 1) {
      return `${hours}h ago`;
    }
    return `${minutes}m ago`;
  };

  const formatBidAmountInput = (value: string) => {
    const num = parseInt(value.replace(/,/g, ''));
    if (isNaN(num)) return '';
    return num.toLocaleString();
  };

  // Auto-dismiss notification after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Pre-fill bid amount when selecting a transfer
  useEffect(() => {
    if (selectedTransfer && team) {
      const userBids = selectedTransfer.bidHistory.filter(b => b.teamId === team.id);
      if (userBids.length > 0) {
        const lastBid = userBids[userBids.length - 1].amount;
        const newBid = Math.max(lastBid + 10000, Math.ceil(lastBid * 1.05));
        setBidAmount(newBid.toLocaleString());
      } else {
        setBidAmount(selectedTransfer.startPrice.toLocaleString());
      }
    }
  }, [selectedTransfer, team]);

  const SKILL_MAX = 20;

  const renderSkillBar = (label: string, current: number, potential: number, colorClass: string) => {
    const percentage = (current / SKILL_MAX) * 100;
    return (
      <div className="space-y-1.5">
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-[#91b2a6]">
          <span>{label}</span>
          <span className={colorClass}>{current}/{potential}</span>
        </div>
        <div className="h-1.5 w-full bg-[#00251c] rounded-full overflow-hidden">
          <div className={`h-full ${colorClass.replace('text-', 'bg-')} rounded-full`} style={{ width: `${percentage}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen bg-[#00110c]">
      {/* Notification Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-[200] px-6 py-4 rounded-xl shadow-lg flex items-center gap-3 animate-in slide-in-from-top ${
          notification.type === 'success' ? 'bg-[#002c22] border border-[#a1ffc2]' : 'bg-red-900/80 border border-red-500'
        }`}>
          <span className={`material-symbols-outlined ${notification.type === 'success' ? 'text-[#a1ffc2]' : 'text-red-400'}`}>
            {notification.type === 'success' ? 'check_circle' : 'error'}
          </span>
          <span className="text-sm font-bold text-[#d3f5e8]">{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="ml-2 text-[#91b2a6] hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}
      <Sidebar />

      <main className="flex-1 ml-64 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-[#00110c]/70 backdrop-blur-2xl border-b border-white/5 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-8">
            <h1 className="font-headline font-black text-sm uppercase tracking-[0.2em] text-[#a1ffc2]">
              {t("transfers.title")}
            </h1>
            <nav className="flex items-center gap-6 border-l border-[#2f4e44]/30 pl-6">
              <a className="text-[#a1ffc2] text-xs font-bold border-b border-[#a1ffc2] pb-1" href="#">{t("transfers.nav.market")}</a>
              <button
                onClick={() => alert("Shortlist: Feature coming soon")}
                className="text-[#91b2a6] text-xs font-bold hover:text-[#a1ffc2] transition-colors"
              >{t("transfers.nav.shortlist")}</button>
              <button
                onClick={() => alert("History: Feature coming soon")}
                className="text-[#91b2a6] text-xs font-bold hover:text-[#a1ffc2] transition-colors"
              >{t("transfers.nav.history")}</button>
            </nav>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center bg-[#001e17] px-4 py-2 rounded-full border border-[#2f4e44]/30">
              <span className="text-[10px] text-[#00ec90] mr-2 font-bold">{t("transfers.budget")}</span>
              {budget !== null ? (
                <span className="text-[#d3f5e8] font-bold tracking-tight">{formatCurrency(budget)}</span>
              ) : (
                <div className="w-16 h-4 bg-[#002c22] rounded animate-pulse" />
              )}
            </div>
            <div className="flex items-center gap-4">
              <span className="material-symbols-outlined text-[#91b2a6] cursor-pointer hover:text-[#a1ffc2] transition-colors">notifications</span>
              <span className="material-symbols-outlined text-[#91b2a6] cursor-pointer hover:text-[#a1ffc2] transition-colors">account_balance_wallet</span>
              <div className="w-8 h-8 rounded-full bg-[#002c22] flex items-center justify-center border border-[#a1ffc2]/20">
                <span className="font-headline font-black text-xs text-[#a1ffc2]">
                  {user?.nickname?.charAt(0) || "U"}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-grow flex overflow-hidden">
          {/* Left Panel: Filters */}
          <aside className="w-72 h-full bg-[#001e17] border-r border-[#2f4e44]/10 p-6 overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-bold text-[#a1ffc2] tracking-tight text-xs uppercase">{t("transfers.filters.scoutingFilters")}</h2>
              <span className="material-symbols-outlined text-sm text-[#91b2a6] cursor-pointer">filter_list</span>
            </div>

            <div className="space-y-6">
              {/* Player Type Toggle */}
              <div className="bg-[#00251c] rounded-xl p-1 flex">
                <button
                  onClick={() => {
                    setPlayerTypeFilter("outfield");
                    setAttributeFilters([]); // Clear filters when switching
                  }}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold font-space transition-all ${
                    playerTypeFilter === "outfield"
                      ? "bg-[#a1ffc2] text-[#00110c]"
                      : "text-[#91b2a6] hover:text-[#d3f5e8]"
                  }`}
                >
                  Outfield
                </button>
                <button
                  onClick={() => {
                    setPlayerTypeFilter("gk");
                    setAttributeFilters([]); // Clear filters when switching
                  }}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold font-space transition-all ${
                    playerTypeFilter === "gk"
                      ? "bg-[#a1ffc2] text-[#00110c]"
                      : "text-[#91b2a6] hover:text-[#d3f5e8]"
                  }`}
                >
                  Goalkeeper
                </button>
              </div>

              {/* Active Attribute Filters */}
              {attributeFilters.length > 0 && (
                <div className="space-y-3">
                  <label className="block text-[10px] uppercase tracking-widest text-[#91b2a6]">{t("transfers.filter.attributeCount", { count: attributeFilters.length })}</label>
                  {attributeFilters.map((filter) => {
                    const attrInfo = ATTRIBUTES.find(a => a.value === filter.attribute) || ATTRIBUTES[0];
                    return (
                      <div key={filter.id} className="bg-[#001711] p-3 rounded-xl border border-[#2f4e44]/10">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm text-[#a1ffc2]">{attrInfo.icon}</span>
                            <span className="text-[11px] font-bold text-[#d3f5e8]">{attrInfo.label}</span>
                          </div>
                          <button
                            onClick={() => removeAttributeFilter(filter.id)}
                            className="text-[#91b2a6] hover:text-red-400 transition-colors"
                          >
                            <span className="material-symbols-outlined text-sm">close</span>
                          </button>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-[#91b2a6] mb-2">
                          <span>{filter.range.min}</span>
                          <div className="flex-1 h-1 bg-[#002c22] rounded-full relative">
                            <div
                              className="absolute h-full bg-[#a1ffc2] rounded-full"
                              style={{
                                left: `${(filter.range.min / 20) * 100}%`,
                                width: `${((filter.range.max - filter.range.min) / 20) * 100}%`
                              }}
                            />
                            <div
                              className="absolute w-3 h-3 bg-[#a1ffc2] rounded-full -top-1 cursor-pointer"
                              style={{ left: `calc(${(filter.range.min / 20) * 100}% - 6px)` }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const rect = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
                                const startMin = filter.range.min;
                                const maxVal = filter.range.max;

                                const handleMouseMove = (e: MouseEvent) => {
                                  const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
                                  const val = Math.round((x / rect.width) * 20);
                                  const gap = maxVal - val;
                                  if (gap >= 1 && gap <= 5) {
                                    updateAttributeFilterRange(filter.id, val, maxVal);
                                  }
                                };
                                const handleMouseUp = () => {
                                  document.removeEventListener('mousemove', handleMouseMove);
                                  document.removeEventListener('mouseup', handleMouseUp);
                                };
                                document.addEventListener('mousemove', handleMouseMove);
                                document.addEventListener('mouseup', handleMouseUp);
                              }}
                            />
                            <div
                              className="absolute w-3 h-3 bg-[#a1ffc2] rounded-full -top-1 cursor-pointer"
                              style={{ left: `calc(${(filter.range.max / 20) * 100}% - 6px)` }}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const rect = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
                                const minVal = filter.range.min;
                                const startMax = filter.range.max;

                                const handleMouseMove = (e: MouseEvent) => {
                                  const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
                                  const val = Math.round((x / rect.width) * 20);
                                  const gap = val - minVal;
                                  if (gap >= 1 && gap <= 5) {
                                    updateAttributeFilterRange(filter.id, minVal, val);
                                  }
                                };
                                const handleMouseUp = () => {
                                  document.removeEventListener('mousemove', handleMouseMove);
                                  document.removeEventListener('mouseup', handleMouseUp);
                                };
                                document.addEventListener('mousemove', handleMouseMove);
                                document.addEventListener('mouseup', handleMouseUp);
                              }}
                            />
                          </div>
                          <span>{filter.range.max}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add Filter Button */}
              {attributeFilters.length < 3 && (
                <div className="relative">
                  <button
                    className="add-filter-dropdown w-full flex items-center justify-between bg-[#002c22]/50 border border-dashed border-[#2f4e44]/50 rounded-xl py-3 px-4 text-left hover:border-[#a1ffc2]/30 transition-colors"
                    onClick={() => setShowAddFilterDropdown(!showAddFilterDropdown)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-sm text-[#91b2a6]">add</span>
                      <span className="text-xs font-bold text-[#91b2a6]">{t("transfers.filter.addAttributeFilter")}</span>
                    </div>
                    <span className="material-symbols-outlined text-[#91b2a6] text-xl">expand_more</span>
                  </button>
                  {showAddFilterDropdown && (
                    <div className="add-filter-dropdown absolute z-50 mt-2 w-full bg-[#001711] border border-[#2f4e44]/30 rounded-xl overflow-hidden shadow-xl shadow-black/50 max-h-64 overflow-y-auto">
                      {ATTRIBUTES.map((attr) => {
                        const isUsed = attributeFilters.some(f => f.attribute === attr.value);
                        return (
                          <button
                            key={attr.value}
                            disabled={isUsed}
                            className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-[#002c22] transition-colors ${isUsed ? 'opacity-40' : ''}`}
                            onClick={() => !isUsed && addAttributeFilter(attr.value)}
                          >
                            <span className="material-symbols-outlined text-sm text-[#91b2a6]">{attr.icon}</span>
                            <span className={`text-xs font-bold ${isUsed ? 'text-[#91b2a6]' : 'text-[#d3f5e8]'}`}>{attr.label}</span>
                            {isUsed && (
                              <span className="text-[10px] text-[#91b2a6] ml-auto">{t("transfers.filter.alreadyAdded")}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Age Filter */}
              <div className="bg-[#001711] p-4 rounded-xl border border-[#2f4e44]/10">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-[#a1ffc2]">cake</span>
                    <span className="text-[11px] font-bold text-[#a1ffc2]">{t("transfers.filter.ageFilter")}</span>
                  </div>
                  <button
                    onClick={() => setAgeEnabled(!ageEnabled)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${ageEnabled ? 'bg-[#a1ffc2]' : 'bg-[#002c22]'}`}
                  >
                    <div className={`absolute w-4 h-4 rounded-full bg-white top-0.5 transition-transform ${ageEnabled ? 'left-5.5' : 'left-0.5'}`} />
                  </button>
                </div>
                {ageEnabled && (
                  <div className="flex items-center gap-2 text-[10px] text-[#91b2a6]">
                    <span>{ageRange.min}</span>
                    <div className="flex-1 h-1 bg-[#002c22] rounded-full relative">
                      <div
                        className="absolute h-full bg-[#a1ffc2] rounded-full"
                        style={{
                          left: `${((ageRange.min - 15) / 20) * 100}%`,
                          width: `${((ageRange.max - ageRange.min) / 20) * 100}%`
                        }}
                      />
                      <div
                        className="absolute w-3 h-3 bg-[#a1ffc2] rounded-full -top-1 cursor-pointer"
                        style={{ left: `calc(${((ageRange.min - 15) / 20) * 100}% - 6px)` }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const rect = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();

                          const handleMouseMove = (e: MouseEvent) => {
                            const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
                            const val = Math.round((x / rect.width) * 20) + 15;
                            const gap = ageRange.max - val;
                            if (gap >= 1 && gap <= 5 && val >= 15 && val <= 35) {
                              setAgeRange({ min: val, max: ageRange.max });
                            }
                          };
                          const handleMouseUp = () => {
                            document.removeEventListener('mousemove', handleMouseMove);
                            document.removeEventListener('mouseup', handleMouseUp);
                          };
                          document.addEventListener('mousemove', handleMouseMove);
                          document.addEventListener('mouseup', handleMouseUp);
                        }}
                      />
                      <div
                        className="absolute w-3 h-3 bg-[#a1ffc2] rounded-full -top-1 cursor-pointer"
                        style={{ left: `calc(${((ageRange.max - 15) / 20) * 100}% - 6px)` }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const rect = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();

                          const handleMouseMove = (e: MouseEvent) => {
                            const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
                            const val = Math.round((x / rect.width) * 20) + 15;
                            const gap = val - ageRange.min;
                            if (gap >= 1 && gap <= 5 && val >= 15 && val <= 35) {
                              setAgeRange({ min: ageRange.min, max: val });
                            }
                          };
                          const handleMouseUp = () => {
                            document.removeEventListener('mousemove', handleMouseMove);
                            document.removeEventListener('mouseup', handleMouseUp);
                          };
                          document.addEventListener('mousemove', handleMouseMove);
                          document.addEventListener('mouseup', handleMouseUp);
                        }}
                      />
                    </div>
                    <span>{ageRange.max}</span>
                  </div>
                )}
              </div>

              {/* Specialty Filter */}
              <div className="bg-[#001711] p-4 rounded-xl border border-[#2f4e44]/10">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-[#a1ffc2]">emoji_events</span>
                    <span className="text-[11px] font-bold text-[#a1ffc2]">{t("transfers.filter.specialtyFilter")}</span>
                  </div>
                  <button
                    onClick={() => setSpecialtyEnabled(!specialtyEnabled)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${specialtyEnabled ? 'bg-[#a1ffc2]' : 'bg-[#002c22]'}`}
                  >
                    <div className={`absolute w-4 h-4 rounded-full bg-white top-0.5 transition-transform ${specialtyEnabled ? 'left-5.5' : 'left-0.5'}`} />
                  </button>
                </div>
                {specialtyEnabled && (
                  <div className="relative">
                    <button
                      className="specialty-trigger w-full flex items-center justify-between bg-[#002c22] border border-[#2f4e44]/30 rounded-xl py-2.5 px-3 text-left hover:border-[#a1ffc2]/30 transition-colors"
                      onClick={() => document.getElementById('specialty-dropdown')?.classList.toggle('hidden')}
                    >
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-[#a1ffc2]">
                          {selectedSpecialty ? (SPECIALTIES.find(s => s.value === selectedSpecialty)?.icon || 'emoji_events') : 'all_inclusive'}
                        </span>
                        <span className="text-xs font-bold text-[#d3f5e8]">
                          {selectedSpecialty ? SPECIALTIES.find(s => s.value === selectedSpecialty)?.label : t("transfers.filters.any")}
                        </span>
                      </div>
                      <span className="material-symbols-outlined text-[#91b2a6] text-xl">expand_more</span>
                    </button>
                    <div id="specialty-dropdown" className="hidden absolute z-50 mt-2 w-full bg-[#001711] border border-[#2f4e44]/30 rounded-xl overflow-hidden shadow-xl shadow-black/50 max-h-48 overflow-y-auto">
                      <button
                        className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-[#002c22] transition-colors ${!selectedSpecialty ? 'bg-[#002c22]' : ''}`}
                        onClick={() => {
                          setSelectedSpecialty("");
                          document.getElementById('specialty-dropdown')?.classList.add('hidden');
                        }}
                      >
                        <span className="material-symbols-outlined text-sm text-[#91b2a6]">all_inclusive</span>
                        <span className={`text-xs font-bold ${!selectedSpecialty ? 'text-[#a1ffc2]' : 'text-[#d3f5e8]'}`}>{t("transfers.filters.any")}</span>
                        {!selectedSpecialty && <span className="material-symbols-outlined text-[#a1ffc2] text-sm ml-auto">check</span>}
                      </button>
                      {SPECIALTIES.map((spec) => (
                        <button
                          key={spec.value}
                          className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-[#002c22] transition-colors ${selectedSpecialty === spec.value ? 'bg-[#002c22]' : ''}`}
                          onClick={() => {
                            setSelectedSpecialty(spec.value);
                            document.getElementById('specialty-dropdown')?.classList.add('hidden');
                          }}
                        >
                          <span className="material-symbols-outlined text-sm text-[#91b2a6]">{spec.icon}</span>
                          <span className={`text-xs font-bold ${selectedSpecialty === spec.value ? 'text-[#a1ffc2]' : 'text-[#d3f5e8]'}`}>{spec.label}</span>
                          {selectedSpecialty === spec.value && <span className="material-symbols-outlined text-[#a1ffc2] text-sm ml-auto">check</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Reset Button */}
              <button
                className="w-full py-3 bg-[#002c22] text-[#a1ffc2] font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-[#003328] transition-colors border border-[#a1ffc2]/10"
                onClick={resetAllFilters}
              >
                {t("transfers.filters.resetAllFilters")}
              </button>
            </div>
          </aside>

          {/* Center: Results List */}
          <section className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-[#00140e]">
            <div className="flex justify-between items-end mb-8">
              <div>
                <h1 className="text-4xl font-bold text-[#d3f5e8] tracking-tighter">{t("transfers.scoutedCandidates")}</h1>
                <p className="text-sm text-[#91b2a6] mt-1">{t("transfers.showingProfiles", { count: filteredTransfers.length })}</p>
              </div>
            </div>

            {/* Error State */}
            {error && (
              <div className="flex flex-col items-center justify-center py-16">
                <span className="material-symbols-outlined text-5xl text-red-400 mb-4">error_outline</span>
                <p className="text-[#d3f5e8] font-bold mb-2">{t("transfers.error.failedToLoad")}</p>
                <p className="text-[#91b2a6] text-sm mb-4">{error}</p>
                <button
                  onClick={fetchTransfers}
                  className="px-4 py-2 bg-[#002c22] text-[#a1ffc2] font-bold text-xs rounded-xl hover:bg-[#003328] transition-colors"
                >
                  {t("transfers.error.retry")}
                </button>
              </div>
            )}

            {/* Loading State */}
            {isLoading && !error && <TransferListSkeleton />}

            {/* Player List */}
            {!isLoading && !error && filteredTransfers.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16">
                <span className="material-symbols-outlined text-5xl text-[#91b2a6] mb-4">search_off</span>
                <p className="text-[#d3f5e8] font-bold mb-2">{t("transfers.empty.noResults")}</p>
                <p className="text-[#91b2a6] text-sm mb-4">{t("transfers.empty.adjustFilters")}</p>
                <button
                  onClick={resetAllFilters}
                  className="px-4 py-2 bg-[#002c22] text-[#a1ffc2] font-bold text-xs rounded-xl hover:bg-[#003328] transition-colors"
                >
                  {t("transfers.empty.resetFilters")}
                </button>
              </div>
            )}

            {!isLoading && !error && filteredTransfers.length > 0 && (
              <div className="space-y-3">
                {filteredTransfers.map((transfer) => {
                  const isSelected = selectedTransfer?.id === transfer.id;
                  const initials = transfer.player.name.split(" ").map((n) => n[0]).join("").slice(0, 2);
                  const timeLeft = formatTimeRemaining(transfer.expiresAt);
                  const isExpired = timeLeft === "Expired";
                  const player = transfer.player;
                  const skills = player.currentSkills as any;
                  const isGK = player.isGoalkeeper;

                  return (
                    <div
                      key={transfer.id}
                      onClick={() => setSelectedTransfer(transfer)}
                      className={`bg-[#001711] rounded-2xl p-5 cursor-pointer transition-all border ${
                        isSelected
                          ? "border-[#a1ffc2] ring-1 ring-[#a1ffc2]/30"
                          : "border-[#2f4e44]/20 hover:border-[#2f4e44]/40 hover:bg-[#001e17]"
                      }`}
                    >
                      {/* Header */}
                      <div className="flex items-center gap-6 mb-5">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#002c22] to-[#001711] flex items-center justify-center font-bold text-2xl text-[#a1ffc2] border border-[#2f4e44]/30">
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className={`font-bold text-xl truncate ${isSelected ? "text-[#a1ffc2]" : "text-[#d3f5e8]"}`}>
                            {player.name}
                          </h3>
                          <p className="text-sm text-[#91b2a6]">
                            {player.age}岁{player.ageDays || 0}天 · {player.teamName || transfer.team.name} · £{(player.currentWage || 0).toLocaleString()}/w
                          </p>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-center">
                            <p className="text-[10px] text-[#91b2a6] uppercase tracking-wider mb-1">{t("squad.age")}</p>
                            <p className="font-bold text-lg text-[#d3f5e8]">{player.age}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-[#91b2a6] uppercase tracking-wider mb-1">{t("squad.stamina")}</p>
                            <p className="font-bold text-lg text-[#abf853]">{player.stamina || 85}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-[#91b2a6] uppercase tracking-wider mb-1">{t("squad.form")}</p>
                            <p className="font-bold text-lg text-[#f59e0b]">{player.form || 7.0}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-[#91b2a6] uppercase tracking-wider mb-1">{t("squad.exp")}</p>
                            <p className="font-bold text-lg text-[#d3f5e8]">{player.experience || 0}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-[#91b2a6] uppercase tracking-wider mb-1">{t("transfers.table.value")}</p>
                          <p className="font-bold text-xl text-[#d3f5e8]">{formatCurrency(transfer.currentPrice)}</p>
                          <span className={`text-[11px] font-bold px-2 py-1 rounded-md mt-1 inline-block ${
                            isExpired ? "bg-red-500/20 text-red-400" : "bg-[#002c22] text-[#91b2a6]"
                          }`}>
                            {timeLeft}
                          </span>
                        </div>
                      </div>

                      {/* Specialties */}
                      {player.specialties && player.specialties.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-5">
                          {player.specialties.map((spec, idx) => (
                            <span key={idx} className="bg-[#a1ffc2]/10 text-[#a1ffc2] text-[10px] px-3 py-1.5 rounded-lg border border-[#a1ffc2]/20 uppercase tracking-wider">
                              {spec}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Skills - Profile Style */}
                      <div className="grid grid-cols-4 gap-6">
                        {/* Technical */}
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-1.5 h-4 bg-[#a1ffc2] rounded-full" />
                            <h3 className="text-xs font-black tracking-widest uppercase text-[#91b2a6]">{t("transfers.detail.technical")}</h3>
                          </div>
                          <div className="space-y-2">
                            {isGK ? (
                              <>
                                {renderSkillBar(t("squad.skills.reflexes"), skills?.technical?.reflexes || 0, 20, "text-[#a1ffc2]")}
                                {renderSkillBar(t("squad.skills.handling"), skills?.technical?.handling || 0, 20, "text-[#a1ffc2]")}
                                {renderSkillBar(t("squad.skills.aerial"), skills?.technical?.aerial || 0, 20, "text-[#a1ffc2]")}
                              </>
                            ) : (
                              <>
                                {renderSkillBar(t("squad.skills.finishing"), skills?.technical?.finishing || 0, 20, "text-[#a1ffc2]")}
                                {renderSkillBar(t("squad.skills.passing"), skills?.technical?.passing || 0, 20, "text-[#a1ffc2]")}
                                {renderSkillBar(t("squad.skills.dribbling"), skills?.technical?.dribbling || 0, 20, "text-[#a1ffc2]")}
                                {renderSkillBar(t("squad.skills.defending"), skills?.technical?.defending || 0, 20, "text-[#a1ffc2]")}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Physical */}
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-1.5 h-4 bg-[#abf853] rounded-full" />
                            <h3 className="text-xs font-black tracking-widest uppercase text-[#91b2a6]">{t("transfers.detail.physical")}</h3>
                          </div>
                          <div className="space-y-2">
                            {renderSkillBar(t("squad.skills.pace"), skills?.physical?.pace || 0, 20, "text-[#abf853]")}
                            {renderSkillBar(t("squad.skills.strength"), skills?.physical?.strength || 0, 20, "text-[#abf853]")}
                          </div>
                        </div>

                        {/* Mental */}
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-1.5 h-4 bg-[#f59e0b] rounded-full" />
                            <h3 className="text-xs font-black tracking-widest uppercase text-[#91b2a6]">{t("transfers.detail.mental")}</h3>
                          </div>
                          <div className="space-y-2">
                            {renderSkillBar(t("squad.skills.composure"), skills?.mental?.composure || 0, 20, "text-[#f59e0b]")}
                            {renderSkillBar(t("squad.skills.positioning"), skills?.mental?.positioning || 0, 20, "text-[#f59e0b]")}
                          </div>
                        </div>

                        {/* Set Pieces */}
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-1.5 h-4 bg-[#ec4899] rounded-full" />
                            <h3 className="text-xs font-black tracking-widest uppercase text-[#91b2a6]">{t("squad.skills.setPieces")}</h3>
                          </div>
                          <div className="space-y-2">
                            {renderSkillBar(t("squad.skills.freeKicks"), skills?.setPieces?.freeKicks || 0, 20, "text-[#ec4899]")}
                            {renderSkillBar(t("squad.skills.penalties"), skills?.setPieces?.penalties || 0, 20, "text-[#ec4899]")}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Right Panel: Player Details */}
          <aside className="w-[420px] h-full bg-[#00251c] border-l border-[#2f4e44]/10 flex flex-col">
            {isLoading ? (
              <PlayerDetailSkeleton />
            ) : !selectedTransfer ? (
              <div className="flex-grow flex items-center justify-center">
                <p className="text-[#91b2a6] text-sm">{t("squad.selectPlayer")}</p>
              </div>
            ) : (
              <>
                <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                  {/* Header Image */}
                  <div className="relative h-56 rounded-2xl overflow-hidden mb-6 group">
                    <div className="w-full h-full bg-gradient-to-br from-[#a1ffc2]/20 to-[#00251c]" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#00251c] via-transparent to-black/20" />
                    <div className={`absolute top-4 right-4 px-3 py-1.5 rounded-lg flex items-center gap-2 ${
                      formatTimeRemaining(selectedTransfer.expiresAt) === "Expired"
                        ? "bg-red-500/80"
                        : "bg-[#00251c]/80 backdrop-blur-md"
                    }`}>
                      <span className="material-symbols-outlined text-xs text-[#ef4444]">timer</span>
                      <span className="text-[10px] font-bold text-white uppercase tracking-wider">{formatTimeRemaining(selectedTransfer.expiresAt)}</span>
                    </div>
                    <div className="absolute bottom-4 left-4">
                      <h3 className="text-3xl font-bold text-white tracking-tighter">{selectedTransfer.player.name}</h3>
                      <p className="text-[#91b2a6] text-xs">
                        {selectedTransfer.player.age}岁{selectedTransfer.player.ageDays || 0}天 · {selectedTransfer.player.teamName || selectedTransfer.team.name} · £{(selectedTransfer.player.currentWage || 0).toLocaleString()}/w
                      </p>
                    </div>
                  </div>

                  {/* Pricing & Actions */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-[#002c22] p-4 rounded-2xl border border-[#2f4e44]/10">
                      <p className="text-[10px] text-[#91b2a6] uppercase tracking-widest mb-1">{t("transfers.detail.currentPrice")}</p>
                      <p className="text-2xl font-bold text-[#a1ffc2] truncate">{formatCurrency(selectedTransfer.currentPrice)}</p>
                    </div>
                    <div className="bg-[#002c22] p-4 rounded-2xl border border-[#2f4e44]/10">
                      <p className="text-[10px] text-[#91b2a6] uppercase tracking-widest mb-1">{t("transfers.detail.buyout")}</p>
                      <p className="text-xl font-bold text-[#d3f5e8] mb-2 truncate">{formatCurrency(selectedTransfer.buyoutPrice)}</p>
                      <button
                        onClick={() => setShowBuyoutConfirm(true)}
                        className="w-full py-2 bg-[#a1ffc2] text-[#00110c] font-bold text-[10px] rounded-lg uppercase tracking-widest hover:brightness-110 transition-all"
                      >
                        {t("transfers.buyout.directBuyout")}
                      </button>
                    </div>
                  </div>

                  {/* Attribute Section */}
                  <section className="space-y-6">
                    <div className="flex items-center gap-2 mb-4 border-b border-[#2f4e44]/10 pb-2">
                      <span className="material-symbols-outlined text-[#a1ffc2] text-sm">analytics</span>
                      <h4 className="text-[10px] uppercase tracking-widest text-[#91b2a6] font-bold">{t("transfers.detail.profile")}</h4>
                    </div>

                    <div className="grid grid-cols-2 gap-10">
                      {/* Technical & Physical */}
                      <div className="space-y-8">
                        {/* Technical */}
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-1.5 h-4 bg-[#a1ffc2] rounded-full" />
                            <h3 className="text-xs font-black font-space tracking-widest uppercase text-[#91b2a6]">{t("transfers.detail.technical")}</h3>
                          </div>
                          <div className="space-y-3">
                            {selectedTransfer.player.isGoalkeeper ? (
                              <>
                                {renderSkillBar(t("squad.skills.reflexes"), (selectedTransfer.player.currentSkills as any)?.technical?.reflexes || 0, (selectedTransfer.player.potentialSkills as any)?.technical?.reflexes || 0, "text-[#a1ffc2]")}
                                {renderSkillBar(t("squad.skills.handling"), (selectedTransfer.player.currentSkills as any)?.technical?.handling || 0, (selectedTransfer.player.potentialSkills as any)?.technical?.handling || 0, "text-[#a1ffc2]")}
                                {renderSkillBar(t("squad.skills.aerial"), (selectedTransfer.player.currentSkills as any)?.technical?.aerial || 0, (selectedTransfer.player.potentialSkills as any)?.technical?.aerial || 0, "text-[#a1ffc2]")}
                              </>
                            ) : (
                              <>
                                {renderSkillBar(t("squad.skills.finishing"), (selectedTransfer.player.currentSkills as any)?.technical?.finishing || 0, (selectedTransfer.player.potentialSkills as any)?.technical?.finishing || 0, "text-[#a1ffc2]")}
                                {renderSkillBar(t("squad.skills.passing"), (selectedTransfer.player.currentSkills as any)?.technical?.passing || 0, (selectedTransfer.player.potentialSkills as any)?.technical?.passing || 0, "text-[#a1ffc2]")}
                                {renderSkillBar(t("squad.skills.dribbling"), (selectedTransfer.player.currentSkills as any)?.technical?.dribbling || 0, (selectedTransfer.player.potentialSkills as any)?.technical?.dribbling || 0, "text-[#a1ffc2]")}
                                {renderSkillBar(t("squad.skills.defending"), (selectedTransfer.player.currentSkills as any)?.technical?.defending || 0, (selectedTransfer.player.potentialSkills as any)?.technical?.defending || 0, "text-[#a1ffc2]")}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Physical */}
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-1.5 h-4 bg-[#abf853] rounded-full" />
                            <h3 className="text-xs font-black font-space tracking-widest uppercase text-[#91b2a6]">{t("transfers.detail.physical")}</h3>
                          </div>
                          <div className="space-y-3">
                            {renderSkillBar(t("squad.skills.pace"), (selectedTransfer.player.currentSkills as any)?.physical?.pace || 0, (selectedTransfer.player.potentialSkills as any)?.physical?.pace || 0, "text-[#abf853]")}
                            {renderSkillBar(t("squad.skills.strength"), (selectedTransfer.player.currentSkills as any)?.physical?.strength || 0, (selectedTransfer.player.potentialSkills as any)?.physical?.strength || 0, "text-[#abf853]")}
                          </div>
                        </div>
                      </div>

                      {/* Mental & Set Pieces */}
                      <div className="space-y-8">
                        {/* Mental */}
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-1.5 h-4 bg-[#f59e0b] rounded-full" />
                            <h3 className="text-xs font-black font-space tracking-widest uppercase text-[#91b2a6]">{t("transfers.detail.mental")}</h3>
                          </div>
                          <div className="space-y-3">
                            {renderSkillBar(t("squad.skills.composure"), (selectedTransfer.player.currentSkills as any)?.mental?.composure || 0, (selectedTransfer.player.potentialSkills as any)?.mental?.composure || 0, "text-[#f59e0b]")}
                            {renderSkillBar(t("squad.skills.positioning"), (selectedTransfer.player.currentSkills as any)?.mental?.positioning || 0, (selectedTransfer.player.potentialSkills as any)?.mental?.positioning || 0, "text-[#f59e0b]")}
                          </div>
                        </div>

                        {/* Set Pieces */}
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-1.5 h-4 bg-[#ec4899] rounded-full" />
                            <h3 className="text-xs font-black font-space tracking-widest uppercase text-[#91b2a6]">{t("squad.skills.setPieces")}</h3>
                          </div>
                          <div className="space-y-3">
                            {renderSkillBar(t("squad.skills.freeKicks"), (selectedTransfer.player.currentSkills as any)?.setPieces?.freeKicks || 0, (selectedTransfer.player.potentialSkills as any)?.setPieces?.freeKicks || 0, "text-[#ec4899]")}
                            {renderSkillBar(t("squad.skills.penalties"), (selectedTransfer.player.currentSkills as any)?.setPieces?.penalties || 0, (selectedTransfer.player.potentialSkills as any)?.setPieces?.penalties || 0, "text-[#ec4899]")}
                          </div>
                        </div>
                      </div>

                      {/* Bid History */}
                      {selectedTransfer.bidHistory && selectedTransfer.bidHistory.length > 0 && (
                        <div className="mt-0 pt-4 border-t border-[#2f4e44]/10">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-[#a1ffc2] text-sm">gavel</span>
                              <h4 className="text-[10px] uppercase tracking-widest text-[#91b2a6] font-bold">{t("transfers.bidHistory")}</h4>
                            </div>
                            {selectedTransfer.bidHistory.length > 3 && (
                              <button
                                onClick={() => setShowBidHistoryModal(true)}
                                className="text-[10px] text-[#91b2a6] hover:text-[#a1ffc2] transition-colors flex items-center gap-1"
                              >
                                <span>more</span>
                                <span className="material-symbols-outlined text-sm">navigate_next</span>
                              </button>
                            )}
                          </div>
                          <div className="divide-y divide-[#2f4e44]/20">
                            {selectedTransfer.bidHistory.slice().reverse().slice(0, 3).map((bid, idx) => (
                              <div key={idx} className="flex items-center justify-between py-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#a1ffc2]/30 to-[#002c22] flex items-center justify-center">
                                    <span className="text-[9px] font-bold text-[#a1ffc2]">{(bid.teamName || '?').charAt(0)}</span>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-semibold text-[#d3f5e8]">{bid.teamName || 'Unknown'}</p>
                                    <p className="text-[9px] text-[#91b2a6]">{formatBidTime(bid.timestamp)}</p>
                                  </div>
                                </div>
                                <p className="text-[12px] font-bold text-[#a1ffc2]">{formatCurrency(bid.amount)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                </div>

                {/* Bid Input */}
                <div className="p-6 bg-[#001e17] border-t border-[#2f4e44]/10">
                  <div className="flex gap-3 items-center">
                    <div className="flex-1 relative">
                      <label className="absolute -top-2 left-3 px-1 bg-[#001e17] text-[8px] text-[#00ec90] font-bold uppercase tracking-widest z-10">
                        {t("transfers.detail.offerPrice")}
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#a1ffc2] font-bold text-sm">£</span>
                        <input
                          className="w-full bg-[#002c22] border border-[#2f4e44]/30 rounded-xl py-3 pl-8 pr-4 text-sm font-bold text-[#d3f5e8] focus:ring-1 focus:ring-[#a1ffc2] focus:border-[#a1ffc2] transition-all placeholder:text-[#91b2a6]/40"
                          placeholder={t("transfers.detail.offerPlaceholder")}
                          type="text"
                          value={formatBidAmountInput(bidAmount)}
                          onChange={(e) => setBidAmount(e.target.value.replace(/,/g, '').replace(/[^0-9]/g, ''))}
                        />
                      </div>
                    </div>
                    <button
                      className="px-6 py-3.5 bg-[#a1ffc2] text-[#00110c] font-bold rounded-xl flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-[#a1ffc2]/20 uppercase tracking-widest text-[10px] whitespace-nowrap disabled:opacity-50"
                      onClick={async () => {
                        if (!selectedTransfer || !bidAmount || !team) return;
                        const amount = parseInt(bidAmount.replace(/,/g, ""));
                        if (isNaN(amount) || amount <= 0) return;
                        setIsSubmittingBid(true);
                        try {
                          await api.transfers.placeBid(selectedTransfer.id, amount);
                          setNotification({ type: 'success', message: `Offer submitted: £${amount.toLocaleString()} for ${selectedTransfer.player.name}` });
                          setBidAmount("");
                          const freshData = await fetchTransfers();
                          const updated = freshData.find(t => t.id === selectedTransfer.id);
                          if (updated) setSelectedTransfer(updated);
                        } catch (error) {
                          setNotification({ type: 'error', message: error instanceof Error ? error.message : "Failed to submit offer" });
                        } finally {
                          setIsSubmittingBid(false);
                        }
                      }}
                      disabled={!bidAmount || isSubmittingBid}
                    >
                      <span className="material-symbols-outlined text-sm">payments</span>
                      {t("transfers.detail.makeOffer")}
                    </button>
                  </div>
                </div>
              </>
            )}
          </aside>
        </div>
      </main>

      {/* Buyout Confirmation Modal */}
      {showBuyoutConfirm && selectedTransfer && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#001e17]/90 backdrop-blur-xl rounded-2xl overflow-hidden shadow-2xl border border-[#a1ffc2]/20 w-full max-w-md">
            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-[#002c22] flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-3xl text-[#a1ffc2]">warning</span>
              </div>
              <h3 className="text-xl font-bold text-[#d3f5e8] mb-2">{t("transfers.buyout.confirmTitle")}</h3>
              <p className="text-[#91b2a6] text-sm mb-6">
                {t("transfers.buyout.confirmMessage", { playerName: selectedTransfer.player.name, price: formatCurrency(selectedTransfer.buyoutPrice) })}
              </p>
              <div className="flex gap-4">
                <button
                  className="flex-1 py-3 bg-[#002c22] text-[#d3f5e8] font-bold rounded-xl hover:bg-[#003328] transition-all uppercase tracking-widest text-xs"
                  onClick={() => setShowBuyoutConfirm(false)}
                >
                  {t("transfers.buyout.cancel")}
                </button>
                <button
                  className="flex-1 py-3 bg-[#ef4444] text-white font-bold rounded-xl hover:bg-red-600 transition-all uppercase tracking-widest text-xs"
                  onClick={async () => {
                    try {
                      await api.transfers.buyout(selectedTransfer.id);
                      setNotification({ type: 'success', message: `${selectedTransfer.player.name} ${t("transfers.buyout.buyoutSuccess")}` });
                      setShowBuyoutConfirm(false);
                      const freshData = await fetchTransfers();
                      const updated = freshData.find(t => t.id === selectedTransfer.id);
                      if (updated) setSelectedTransfer(updated);
                    } catch (error) {
                      setNotification({ type: 'error', message: error instanceof Error ? error.message : t("transfers.buyout.buyoutFailed") });
                    }
                  }}
                >
                  {t("transfers.buyout.confirm")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bid History Full Modal */}
      {showBidHistoryModal && selectedTransfer && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#001e17]/90 backdrop-blur-xl rounded-2xl overflow-hidden shadow-2xl border border-[#a1ffc2]/20 w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#a1ffc2] text-lg">gavel</span>
                  <h3 className="text-lg font-bold text-[#d3f5e8]">{t("transfers.bidHistory")}</h3>
                </div>
                <button
                  className="material-symbols-outlined text-[#91b2a6] hover:text-[#d3f5e8] transition-colors"
                  onClick={() => setShowBidHistoryModal(false)}
                >
                  close
                </button>
              </div>
              <div className="space-y-3">
                {selectedTransfer.bidHistory.slice().reverse().map((bid, idx) => (
                  <div key={idx} className="flex items-center justify-between py-3 border-b border-[#2f4e44]/20 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#a1ffc2]/30 to-[#002c22] flex items-center justify-center">
                        <span className="text-[10px] font-bold text-[#a1ffc2]">{(bid.teamName || '?').charAt(0)}</span>
                      </div>
                      <div>
                        <p className="text-[12px] font-semibold text-[#d3f5e8]">{bid.teamName || 'Unknown'}</p>
                        <p className="text-[10px] text-[#91b2a6]">{formatBidTime(bid.timestamp)}</p>
                      </div>
                    </div>
                    <p className="text-[14px] font-bold text-[#a1ffc2]">{formatCurrency(bid.amount)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
