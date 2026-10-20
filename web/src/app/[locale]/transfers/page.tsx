"use client";

import { AppIcon } from "@/components/icons/AppIcon";
import { useTranslations, useLocale } from "next-intl";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { api, type Player, type TransferAuction } from "@/lib/api";
import TransferListSkeleton from "@/components/transfers/TransferListSkeleton";
import PlayerDetailSkeleton from "@/components/transfers/PlayerDetailSkeleton";
import { PlayerIdentity } from "@/components/player/profile/PlayerIdentity";
import { PlayerSkillGrid } from "@/components/player/profile/PlayerSkillGrid";
import AttributeRangeSlider from "@/components/transfers/AttributeRangeSlider";
import TransferPlayerCard from "@/components/transfers/TransferPlayerCard";
import TransferNav from "@/components/transfers/TransferNav";
import { SpecialtyIcon } from "@/components/player/SpecialtyIcon";

type TransferPlayer = Player;

export default function TransfersPage() {
  const t = useTranslations();
  const locale = useLocale();
  const params = useParams();
  const { team } = useAuth();
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
    [t],
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


  return (
    <>
      {/* Notification Toast */}
      {notification && (
        <div className="fixed top-5 right-5 z-[200] flex flex-col">
          <div className={`
            relative overflow-hidden rounded-2xl border backdrop-blur-2xl
            ${notification.type === 'success'
              ? 'bg-surface-container-high/95 border-primary/30 shadow-[0_0_30px_rgba(161,255,194,0.15)]'
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
                  ? 'bg-accent/10 text-primary'
                  : 'bg-danger/10 text-red-400'
                }
              `}>
                <AppIcon name={notification.type === 'success' ? 'check_circle' : 'error'} className="text-xl" />
              </div>

              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${
                  notification.type === 'success' ? 'text-on-surface' : 'text-red-200'
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
                    ? 'text-on-surface-variant hover:text-on-surface hover:bg-accent/10'
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
          <TransferNav />
        </header>

        <div className="flex flex-col gap-gutter lg:flex-row lg:items-start">
          {/* Left Panel: Filters */}
          <aside className="glass-panel w-full shrink-0 rounded-2xl p-panel lg:sticky lg:top-4 lg:max-h-[calc(100dvh-140px)] lg:w-[284px] lg:overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-bold text-kicker uppercase tracking-widest text-on-surface-variant">{t("transfers.filters.scoutingFilters")}</h2>
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
                      <div key={filter.id} className="bg-surface-container-high/40 p-3 rounded-xl border border-outline-variant/40">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <AppIcon name={attrInfo.icon} className="text-sm text-primary" />
                            <span className="text-label font-bold text-on-surface">{attrInfo.label}</span>
                          </div>
                          <button
                            onClick={() => removeAttributeFilter(filter.id)}
                            className="text-on-surface-variant hover:text-red-400 transition-colors"
                          >
                            <AppIcon name="close" className="text-sm" />
                          </button>
                        </div>
                        <AttributeRangeSlider
                          label={attrInfo.label}
                          minLabel={t("transfers.filter.minimum")}
                          maxLabel={t("transfers.filter.maximum")}
                          min={filter.range.min}
                          max={filter.range.max}
                          onChange={(lo: number, hi: number) => updateAttributeFilterRange(filter.id, lo, hi)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add Filter Button */}
              {attributeFilters.length < 3 && (
                <div className="relative">
                  <button
                    className="add-filter-dropdown w-full flex items-center justify-between bg-surface-container-high/50 border border-dashed border-outline-variant/50 rounded-xl py-3 px-4 text-left hover:border-primary/30 transition-colors"
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
                            <span className={`text-xs font-bold ${isUsed ? 'text-on-surface-variant' : 'text-on-surface'}`}>{attr.label}</span>
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
                    <AppIcon name="cake" className="text-sm text-primary" />
                    <span className="text-label font-bold text-primary">{t("transfers.filter.ageFilter")}</span>
                  </div>
                  <button
                    onClick={() => setAgeEnabled(!ageEnabled)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${ageEnabled ? 'bg-accent' : 'bg-surface-container-high'}`}
                  >
                    <div className={`absolute w-4 h-4 rounded-full bg-white top-0.5 transition-transform ${ageEnabled ? 'left-5.5' : 'left-0.5'}`} />
                  </button>
                </div>
                {ageEnabled && (
                  <div className="mt-3">
                    <AttributeRangeSlider
                      label={t("transfers.filter.ageFilter")}
                      minLabel={t("transfers.filter.minimum")}
                      maxLabel={t("transfers.filter.maximum")}
                      min={ageRange.min}
                      max={ageRange.max}
                      scaleMin={15}
                      scaleMax={35}
                      onChange={(lo, hi) => setAgeRange({ min: lo, max: hi })}
                    />
                  </div>
                )}
              </div>

              {/* Specialty Filter */}
              <div className="bg-surface p-4 rounded-xl border border-outline-variant/10">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <AppIcon name="emoji_events" className="text-sm text-primary" />
                    <span className="text-label font-bold text-primary">{t("transfers.filter.specialtyFilter")}</span>
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
                      className="specialty-trigger w-full flex items-center justify-between bg-surface-container-high border border-outline-variant/30 rounded-xl py-2.5 px-3 text-left hover:border-primary/30 transition-colors"
                      onClick={() => setShowSpecialtyDropdown((v) => !v)}
                    >
                      <div className="flex items-center gap-2">
                        <SpecialtyIcon
                          code={selectedSpecialty || undefined}
                          size="sm"
                          className="text-primary"
                        />
                        <span className="text-xs font-bold text-on-surface">
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
                        <span className={`text-xs font-bold ${!selectedSpecialty ? 'text-primary' : 'text-on-surface'}`}>{t("transfers.filters.any")}</span>
                        {!selectedSpecialty && <AppIcon name="check" className="text-primary text-sm ml-auto" />}
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
                          <span className={`text-xs font-bold ${selectedSpecialty === spec.value ? 'text-primary' : 'text-on-surface'}`}>{spec.label}</span>
                          {selectedSpecialty === spec.value && <AppIcon name="check" className="text-primary text-sm ml-auto" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Reset Button */}
              <button
                className="w-full py-3 bg-surface-container-high text-primary font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-surface-container-highest transition-colors border border-accent/10"
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
              <div className="flex flex-grow flex-col items-center justify-center rounded-xl border border-dashed border-outline-variant/40 bg-white/[0.02] px-panel py-section text-center">
                <AppIcon name="search" className="text-4xl text-outline" />
                <p className="mt-tight max-w-[240px] font-label text-label text-on-surface-variant">{t("squad.selectPlayer")}</p>
              </div>
            ) : (
              <>
                <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                  {/* Identity — the same component the squad pane and the
                      profile page use, so a candidate looks like the player he
                      becomes once signed. */}
                  <div className="mb-4 rounded-xl border border-outline-variant/40 bg-surface-container p-0">
                    <PlayerIdentity
                      player={selectedTransfer.player}
                      locale={(params.locale as string) ?? "zh"}
                      nameHref={`/${params.locale}/players/${selectedTransfer.player.id}`}
                      chips={
                        selectedTransfer.player.position ? (
                          <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-tight py-micro font-label text-kicker font-bold text-on-surface-variant">
                            {selectedTransfer.player.position}
                          </span>
                        ) : null
                      }
                    />
                  </div>

                  {/* Auction block: price, countdown and leading bid belong
                      together. The countdown used to live in the identity
                      chips, which put a live clock next to the player's name
                      on a panel that is otherwise static. */}
                  <div className="mb-5 rounded-xl border border-outline-variant/40 bg-surface-container px-panel py-tight">
                    <div className="flex items-start justify-between gap-tight">
                      <div className="min-w-0">
                        <p className="font-label text-kicker uppercase tracking-widest text-outline">
                          {t("transfers.detail.currentPrice")}
                        </p>
                        <p className="mt-micro truncate font-headline text-2xl font-bold tabular-nums text-primary">
                          {formatCurrency(selectedTransfer.currentPrice)}
                        </p>
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center gap-micro rounded-full px-tight py-micro font-label text-kicker font-bold uppercase tracking-wider ${
                          formatTimeRemaining(selectedTransfer.expiresAt) === EXPIRED_LABEL
                            ? "bg-danger/15 text-danger"
                            : "bg-surface-container-high text-on-surface-variant"
                        }`}
                      >
                        <AppIcon name="timer" className="text-kicker" />
                        {formatTimeRemaining(selectedTransfer.expiresAt)}
                      </span>
                    </div>
                    <div className="mt-tight flex flex-wrap items-center gap-x-gutter gap-y-micro border-t border-outline-variant/25 pt-tight">
                      <span className="font-label text-kicker text-on-surface-variant">
                        {t("squad.wage")}{" "}
                        <span className="font-bold tabular-nums text-on-surface">
                          {formatCurrency(selectedTransfer.player.currentWage ?? 0)}
                        </span>
                      </span>
                      {selectedTransfer.currentBidder ? (
                        <span className="min-w-0 truncate font-label text-kicker text-on-surface-variant">
                          {t("transfers.detail.leading")}{" "}
                          <span className="font-bold text-on-surface">
                            {selectedTransfer.currentBidder.name}
                          </span>
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Skills — the same grid the profile page renders, so a
                      candidate is described exactly like a signed player. */}
                  <section className="space-y-6">
                    <div className="flex items-center gap-tight border-b border-outline-variant/30 pb-tight">
                      <AppIcon name="analytics" className="text-sm text-primary" />
                      <h4 className="font-label text-kicker font-bold uppercase tracking-[0.14em] text-outline">
                        {t("transfers.detail.profile")}
                      </h4>
                    </div>

                    <PlayerSkillGrid player={selectedTransfer.player} columns={2} />

                    {/* Bid history */}
                    {selectedTransfer.bidHistory && selectedTransfer.bidHistory.length > 0 ? (
                      <div className="border-t border-outline-variant/30 pt-panel">
                        <div className="mb-tight flex items-center justify-between gap-tight">
                          <div className="flex items-center gap-tight">
                            <AppIcon name="gavel" className="text-sm text-primary" />
                            <h4 className="font-label text-kicker font-bold uppercase tracking-[0.14em] text-outline">
                              {t("transfers.bidHistory")}
                            </h4>
                          </div>
                          {selectedTransfer.bidHistory.length > 3 ? (
                            <button
                              type="button"
                              onClick={() => setShowBidHistoryModal(true)}
                              className="inline-flex items-center gap-micro font-label text-kicker uppercase tracking-wider text-on-surface-variant transition-colors duration-quick hover:text-primary"
                            >
                              {t("transfers.more")}
                              <AppIcon name="navigate_next" className="text-kicker" />
                            </button>
                          ) : null}
                        </div>
                        <ol className="divide-y divide-outline-variant/20">
                          {selectedTransfer.bidHistory
                            .slice()
                            .reverse()
                            .slice(0, 3)
                            .map((bid, idx) => {
                              const highest = Math.max(
                                ...selectedTransfer.bidHistory.map((b) => b.amount),
                              );
                              const leading = bid.amount === highest;
                              return (
                                <li
                                  key={`${bid.timestamp}-${idx}`}
                                  className="flex items-center justify-between gap-tight py-tight"
                                >
                                  <div className="flex min-w-0 items-center gap-tight">
                                    <span
                                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-headline text-kicker font-black ${
                                        leading
                                          ? "bg-primary/15 text-primary"
                                          : "bg-surface-container-high text-on-surface-variant"
                                      }`}
                                      aria-hidden="true"
                                    >
                                      {(bid.teamName || "?").charAt(0).toUpperCase()}
                                    </span>
                                    <span className="min-w-0">
                                      <span className="flex items-center gap-micro">
                                        <span className="truncate font-body text-label font-semibold text-on-surface">
                                          {bid.teamName || t("transfers.notifications.unknown")}
                                        </span>
                                        {leading ? (
                                          <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-px font-label text-kicker font-bold uppercase tracking-wider text-primary">
                                            {t("transfers.detail.leading")}
                                          </span>
                                        ) : null}
                                      </span>
                                      <span className="block font-label text-kicker text-on-surface-variant">
                                        {formatBidTime(bid.timestamp)}
                                      </span>
                                    </span>
                                  </div>
                                  <span
                                    className={`shrink-0 font-headline text-label font-bold tabular-nums ${
                                      leading ? "text-primary" : "text-on-surface-variant"
                                    }`}
                                  >
                                    {formatCurrency(bid.amount)}
                                  </span>
                                </li>
                              );
                            })}
                        </ol>
                      </div>
                    ) : null}
                  </section>
                </div>

                {/* Bid footer */}
                <div className="border-t border-outline-variant/30 bg-surface-container-low/60 p-panel">
                  <div className="flex flex-col gap-tight">
                    <div className="flex items-end justify-between gap-tight">
                      <label
                        htmlFor="transfer-bid-amount"
                        className="font-label text-kicker font-bold uppercase tracking-[0.14em] text-outline"
                      >
                        {t("transfers.detail.offerPrice")}
                      </label>
                      <div className="flex items-center gap-micro">
                        {[5, 10].map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() =>
                              setBidAmount(
                                String(
                                  Math.round(
                                    (selectedTransfer.currentPrice * (1 + pct / 100)) / 1000,
                                  ) * 1000,
                                ),
                              )
                            }
                            className="rounded-full border border-outline-variant/30 px-tight py-micro font-label text-kicker font-bold tabular-nums text-on-surface-variant transition-colors duration-quick hover:border-primary/40 hover:text-primary"
                          >
                            +{pct}%
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-tight">
                      <div className="relative flex-1">
                        <span className="pointer-events-none absolute left-panel top-1/2 -translate-y-1/2 font-body text-body font-bold text-primary">
                          {t("common.currencySymbol")}
                        </span>
                        <input
                          id="transfer-bid-amount"
                          className="w-full rounded-lg border border-outline-variant/40 bg-surface-container py-tight pl-7 pr-panel text-right font-headline text-body font-bold tabular-nums text-on-surface transition-colors duration-quick placeholder:text-right placeholder:font-body placeholder:font-normal placeholder:text-on-surface-variant/50 focus:border-primary/50 focus:outline-none"
                          placeholder={t("transfers.detail.offerPlaceholder")}
                          type="text"
                          inputMode="numeric"
                          value={formatBidAmountInput(bidAmount)}
                          onChange={(e) => {
                            // Strip non-digits; cap at 9 digits (max
                            // 999,999,999) so a paste of "1e100" or similar
                            // can't blow up the parser.
                            const digits = e.target.value.replace(/[^0-9]/g, "").slice(0, 9);
                            setBidAmount(digits);
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        className="inline-flex items-center gap-tight rounded-lg bg-primary px-panel py-tight font-label text-label font-bold uppercase tracking-[0.08em] text-on-primary shadow-[0_6px_20px_-8px_rgba(0,228,121,0.6)] transition-all duration-quick hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                        onClick={async () => {
                          if (!selectedTransfer || !bidAmount || !team) return;
                          const amount = parseInt(bidAmount.replace(/,/g, ""));
                          if (isNaN(amount) || amount <= 0) return;
                          setIsSubmittingBid(true);
                          try {
                            await api.transfers.placeBid(selectedTransfer.id, amount);
                            setNotification({
                              type: "success",
                              message: t("transfers.notifications.offerSubmitted", {
                                amount: `${t("common.currencySymbol")}${amount.toLocaleString()}`,
                                player: selectedTransfer.player.name,
                              }),
                            });
                            setBidAmount("");
                            const freshData = await fetchTransfers();
                            const updated = freshData.find((x) => x.id === selectedTransfer.id);
                            if (updated) setSelectedTransfer(updated);
                          } catch (error) {
                            setNotification({
                              type: "error",
                              message:
                                error instanceof Error
                                  ? error.message
                                  : t("transfers.notifications.offerFailed"),
                            });
                          } finally {
                            setIsSubmittingBid(false);
                          }
                        }}
                        disabled={!bidAmount || isSubmittingBid}
                      >
                        <AppIcon name="payments" className="text-kicker" />
                        {isSubmittingBid
                          ? t("transfers.submitting")
                          : t("transfers.detail.makeOffer")}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </aside>
        </div>
      </div>

      {/* Bid History Full Modal */}
      {showBidHistoryModal && selectedTransfer && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setShowBidHistoryModal(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("transfers.bidHistory")}
            className="w-full max-w-md overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-tight border-b border-outline-variant/30 px-panel py-tight">
              <div className="flex items-center gap-tight">
                <AppIcon name="gavel" className="text-sm text-primary" />
                <h3 className="font-label text-kicker font-bold uppercase tracking-[0.14em] text-outline">
                  {t("transfers.bidHistory")}
                </h3>
              </div>
              <button
                type="button"
                aria-label={t("transfers.modal.close")}
                className="rounded-md p-micro text-on-surface-variant transition-colors duration-quick hover:text-on-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                onClick={() => setShowBidHistoryModal(false)}
              >
                <AppIcon name="close" className="text-sm" />
              </button>
            </div>
            <ol className="max-h-[60vh] overflow-y-auto p-panel">
              {selectedTransfer.bidHistory
                .slice()
                .reverse()
                .map((bid, idx) => {
                  const highest = Math.max(
                    ...selectedTransfer.bidHistory.map((b) => b.amount),
                  );
                  const leading = bid.amount === highest;
                  return (
                    <li
                      key={`${bid.timestamp}-${idx}`}
                      className="flex items-center justify-between gap-tight border-b border-outline-variant/20 py-tight last:border-0"
                    >
                      <div className="flex min-w-0 items-center gap-tight">
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md font-headline text-kicker font-black ${
                            leading
                              ? "bg-primary/15 text-primary"
                              : "bg-surface-container-high text-on-surface-variant"
                          }`}
                          aria-hidden="true"
                        >
                          {(bid.teamName || "?").charAt(0).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-micro">
                            <span className="truncate font-body text-label font-semibold text-on-surface">
                              {bid.teamName || t("transfers.notifications.unknown")}
                            </span>
                            {leading ? (
                              <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-px font-label text-kicker font-bold uppercase tracking-wider text-primary">
                                {t("transfers.detail.leading")}
                              </span>
                            ) : null}
                          </span>
                          <span className="block font-label text-kicker text-on-surface-variant">
                            {formatBidTime(bid.timestamp)}
                          </span>
                        </span>
                      </div>
                      <span
                        className={`shrink-0 font-headline text-label font-bold tabular-nums ${
                          leading ? "text-primary" : "text-on-surface-variant"
                        }`}
                      >
                        {formatCurrency(bid.amount)}
                      </span>
                    </li>
                  );
                })}
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
