"use client";

import { AppIcon } from "@/components/icons/AppIcon";
import { useTranslations, useLocale } from "next-intl";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { api, type Player, type TransferAuction } from "@/lib/api";
import TransferListSkeleton from "@/components/transfers/TransferListSkeleton";
import PlayerDetailSkeleton from "@/components/transfers/PlayerDetailSkeleton";
import TransferPlayerCard from "@/components/transfers/TransferPlayerCard";
import { SpecialtyIcon } from "@/components/player/SpecialtyIcon";
import { barClassFor } from "@/components/player/skill-display";

type TransferPlayer = Player;

export default function TransfersPage() {
  const t = useTranslations();
  const locale = useLocale();
  const params = useParams();
  const { user, team } = useAuth();
  const [transfers, setTransfers] = useState<TransferAuction[]>([]);
  const [selectedTransfer, setSelectedTransfer] = useState<TransferAuction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [isSubmittingBid, setIsSubmittingBid] = useState(false);
  const [showBidHistoryModal, setShowBidHistoryModal] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filter states
  const [attributeFilters, setAttributeFilters] = useState<Array<{ id: string; attribute: string; range: { min: number; max: number } }>>([]);
  const [showAddFilterDropdown, setShowAddFilterDropdown] = useState(false);
  const [ageEnabled, setAgeEnabled] = useState(false);
  const [ageRange, setAgeRange] = useState({ min: 20, max: 25 });
  const [specialtyEnabled, setSpecialtyEnabled] = useState(false);
  const [showSpecialtyDropdown, setShowSpecialtyDropdown] = useState(false);
  const [selectedSpecialty, setSelectedSpecialty] = useState("");
  const [playerTypeFilter, setPlayerTypeFilter] = useState<"outfield" | "gk">("outfield");

  // Auto-select the first auction exactly once. A ref (not state) is
  // the right tool here because the rule is "select-once-per-mount",
  // not "select when the list becomes non-empty" — without the ref
  // we'd need `selectedTransfer` in `fetchTransfers`'s deps, and
  // every selection change would re-fetch the entire market.
  const hasAutoSelectedRef = useRef(false);

  // useMemo on t() — t is stable in next-intl, but using useMemo
  // documents that these arrays only change when the i18n function
  // does (i.e. never) and avoids re-allocating on every render.
  const OUTFIELD_ATTRIBUTES = useMemo(() => [
    { value: "pace", label: t("squad.skills.pace"), icon: "directions_run" },
    { value: "strength", label: t("squad.skills.strength"), icon: "fitness_center" },
    { value: "finishing", label: t("squad.skills.finishing"), icon: "sports_soccer" },
    { value: "dribbling", label: t("squad.skills.dribbling"), icon: "sports_basketball" },
    { value: "passing", label: t("squad.skills.passing"), icon: "swap_horiz" },
    { value: "defending", label: t("squad.skills.defending"), icon: "shield" },
    { value: "composure", label: t("squad.skills.composure"), icon: "psychology" },
    { value: "positioning", label: t("squad.skills.positioning"), icon: "place_item" },
    { value: "freeKicks", label: t("squad.skills.freeKicks"), icon: "sports" },
    { value: "penalties", label: t("squad.skills.penalties"), icon: "flag" },
  ] as const, [t]);

  const GK_ATTRIBUTES = useMemo(() => [
    { value: "reflexes", label: t("squad.skills.reflexes"), icon: "pan_tool" },
    { value: "handling", label: t("squad.skills.handling"), icon: "back_hand" },
    { value: "aerial", label: t("squad.skills.aerial"), icon: "sports" },
    { value: "pace", label: t("squad.skills.pace"), icon: "directions_run" },
    { value: "strength", label: t("squad.skills.strength"), icon: "fitness_center" },
    { value: "positioning", label: t("squad.skills.positioning"), icon: "place_item" },
    { value: "composure", label: t("squad.skills.composure"), icon: "psychology" },
    { value: "freeKicks", label: t("squad.skills.freeKicks"), icon: "sports" },
    { value: "penalties", label: t("squad.skills.penalties"), icon: "flag" },
  ] as const, [t]);

  const ATTRIBUTES = playerTypeFilter === "gk" ? GK_ATTRIBUTES : OUTFIELD_ATTRIBUTES;

  // v2 specialty filter list — uses the 12 active codes, all of
  // which have pentagon SVG icons under `/specialties/`. The legacy
  // v1 codes (HEADER/LPASS/...) are no longer in the filter because
  // they're deprecated and never produced by the new generator.
  const SPECIALTIES = useMemo(() => [
    { value: "AERIAL_THREAT",  label: t("transfers.specialties.AERIAL_THREAT") },
    { value: "DRIBBLER",       label: t("transfers.specialties.DRIBBLER") },
    { value: "PLAYMAKER",      label: t("transfers.specialties.PLAYMAKER") },
    { value: "TACKLER",        label: t("transfers.specialties.TACKLER") },
    { value: "WALL",           label: t("transfers.specialties.WALL") },
    { value: "SPEEDSTER",      label: t("transfers.specialties.SPEEDSTER") },
    { value: "CROSSER",        label: t("transfers.specialties.CROSSER") },
    { value: "POACHER",        label: t("transfers.specialties.POACHER") },
    { value: "COMPOSED",       label: t("transfers.specialties.COMPOSED") },
    { value: "PHYSICAL_BEAST", label: t("transfers.specialties.PHYSICAL_BEAST") },
    { value: "SAVING_MASTER",  label: t("transfers.specialties.SAVING_MASTER") },
    { value: "SWEEPER_KEEPER", label: t("transfers.specialties.SWEEPER_KEEPER") },
  ] as const, [t]);

  const EXPIRED_LABEL = t("transfers.expired");

  // Close dropdown when clicking outside. Both dropdowns now live
  // in React state — we no longer reach into the DOM to toggle
  // `.hidden`, which was an SSR/hydration landmine.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.add-filter-dropdown')) {
        setShowAddFilterDropdown(false);
      }
      if (!target.closest('#specialty-dropdown') && !target.closest('.specialty-trigger')) {
        setShowSpecialtyDropdown(false);
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
    if (attr === "age") return player.age;
    if (attr === "overall") return player.overall;
    const skill = player.currentSkills;
    return (
      skill.physical?.[attr] ??
      skill.technical?.[attr] ??
      skill.mental?.[attr] ??
      skill.setPieces?.[attr] ??
      0
    );
  };

  // Fetch transfers data. `selectedTransfer` is intentionally NOT in
  // the deps — including it would re-fetch the entire market on
  // every card click. Auto-select is gated by `hasAutoSelectedRef`
  // so the "pick the first auction" rule fires exactly once per
  // mount instead of every time the user changes their selection.
  const fetchTransfers = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);
      setError(null);
      try {
        const auctionsData = await api.transfers.getAuctions({ signal });
        setTransfers(auctionsData);
        if (auctionsData.length > 0 && !hasAutoSelectedRef.current) {
          hasAutoSelectedRef.current = true;
          setSelectedTransfer(auctionsData[0]);
        }
        return auctionsData;
      } catch (err) {
        // AbortError fires when the effect cleans up; not a real
        // failure, don't toast it.
        if (err instanceof DOMException && err.name === "AbortError") return [];
        setError(err instanceof Error ? err.message : t("transfers.error.failedToLoad"));
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [user, team, t],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchTransfers(controller.signal);
    return () => controller.abort();
  }, [fetchTransfers]);

  const filteredTransfers = useMemo(() => transfers.filter((t) => {
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
    // Specialty filter — v2: `coreSpecialty` is a single string
    // (50% of players have null coreSpecialty), not an array.
    // Compare directly against the filter selection.
    if (specialtyEnabled && selectedSpecialty) {
      if (t.player.coreSpecialty !== selectedSpecialty) {
        return false;
      }
    }
    return true;
  }), [transfers, attributeFilters, ageEnabled, ageRange, specialtyEnabled, selectedSpecialty]);

  const formatCurrency = (value: number) => {
    return `${t("common.currencySymbol")}${value.toLocaleString()}`;
  };

  const formatTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();

    if (diff <= 0) return EXPIRED_LABEL;

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
      return date.toLocaleDateString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
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

  // Skill-bar colors must match the player detail page
  // (web/src/app/[locale]/players/[id]/page.tsx):
  //   - technical / GK  = #a1ffc2
  //   - physical        = #60a5fa
  //   - mental          = #abf853
  //   - set pieces      = #f59e0b
  // If you change one here, change the other too.
  const renderSkillBar = (label: string, current: number, potential: number, colorClass: string) => {
    const percentage = (current / SKILL_MAX) * 100;
    return (
      <div className="space-y-1.5">
        <div className="flex justify-between text-kicker font-bold uppercase tracking-wider text-on-surface-variant">
          <span>{label}</span>
          <span className={colorClass}>{current}/{potential}</span>
        </div>
        <div className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
          <div className={`h-full ${barClassFor(colorClass)} rounded-full`} style={{ width: `${percentage}%` }} />
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Notification Toast */}
      {notification && (
        <div className="fixed top-5 right-5 z-[200] flex flex-col">
          <div className={`
            relative overflow-hidden rounded-2xl border backdrop-blur-2xl
            ${notification.type === 'success'
              ? 'bg-surface-container-high/95 border-accent/30 shadow-[0_0_30px_rgba(161,255,194,0.15)]'
              : 'bg-danger-surface/95 border-danger/30 shadow-[0_0_30px_rgba(255,100,100,0.1)]'
            }
          `}>
            {/* Accent line */}
            <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${
              notification.type === 'success' ? 'bg-accent' : 'bg-danger'
            }`} />

            {/* Content */}
            <div className="flex items-center gap-4 px-5 py-4 pl-6">
              <div className={`
                w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                ${notification.type === 'success'
                  ? 'bg-accent/10 text-accent'
                  : 'bg-danger/10 text-red-400'
                }
              `}>
                <AppIcon name={notification.type === 'success' ? 'check_circle' : 'error'} className="text-xl" />
              </div>

              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${
                  notification.type === 'success' ? 'text-frost' : 'text-red-200'
                }`}>
                  {notification.message}
                </p>
              </div>

              <button
                onClick={() => setNotification(null)}
                className={`
                  w-8 h-8 rounded-lg flex items-center justify-center shrink-0
                  transition-all duration-base hover:scale-110
                  ${notification.type === 'success'
                    ? 'text-on-surface-variant hover:text-frost hover:bg-accent/10'
                    : 'text-red-400/60 hover:text-red-300 hover:bg-danger/10'
                  }
                `}
              >
                <AppIcon name="close" className="text-lg" />
              </button>
            </div>

            {/* Auto-dismiss progress bar */}
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-black/20">
              <div
                className={`h-full animate-[shrink_5s_linear_forwards] ${
                  notification.type === 'success'
                    ? 'bg-accent'
                    : 'bg-danger'
                }`}
                style={{
                  animation: 'shrink 5s linear forwards',
                }}
              />
            </div>
          </div>
        </div>
      )}
      <style jsx>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>

      {/* Main Content - Market */}
      <div className="mx-auto w-full max-w-[1480px] p-4 md:p-6">
        <header className="mb-gutter flex flex-wrap items-end justify-between gap-tight">
          <div className="min-w-0">
            <p className="font-label text-kicker font-bold uppercase tracking-[0.14em] text-primary">
              {t("transfers.title")}
            </p>
            <h1 className="mt-1 font-headline text-2xl font-black tracking-tight text-on-surface">
              {t("transfers.scoutedCandidates")}
            </h1>
            <p className="mt-1 font-label text-label text-on-surface-variant">
              {t("transfers.showingProfiles", { count: filteredTransfers.length })}
            </p>
          </div>
        </header>

        <div className="flex flex-col gap-gutter lg:flex-row lg:items-start">
          {/* Left Panel: Filters */}
          <aside className="glass-panel w-full shrink-0 rounded-2xl p-panel lg:sticky lg:top-4 lg:max-h-[calc(100dvh-140px)] lg:w-[284px] lg:overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-bold text-accent tracking-tight text-xs uppercase">{t("transfers.filters.scoutingFilters")}</h2>
              <AppIcon name="filter_list" className="text-sm text-on-surface-variant cursor-pointer" />
            </div>

            <div className="space-y-6">
              {/* Player Type Toggle */}
              <div className="bg-surface-container rounded-xl p-1 flex">
                <button
                  onClick={() => {
                    setPlayerTypeFilter("outfield");
                    setAttributeFilters([]); // Clear filters when switching
                  }}
                  className={`flex-1 py-2 px-3 rounded-lg font-label text-label font-bold transition-colors duration-quick ${
                    playerTypeFilter === "outfield"
                      ? "bg-primary text-on-primary"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {t("transfers.playerType.outfield")}
                </button>
                <button
                  onClick={() => {
                    setPlayerTypeFilter("gk");
                    setAttributeFilters([]); // Clear filters when switching
                  }}
                  className={`flex-1 py-2 px-3 rounded-lg font-label text-label font-bold transition-colors duration-quick ${
                    playerTypeFilter === "gk"
                      ? "bg-primary text-on-primary"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {t("transfers.playerType.goalkeeper")}
                </button>
              </div>

              {/* Active Attribute Filters */}
              {attributeFilters.length > 0 && (
                <div className="space-y-3">
                  <label className="block text-kicker uppercase tracking-widest text-on-surface-variant">{t("transfers.filter.attributeCount", { count: attributeFilters.length })}</label>
                  {attributeFilters.map((filter) => {
                    const attrInfo = ATTRIBUTES.find(a => a.value === filter.attribute) || ATTRIBUTES[0];
                    return (
                      <div key={filter.id} className="bg-surface p-3 rounded-xl border border-outline-variant/10">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <AppIcon name={attrInfo.icon} className="text-sm text-accent" />
                            <span className="text-label font-bold text-frost">{attrInfo.label}</span>
                          </div>
                          <button
                            onClick={() => removeAttributeFilter(filter.id)}
                            className="text-on-surface-variant hover:text-red-400 transition-colors"
                          >
                            <AppIcon name="close" className="text-sm" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 text-kicker text-on-surface-variant mb-2">
                          <span>{filter.range.min}</span>
                          <div className="flex-1 h-1 bg-surface-container-high rounded-full relative">
                            <div
                              className="absolute h-full bg-accent rounded-full"
                              style={{
                                left: `${(filter.range.min / 20) * 100}%`,
                                width: `${((filter.range.max - filter.range.min) / 20) * 100}%`
                              }}
                            />
                            <div
                              className="absolute w-3 h-3 bg-accent rounded-full -top-1 cursor-pointer"
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
                              className="absolute w-3 h-3 bg-accent rounded-full -top-1 cursor-pointer"
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
                    className="add-filter-dropdown w-full flex items-center justify-between bg-surface-container-high/50 border border-dashed border-outline-variant/50 rounded-xl py-3 px-4 text-left hover:border-accent/30 transition-colors"
                    onClick={() => setShowAddFilterDropdown(!showAddFilterDropdown)}
                  >
                    <div className="flex items-center gap-3">
                      <AppIcon name="add" className="text-sm text-on-surface-variant" />
                      <span className="text-xs font-bold text-on-surface-variant">{t("transfers.filter.addAttributeFilter")}</span>
                    </div>
                    <AppIcon name="expand_more" className="text-on-surface-variant text-xl" />
                  </button>
                  {showAddFilterDropdown && (
                    <div className="add-filter-dropdown absolute z-50 mt-2 w-full bg-surface border border-outline-variant/30 rounded-xl overflow-hidden shadow-xl shadow-black/50 max-h-64 overflow-y-auto">
                      {ATTRIBUTES.map((attr) => {
                        const isUsed = attributeFilters.some(f => f.attribute === attr.value);
                        return (
                          <button
                            key={attr.value}
                            disabled={isUsed}
                            className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container-high transition-colors ${isUsed ? 'opacity-40' : ''}`}
                            onClick={() => !isUsed && addAttributeFilter(attr.value)}
                          >
                            <AppIcon name={attr.icon} className="text-sm text-on-surface-variant" />
                            <span className={`text-xs font-bold ${isUsed ? 'text-on-surface-variant' : 'text-frost'}`}>{attr.label}</span>
                            {isUsed && (
                              <span className="text-kicker text-on-surface-variant ml-auto">{t("transfers.filter.alreadyAdded")}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Age Filter */}
              <div className="bg-surface p-4 rounded-xl border border-outline-variant/10">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <AppIcon name="cake" className="text-sm text-accent" />
                    <span className="text-label font-bold text-accent">{t("transfers.filter.ageFilter")}</span>
                  </div>
                  <button
                    onClick={() => setAgeEnabled(!ageEnabled)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${ageEnabled ? 'bg-accent' : 'bg-surface-container-high'}`}
                  >
                    <div className={`absolute w-4 h-4 rounded-full bg-white top-0.5 transition-transform ${ageEnabled ? 'left-5.5' : 'left-0.5'}`} />
                  </button>
                </div>
                {ageEnabled && (
                  <div className="flex items-center gap-2 text-kicker text-on-surface-variant">
                    <span>{ageRange.min}</span>
                    <div className="flex-1 h-1 bg-surface-container-high rounded-full relative">
                      <div
                        className="absolute h-full bg-accent rounded-full"
                        style={{
                          left: `${((ageRange.min - 15) / 20) * 100}%`,
                          width: `${((ageRange.max - ageRange.min) / 20) * 100}%`
                        }}
                      />
                      <div
                        className="absolute w-3 h-3 bg-accent rounded-full -top-1 cursor-pointer"
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
                        className="absolute w-3 h-3 bg-accent rounded-full -top-1 cursor-pointer"
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
              <div className="bg-surface p-4 rounded-xl border border-outline-variant/10">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <AppIcon name="emoji_events" className="text-sm text-accent" />
                    <span className="text-label font-bold text-accent">{t("transfers.filter.specialtyFilter")}</span>
                  </div>
                  <button
                    onClick={() => setSpecialtyEnabled(!specialtyEnabled)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${specialtyEnabled ? 'bg-accent' : 'bg-surface-container-high'}`}
                  >
                    <div className={`absolute w-4 h-4 rounded-full bg-white top-0.5 transition-transform ${specialtyEnabled ? 'left-5.5' : 'left-0.5'}`} />
                  </button>
                </div>
                {specialtyEnabled && (
                  <div className="relative">
                    <button
                      className="specialty-trigger w-full flex items-center justify-between bg-surface-container-high border border-outline-variant/30 rounded-xl py-2.5 px-3 text-left hover:border-accent/30 transition-colors"
                      onClick={() => setShowSpecialtyDropdown((v) => !v)}
                    >
                      <div className="flex items-center gap-2">
                        <SpecialtyIcon
                          code={selectedSpecialty || undefined}
                          size="sm"
                          className="text-accent"
                        />
                        <span className="text-xs font-bold text-frost">
                          {selectedSpecialty ? SPECIALTIES.find(s => s.value === selectedSpecialty)?.label : t("transfers.filters.any")}
                        </span>
                      </div>
                      <AppIcon name="expand_more" className="text-on-surface-variant text-xl" />
                    </button>
                    <div
                      id="specialty-dropdown"
                      className={`${showSpecialtyDropdown ? "" : "hidden"} absolute z-50 mt-2 w-full bg-surface border border-outline-variant/30 rounded-xl overflow-hidden shadow-xl shadow-black/50 max-h-48 overflow-y-auto`}
                    >
                      <button
                        className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container-high transition-colors ${!selectedSpecialty ? 'bg-surface-container-high' : ''}`}
                        onClick={() => {
                          setSelectedSpecialty("");
                          setShowSpecialtyDropdown(false);
                        }}
                      >
                        <AppIcon name="all_inclusive" className="text-sm text-on-surface-variant" />
                        <span className={`text-xs font-bold ${!selectedSpecialty ? 'text-accent' : 'text-frost'}`}>{t("transfers.filters.any")}</span>
                        {!selectedSpecialty && <AppIcon name="check" className="text-accent text-sm ml-auto" />}
                      </button>
                      {SPECIALTIES.map((spec) => (
                        <button
                          key={spec.value}
                          className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container-high transition-colors ${selectedSpecialty === spec.value ? 'bg-surface-container-high' : ''}`}
                          onClick={() => {
                            setSelectedSpecialty(spec.value);
                            setShowSpecialtyDropdown(false);
                          }}
                        >
                          <SpecialtyIcon code={spec.value} size="sm" className="text-on-surface-variant" />
                          <span className={`text-xs font-bold ${selectedSpecialty === spec.value ? 'text-accent' : 'text-frost'}`}>{spec.label}</span>
                          {selectedSpecialty === spec.value && <AppIcon name="check" className="text-accent text-sm ml-auto" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Reset Button */}
              <button
                className="w-full py-3 bg-surface-container-high text-accent font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-surface-container-highest transition-colors border border-accent/10"
                onClick={resetAllFilters}
              >
                {t("transfers.filters.resetAllFilters")}
              </button>
            </div>
          </aside>

          {/* Center: Results List */}
          <section className="glass-panel min-w-0 flex-1 rounded-2xl p-panel">

            {/* Error State */}
            {error && (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-error/30 bg-error/5 px-panel py-section text-center">
                <AppIcon name="error_outline" className="text-4xl text-error" />
                <p className="mt-tight font-headline text-title font-black text-on-surface">{t("transfers.error.failedToLoad")}</p>
                <p className="mt-1 max-w-[420px] font-label text-label text-on-surface-variant">{error}</p>
                <button
                  onClick={() => fetchTransfers()}
                  className="mt-panel inline-flex h-9 items-center gap-micro rounded-lg border border-outline-variant/40 px-tight font-label text-label font-bold text-on-surface transition-colors duration-quick hover:border-outline hover:bg-white/[0.04]"
                >
                  {t("transfers.error.retry")}
                </button>
              </div>
            )}

            {/* Loading State */}
            {isLoading && !error && <TransferListSkeleton />}

            {/* Player List */}
            {!isLoading && !error && filteredTransfers.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant/40 bg-white/[0.02] px-panel py-section text-center">
                <AppIcon name="search_off" className="text-4xl text-outline" />
                <p className="mt-tight font-headline text-title font-black text-on-surface">{t("transfers.empty.noResults")}</p>
                <p className="mt-1 max-w-[420px] font-label text-label text-on-surface-variant">{t("transfers.empty.adjustFilters")}</p>
                <button
                  onClick={resetAllFilters}
                  className="mt-panel inline-flex h-9 items-center gap-micro rounded-lg border border-primary/30 bg-primary/12 px-tight font-label text-label font-bold text-primary transition-colors duration-quick hover:bg-primary/20"
                >
                  {t("transfers.empty.resetFilters")}
                </button>
              </div>
            )}

            {!isLoading && !error && filteredTransfers.length > 0 && (
              <div className="flex flex-col gap-tight">
                {filteredTransfers.map((transfer) => {
                  const isSelected = selectedTransfer?.id === transfer.id;

                  return (
                    <TransferPlayerCard
                      key={transfer.id}
                      transfer={transfer}
                      isSelected={isSelected}
                      onClick={() => setSelectedTransfer(transfer)}
                      formatCurrency={formatCurrency}
                      formatTimeRemaining={formatTimeRemaining}
                    />
                  );
                })}
              </div>
            )}
          </section>

          {/* Right Panel: Player Details */}
          <aside className="glass-panel flex w-full shrink-0 flex-col rounded-2xl lg:sticky lg:top-4 lg:max-h-[calc(100dvh-140px)] lg:w-[400px]">
            {isLoading ? (
              <PlayerDetailSkeleton />
            ) : !selectedTransfer ? (
              <div className="flex-grow flex items-center justify-center">
                <p className="text-on-surface-variant text-sm">{t("squad.selectPlayer")}</p>
              </div>
            ) : (
              <>
                <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                  {/* Header Image */}
                  <div className="relative h-56 rounded-2xl overflow-hidden mb-6 group">
                    <div className="w-full h-full bg-gradient-to-br from-accent/20 to-surface-container" />
                    <div className="absolute inset-0 bg-gradient-to-t from-surface-container via-transparent to-black/20" />
                    <div className={`absolute top-4 right-4 px-3 py-1.5 rounded-lg flex items-center gap-2 ${
                      formatTimeRemaining(selectedTransfer.expiresAt) === EXPIRED_LABEL
                        ? "bg-danger/80"
                        : "bg-surface-container/80 backdrop-blur-md"
                    }`}>
                      <AppIcon name="timer" className="text-xs text-danger" />
                      <span className="text-kicker font-bold text-on-surface uppercase tracking-wider">{formatTimeRemaining(selectedTransfer.expiresAt)}</span>
                    </div>
                    <div className="absolute bottom-4 left-4">
                      <Link href={`/${params.locale}/players/${selectedTransfer.player.id}`}>
                        <h3 className="text-3xl font-bold text-on-surface tracking-tighter hover:text-accent transition-colors">{selectedTransfer.player.name}</h3>
                      </Link>
                      <p className="text-on-surface-variant text-xs">
                        {t("common.ageFormat", { y: selectedTransfer.player.age, d: selectedTransfer.player.ageDays })} · {selectedTransfer.player.teamName || selectedTransfer.team.name} · {t("common.currencySymbol")}{(selectedTransfer.player.currentWage || 0).toLocaleString()}{t("common.perWeek")}
                      </p>
                    </div>
                  </div>

                  {/* Pricing */}
                  <div className="mb-6">
                    <div className="bg-surface-container-high p-4 rounded-2xl border border-outline-variant/10">
                      <p className="text-kicker text-on-surface-variant uppercase tracking-widest mb-1">{t("transfers.detail.currentPrice")}</p>
                      <p className="text-2xl font-bold text-accent truncate">{formatCurrency(selectedTransfer.currentPrice)}</p>
                    </div>
                  </div>

                  {/* Attribute Section */}
                  <section className="space-y-6">
                    <div className="flex items-center gap-2 mb-4 border-b border-outline-variant/10 pb-2">
                      <AppIcon name="analytics" className="text-accent text-sm" />
                      <h4 className="text-kicker uppercase tracking-widest text-on-surface-variant font-bold">{t("transfers.detail.profile")}</h4>
                    </div>

                    <div className="grid grid-cols-2 gap-10">
                      {/* Technical & Physical */}
                      <div className="space-y-8">
                        {/* Technical */}
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-1.5 h-4 bg-accent rounded-full" />
                            <h3 className="text-xs font-black font-headline tracking-widest uppercase text-on-surface-variant">{t("transfers.detail.technical")}</h3>
                          </div>
                          <div className="space-y-3">
                            {selectedTransfer.player.isGoalkeeper ? (
                              <>
                                {renderSkillBar(t("squad.skills.reflexes"), (selectedTransfer.player.currentSkills)?.technical?.reflexes || 0, (selectedTransfer.player.potentialSkills)?.technical?.reflexes || 0, "text-accent")}
                                {renderSkillBar(t("squad.skills.handling"), (selectedTransfer.player.currentSkills)?.technical?.handling || 0, (selectedTransfer.player.potentialSkills)?.technical?.handling || 0, "text-accent")}
                                {renderSkillBar(t("squad.skills.aerial"), (selectedTransfer.player.currentSkills)?.technical?.aerial || 0, (selectedTransfer.player.potentialSkills)?.technical?.aerial || 0, "text-accent")}
                              </>
                            ) : (
                              <>
                                {renderSkillBar(t("squad.skills.finishing"), (selectedTransfer.player.currentSkills)?.technical?.finishing || 0, (selectedTransfer.player.potentialSkills)?.technical?.finishing || 0, "text-accent")}
                                {renderSkillBar(t("squad.skills.passing"), (selectedTransfer.player.currentSkills)?.technical?.passing || 0, (selectedTransfer.player.potentialSkills)?.technical?.passing || 0, "text-accent")}
                                {renderSkillBar(t("squad.skills.dribbling"), (selectedTransfer.player.currentSkills)?.technical?.dribbling || 0, (selectedTransfer.player.potentialSkills)?.technical?.dribbling || 0, "text-accent")}
                                {renderSkillBar(t("squad.skills.defending"), (selectedTransfer.player.currentSkills)?.technical?.defending || 0, (selectedTransfer.player.potentialSkills)?.technical?.defending || 0, "text-accent")}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Physical */}
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-1.5 h-4 bg-signal-blue rounded-full" />
                            <h3 className="text-xs font-black font-headline tracking-widest uppercase text-on-surface-variant">{t("transfers.detail.physical")}</h3>
                          </div>
                          <div className="space-y-3">
                            {renderSkillBar(t("squad.skills.pace"), (selectedTransfer.player.currentSkills)?.physical?.pace || 0, (selectedTransfer.player.potentialSkills)?.physical?.pace || 0, "text-signal-blue")}
                            {renderSkillBar(t("squad.skills.strength"), (selectedTransfer.player.currentSkills)?.physical?.strength || 0, (selectedTransfer.player.potentialSkills)?.physical?.strength || 0, "text-signal-blue")}
                          </div>
                        </div>
                      </div>

                      {/* Mental & Set Pieces */}
                      <div className="space-y-8">
                        {/* Mental */}
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-1.5 h-4 bg-signal-lime rounded-full" />
                            <h3 className="text-xs font-black font-headline tracking-widest uppercase text-[#91b12a6]">{t("transfers.detail.mental")}</h3>
                          </div>
                          <div className="space-y-3">
                            {renderSkillBar(t("squad.skills.composure"), (selectedTransfer.player.currentSkills)?.mental?.composure || 0, (selectedTransfer.player.potentialSkills)?.mental?.composure || 0, "text-signal-lime")}
                            {renderSkillBar(t("squad.skills.positioning"), (selectedTransfer.player.currentSkills)?.mental?.positioning || 0, (selectedTransfer.player.potentialSkills)?.mental?.positioning || 0, "text-signal-lime")}
                          </div>
                        </div>

                        {/* Set Pieces */}
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-1.5 h-4 bg-signal-amber rounded-full" />
                            <h3 className="text-xs font-black font-headline tracking-widest uppercase text-on-surface-variant">{t("squad.skills.setPieces")}</h3>
                          </div>
                          <div className="space-y-3">
                            {renderSkillBar(t("squad.skills.freeKicks"), (selectedTransfer.player.currentSkills)?.setPieces?.freeKicks || 0, (selectedTransfer.player.potentialSkills)?.setPieces?.freeKicks || 0, "text-signal-amber")}
                            {renderSkillBar(t("squad.skills.penalties"), (selectedTransfer.player.currentSkills)?.setPieces?.penalties || 0, (selectedTransfer.player.potentialSkills)?.setPieces?.penalties || 0, "text-signal-amber")}
                          </div>
                        </div>
                      </div>

                      {/* Bid History */}
                      {selectedTransfer.bidHistory && selectedTransfer.bidHistory.length > 0 && (
                        <div className="mt-0 pt-4 border-t border-outline-variant/10">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <AppIcon name="gavel" className="text-accent text-sm" />
                              <h4 className="text-kicker uppercase tracking-widest text-on-surface-variant font-bold">{t("transfers.bidHistory")}</h4>
                            </div>
                            {selectedTransfer.bidHistory.length > 3 && (
                              <button
                                onClick={() => setShowBidHistoryModal(true)}
                                className="text-kicker text-on-surface-variant hover:text-accent transition-colors flex items-center gap-1"
                              >
                                <span>{t("transfers.more")}</span>
                                <AppIcon name="navigate_next" className="text-sm" />
                              </button>
                            )}
                          </div>
                          <div className="divide-y divide-outline-variant/20">
                            {selectedTransfer.bidHistory.slice().reverse().slice(0, 3).map((bid, idx) => (
                              <div key={idx} className="flex items-center justify-between py-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent/30 to-surface-container-high flex items-center justify-center">
                                    <span className="text-kicker font-bold text-accent">{(bid.teamName || '?').charAt(0)}</span>
                                  </div>
                                  <div>
                                    <p className="text-label font-semibold text-frost">{bid.teamName || t("transfers.notifications.unknown")}</p>
                                    <p className="text-kicker text-on-surface-variant">{formatBidTime(bid.timestamp)}</p>
                                  </div>
                                </div>
                                <p className="text-label font-bold text-accent">{formatCurrency(bid.amount)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                </div>

                {/* Bid Input */}
                <div className="p-6 bg-surface-container-low border-t border-outline-variant/10">
                  <div className="flex gap-3 items-center">
                    <div className="flex-1 relative">
                      <label className="absolute -top-2 left-3 px-1 bg-surface-container-low text-kicker text-primary-dim font-bold uppercase tracking-widest z-10">
                        {t("transfers.detail.offerPrice")}
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-accent font-bold text-sm">{t("common.currencySymbol")}</span>
                        <input
                          className="w-full bg-surface-container-high border border-outline-variant/30 rounded-xl py-3 pl-8 pr-4 text-sm font-bold text-frost focus:ring-1 focus:ring-accent focus:border-accent transition-all placeholder:text-on-surface-variant/40"
                          placeholder={t("transfers.detail.offerPlaceholder")}
                          type="text"
                          inputMode="numeric"
                          value={formatBidAmountInput(bidAmount)}
                          onChange={(e) => {
                            // Strip non-digits; cap at 9 digits (max
                            // 999,999,999) so a paste of "1e100" or
                            // similar can't blow up the parser.
                            const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 9);
                            setBidAmount(digits);
                          }}
                        />
                      </div>
                    </div>
                    <button
                      className="px-6 py-3.5 bg-accent text-on-primary font-bold rounded-xl flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-accent/20 uppercase tracking-widest text-kicker whitespace-nowrap disabled:opacity-50"
                      onClick={async () => {
                        if (!selectedTransfer || !bidAmount || !team) return;
                        const amount = parseInt(bidAmount.replace(/,/g, ""));
                        if (isNaN(amount) || amount <= 0) return;
                        setIsSubmittingBid(true);
                        try {
                          await api.transfers.placeBid(selectedTransfer.id, amount);
                          setNotification({ type: 'success', message: t("transfers.notifications.offerSubmitted", { amount: `${t("common.currencySymbol")}${amount.toLocaleString()}`, player: selectedTransfer.player.name }) });
                          setBidAmount("");
                          const freshData = await fetchTransfers();
                          const updated = freshData.find(t => t.id === selectedTransfer.id);
                          if (updated) setSelectedTransfer(updated);
                        } catch (error) {
                          setNotification({ type: 'error', message: error instanceof Error ? error.message : t("transfers.notifications.offerFailed") });
                        } finally {
                          setIsSubmittingBid(false);
                        }
                      }}
                      disabled={!bidAmount || isSubmittingBid}
                    >
                      <AppIcon name="payments" className="text-sm" />
                      {t("transfers.detail.makeOffer")}
                    </button>
                  </div>
                </div>
              </>
            )}
          </aside>
        </div>
      </div>

      {/* Bid History Full Modal */}
      {showBidHistoryModal && selectedTransfer && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-surface-container-low/90 backdrop-blur-xl rounded-2xl overflow-hidden shadow-2xl border border-accent/20 w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <AppIcon name="gavel" className="text-accent text-lg" />
                  <h3 className="text-lg font-bold text-frost">{t("transfers.bidHistory")}</h3>
                </div>
                <button
                  aria-label="Close bid history"
                  className="text-on-surface-variant hover:text-frost transition-colors"
                  onClick={() => setShowBidHistoryModal(false)}
                >
                  <AppIcon name="close" />
                </button>
              </div>
              <div className="space-y-3">
                {selectedTransfer.bidHistory.slice().reverse().map((bid, idx) => (
                  <div key={idx} className="flex items-center justify-between py-3 border-b border-outline-variant/20 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent/30 to-surface-container-high flex items-center justify-center">
                        <span className="text-kicker font-bold text-accent">{(bid.teamName || '?').charAt(0)}</span>
                      </div>
                      <div>
                        <p className="text-label font-semibold text-frost">{bid.teamName || t("transfers.notifications.unknown")}</p>
                        <p className="text-kicker text-on-surface-variant">{formatBidTime(bid.timestamp)}</p>
                      </div>
                    </div>
                    <p className="text-title font-bold text-accent">{formatCurrency(bid.amount)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
