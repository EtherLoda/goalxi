"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { api, type FinanceTransaction } from "@/lib/api";

interface WeeklyStats {
  // Income
  ticketSales: number;    // TICKET_INCOME
  sponsorships: number;    // SPONSORSHIP
  prizeMoney: number;      // PRIZE_MONEY
  otherIncome: number;     // OTHER_INCOME
  transferIn: number;      // TRANSFER_IN (player sales)
  // Expense
  playerWages: number;    // WAGES
  staffWages: number;      // STAFF_WAGES
  youthTeam: number;       // YOUTH_TEAM
  other: number;           // OTHER_EXPENSE (stadium maintenance, etc)
  transferOut: number;     // TRANSFER_OUT
}

interface WeeklyData {
  week: number;
  income: number;
  expense: number;
}

export default function FinancePage() {
  const t = useTranslations();
  const params = useParams();
  const { user, team, isLoading: authLoading } = useAuth();
  const [balance, setBalance] = useState<number>(0);
  const [lockedCash, setLockedCash] = useState<number>(0);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [allTransactions, setAllTransactions] = useState<FinanceTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [selectedWeek, setSelectedWeek] = useState<number>(1);
  const [availableSeasons, setAvailableSeasons] = useState<number[]>([]);
  const [availableWeeks, setAvailableWeeks] = useState<number[]>([]);

  useEffect(() => {
    if (!team) return;

    setIsLoading(true);

    // Fetch current game state first to use as default
    api.game.getCurrent()
      .then(({ season: currentSeason, week: currentWeek }) => {
        // Fetch all transactions to determine available seasons and weeks
        return api.finance.getTransactions().then(allTxs => ({
          allTxs,
          currentSeason,
          currentWeek,
        }));
      })
      .then(({ allTxs, currentSeason, currentWeek }) => {
        // Get available seasons
        const seasons = [...new Set(allTxs.map(tx => tx.season))].sort((a, b) => a - b);
        setAvailableSeasons(seasons);

        // Get available weeks for the selected season
        const weeks = [...new Set(allTxs.filter(tx => tx.season === currentSeason).map(tx => tx.week))].sort((a, b) => a - b);
        setAvailableWeeks(weeks);

        // Get balance
        return api.finance.getBalance().then(balanceData => ({
          allTxs,
          balanceData,
          currentSeason,
          currentWeek,
          availableSeasons: seasons,
          availableWeeks: weeks,
        }));
      })
      .then(({ allTxs, balanceData, currentSeason, currentWeek, availableSeasons, availableWeeks }) => {
        setBalance(balanceData.balance);
        setLockedCash(balanceData.lockedCash || 0);
        setAllTransactions(allTxs);

        // Default to current game season/week if available, otherwise use first available
        const hasCurrentWeek = availableWeeks.includes(currentWeek);
        const defaultSeason = hasCurrentWeek ? currentSeason : (availableSeasons[0] || 1);
        const defaultWeek = hasCurrentWeek ? currentWeek : (availableWeeks[0] || 1);

        setSelectedSeason(defaultSeason);
        setSelectedWeek(defaultWeek);

        // Filter transactions for initial display
        const filteredTxs = allTxs.filter(tx => tx.season === defaultSeason && tx.week === defaultWeek);
        setTransactions(filteredTxs);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [team]);

  // Update week options when season changes
  useEffect(() => {
    if (allTransactions.length > 0) {
      // Fetch current game week
      api.game.getCurrent().then(({ week: currentWeek }) => {
        const weeks = [...new Set(allTransactions.filter(tx => tx.season === selectedSeason).map(tx => tx.week))].sort((a, b) => a - b);
        setAvailableWeeks(weeks);
        // Prefer current game week if it exists in this season, otherwise keep current or fall back to first
        if (weeks.includes(currentWeek)) {
          setSelectedWeek(currentWeek);
        } else if (!weeks.includes(selectedWeek)) {
          setSelectedWeek(weeks[0] || 1);
        }
      });
    }
  }, [selectedSeason, allTransactions]);

  // Change selected season/week transactions
  useEffect(() => {
    if (allTransactions.length > 0) {
      const filteredTxs = allTransactions.filter(tx =>
        tx.season === selectedSeason && tx.week === selectedWeek
      );
      setTransactions(filteredTxs);
    }
  }, [selectedSeason, selectedWeek, allTransactions]);

  // Calculate weekly stats from transactions
  const calculateWeeklyStats = (txs: FinanceTransaction[]): WeeklyStats => {
    const stats: WeeklyStats = {
      ticketSales: 0,
      sponsorships: 0,
      prizeMoney: 0,
      otherIncome: 0,
      transferIn: 0,
      playerWages: 0,
      staffWages: 0,
      youthTeam: 0,
      other: 0,
      transferOut: 0,
    };

    txs.forEach((tx) => {
      switch (tx.type) {
        case "TICKET_INCOME":
          stats.ticketSales += tx.amount;
          break;
        case "SPONSORSHIP":
          stats.sponsorships += tx.amount;
          break;
        case "PRIZE_MONEY":
          stats.prizeMoney += tx.amount;
          break;
        case "OTHER_INCOME":
          stats.otherIncome += tx.amount;
          break;
        case "TRANSFER_IN":
          stats.transferIn += tx.amount;
          break;
        case "TRANSFER_OUT":
          stats.transferOut += Math.abs(tx.amount);
          break;
        case "WAGES":
          stats.playerWages += Math.abs(tx.amount);
          break;
        case "STAFF_WAGES":
          stats.staffWages += Math.abs(tx.amount);
          break;
        case "YOUTH_TEAM":
          stats.youthTeam += Math.abs(tx.amount);
          break;
        case "OTHER_EXPENSE":
          stats.other += Math.abs(tx.amount);
          break;
      }
    });

    return stats;
  };

  // Generate trend data - always 8 weeks, empty weeks show as empty
  const generateTrendData = (): WeeklyData[] => {
    // Always show 8 weeks (weeks 1-8), fill 0 for empty weeks
    const result: WeeklyData[] = [];
    const season = 1;

    for (let w = 1; w <= 8; w++) {
      const weekTxs = allTransactions.filter(tx =>
        tx.season === season && tx.week === w
      );

      let income = 0;
      let expense = 0;
      weekTxs.forEach(tx => {
        if (tx.amount > 0) income += tx.amount;
        else expense += Math.abs(tx.amount);
      });

      result.push({ week: w, income, expense });
    }

    return result;
  };

  // Filter transactions by selected season AND week
  const seasonTransactions = transactions.filter(tx =>
    tx.season === selectedSeason && tx.week === selectedWeek
  );

  // Calculate last week (previous week data)
  let lastWeek = selectedWeek - 1;
  let lastWeekSeason = selectedSeason;
  if (selectedWeek === 1) {
    lastWeek = 16;
    lastWeekSeason = selectedSeason - 1;
  }
  // Filter last week transactions
  const lastWeekTransactions = lastWeekSeason > 0
    ? allTransactions.filter(tx => tx.season === lastWeekSeason && tx.week === lastWeek)
    : [];

  const thisWeekStats = calculateWeeklyStats(seasonTransactions);
  const lastWeekStats = lastWeekTransactions.length > 0
    ? calculateWeeklyStats(lastWeekTransactions)
    : { ticketSales: 0, sponsorships: 0, prizeMoney: 0, otherIncome: 0, transferIn: 0, playerWages: 0, staffWages: 0, youthTeam: 0, other: 0, transferOut: 0 };
  const trendData = generateTrendData();

  // Calculate averages from real data
  const weeksWithData = trendData.filter(w => w.income > 0 || w.expense > 0);
  const avgWeeklyIncome = weeksWithData.length > 0
    ? weeksWithData.reduce((sum, w) => sum + w.income, 0) / weeksWithData.length
    : 0;
  const avgWeeklyExpense = weeksWithData.length > 0
    ? weeksWithData.reduce((sum, w) => sum + w.expense, 0) / weeksWithData.length
    : 0;
  const projectedNet = (avgWeeklyIncome - avgWeeklyExpense) * 16;

  const formatCurrency = (amount: number): string => {
    if (amount >= 1000000) {
      return `£${(amount / 1000000).toFixed(1)}M`;
    }
    return `£${amount.toLocaleString()}`;
  };

  const formatCurrencyFull = (amount: number): string => {
    return `£${amount.toLocaleString()}`;
  };

  const calculateTotal = (stats: WeeklyStats, isIncome: boolean): number => {
    if (isIncome) {
      return (
        stats.ticketSales +
        stats.sponsorships +
        stats.prizeMoney +
        stats.otherIncome +
        stats.transferIn
      );
    }
    return (
      stats.playerWages +
      stats.staffWages +
      stats.youthTeam +
      stats.other +
      stats.transferOut
    );
  };

  const netGrowth =
    calculateTotal(thisWeekStats, true) - calculateTotal(thisWeekStats, false);
  const lastWeekNet =
    calculateTotal(lastWeekStats, true) - calculateTotal(lastWeekStats, false);
  const growthPercent =
    lastWeekNet > 0 ? ((netGrowth - lastWeekNet) / lastWeekNet) * 100 : 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
          {/* Filter Bar */}
          <div className="flex items-center justify-between mb-8 gap-6">
            {/* Balance Card */}
            <div className="flex gap-4">
              <div className="bg-gradient-to-br from-surface-container to-surface-container-low rounded-2xl p-5 border border-outline-variant/50 shadow-lg">
                <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1 font-bold">
                  Balance
                </div>
                <div className="font-headline text-2xl font-black text-on-surface tracking-tight">
                  {formatCurrencyFull(balance)}
                </div>
              </div>
              <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/30 shadow-inner">
                <div className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-1 font-bold">
                  Available
                </div>
                <div className="font-headline text-2xl font-black text-primary tracking-tight">
                  {formatCurrencyFull(balance - lockedCash)}
                </div>
              </div>
            </div>

            {/* Filters on the right */}
            <div className="flex gap-4">
              <div className="relative">
                <select
                  className="appearance-none bg-surface-container border border-outline-variant/30 text-on-surface font-headline text-sm rounded-xl pl-4 pr-10 py-3 cursor-pointer focus:ring-1 focus:ring-primary/30 transition-all hover:border-primary/50"
                  value={selectedSeason}
                  onChange={(e) => setSelectedSeason(Number(e.target.value))}
                >
                  {availableSeasons.map(s => (
                    <option key={s} value={s}>Season {s}</option>
                  ))}
                </select>
                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-xs text-on-surface-variant">
                  expand_more
                </span>
              </div>
              <div className="relative">
                <select
                  className="appearance-none bg-surface-container border border-outline-variant/30 text-on-surface font-headline text-sm rounded-xl pl-4 pr-10 py-3 cursor-pointer focus:ring-1 focus:ring-primary/30 transition-all hover:border-primary/50"
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(Number(e.target.value))}
                >
                  {availableWeeks.map(w => (
                    <option key={w} value={w}>
                      {w === 16 ? `Week ${w} (Final)` : `Week ${w}`}
                    </option>
                  ))}
                </select>
                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-xs text-on-surface-variant">
                  expand_more
                </span>
              </div>
            </div>
          </div>

          {/* Main Breakdown Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* This Week Card */}
            <section className="glass-panel rounded-xl p-6 border border-white/5">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-headline text-lg font-bold text-primary-fixed tracking-tight uppercase">
                  This Week&apos;s Breakdown
                </h2>
                <div className="px-3 py-1 bg-primary/10 rounded-full">
                  <span className="text-[10px] text-primary font-bold uppercase tracking-widest">
                    Live Sync
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-8">
                {/* Revenue */}
                <div>
                  <h3 className="font-headline text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary-fixed"></span>
                    REVENUE
                  </h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center group">
                      <span className="text-sm text-on-surface/80 group-hover:text-on-surface transition-colors">
                        Ticket Sales
                      </span>
                      <span className="font-headline text-sm font-bold text-on-background">
                        {formatCurrency(thisWeekStats.ticketSales)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center group">
                      <span className="text-sm text-on-surface/80 group-hover:text-on-surface transition-colors">
                        Sponsorships
                      </span>
                      <span className="font-headline text-sm font-bold text-on-background">
                        {formatCurrency(thisWeekStats.sponsorships)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center group">
                      <span className="text-sm text-on-surface/80 group-hover:text-on-surface transition-colors">
                        Prize Money
                      </span>
                      <span className="font-headline text-sm font-bold text-on-background">
                        {formatCurrency(thisWeekStats.prizeMoney)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center group">
                      <span className="text-sm text-on-surface/80 group-hover:text-on-surface transition-colors">
                        Other Income
                      </span>
                      <span className="font-headline text-sm font-bold text-on-background">
                        {formatCurrency(thisWeekStats.otherIncome)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center group">
                      <span className="text-sm text-on-surface/80 group-hover:text-on-surface transition-colors">
                        Transfer In
                      </span>
                      <span className="font-headline text-sm font-bold text-primary-fixed-dim">
                        + {formatCurrency(thisWeekStats.transferIn)}
                      </span>
                    </div>
                    <div className="pt-4 border-t border-outline-variant flex justify-between items-end">
                      <span className="text-xs font-bold text-primary-fixed uppercase">
                        Total
                      </span>
                      <span className="font-headline text-xl font-black text-primary">
                        {formatCurrency(calculateTotal(thisWeekStats, true))}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Operational Costs */}
                <div>
                  <h3 className="font-headline text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-error"></span>
                    OPERATIONAL COSTS
                  </h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center group">
                      <span className="text-sm text-on-surface/80 group-hover:text-on-surface transition-colors">
                        Player Wages
                      </span>
                      <span className="font-headline text-sm font-bold text-on-background">
                        {formatCurrency(thisWeekStats.playerWages)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center group">
                      <span className="text-sm text-on-surface/80 group-hover:text-on-surface transition-colors">
                        Staff Wages
                      </span>
                      <span className="font-headline text-sm font-bold text-on-background">
                        {formatCurrency(thisWeekStats.staffWages)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center group">
                      <span className="text-sm text-on-surface/80 group-hover:text-on-surface transition-colors">
                        Youth Team
                      </span>
                      <span className="font-headline text-sm font-bold text-on-background">
                        {formatCurrency(thisWeekStats.youthTeam)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center group">
                      <span className="text-sm text-on-surface/80 group-hover:text-on-surface transition-colors">
                        Other
                      </span>
                      <span className="font-headline text-sm font-bold text-on-background">
                        {formatCurrency(thisWeekStats.other)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center group">
                      <span className="text-sm text-on-surface/80 group-hover:text-on-surface transition-colors">
                        Transfer Out
                      </span>
                      <span className="font-headline text-sm font-bold text-on-background">
                        {formatCurrency(thisWeekStats.transferOut)}
                      </span>
                    </div>
                    <div className="pt-4 border-t border-outline-variant flex justify-between items-end">
                      <span className="text-xs font-bold text-error uppercase">
                        Total
                      </span>
                      <span className="font-headline text-xl font-black text-error">
                        {formatCurrency(calculateTotal(thisWeekStats, false))}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Last Week Card */}
            <section className="bg-surface-container rounded-xl p-6 relative overflow-hidden">
              {/* Faded Background Graph Decor */}
              <div className="absolute inset-0 opacity-5 pointer-events-none bg-gradient-to-t from-primary/20 to-transparent" />
              <div className="flex justify-between items-center mb-6 relative z-10">
                <h2 className="font-headline text-lg font-bold text-on-surface/60 tracking-tight uppercase">
                  Last Week&apos;s Breakdown
                </h2>
                <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-tighter">
                  <span className="material-symbols-outlined text-sm">
                    trending_up
                  </span>
                  {growthPercent >= 0 ? "+" : ""}
                  {growthPercent.toFixed(0)}% Net Growth
                </div>
              </div>
              <div className="grid grid-cols-2 gap-8 relative z-10 opacity-70">
                {/* Revenue */}
                <div>
                  <h3 className="font-headline text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest mb-4">
                    REVENUE
                  </h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Ticket Sales</span>
                      <span className="font-headline text-sm">
                        {formatCurrency(lastWeekStats.ticketSales)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Sponsorships</span>
                      <span className="font-headline text-sm">
                        {formatCurrency(lastWeekStats.sponsorships)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Prize Money</span>
                      <span className="font-headline text-sm">
                        {formatCurrency(lastWeekStats.prizeMoney)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Other Income</span>
                      <span className="font-headline text-sm">
                        {formatCurrency(lastWeekStats.otherIncome)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Transfer In</span>
                      <span className="font-headline text-sm">
                        {formatCurrency(lastWeekStats.transferIn)}
                      </span>
                    </div>
                    <div className="pt-4 border-t border-outline-variant/30 flex justify-between items-end">
                      <span className="text-xs font-bold">Total</span>
                      <span className="font-headline text-lg font-bold">
                        {formatCurrency(calculateTotal(lastWeekStats, true))}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Operational Costs */}
                <div>
                  <h3 className="font-headline text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest mb-4">
                    OPERATIONAL COSTS
                  </h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Player Wages</span>
                      <span className="font-headline text-sm">
                        {formatCurrency(lastWeekStats.playerWages)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Staff Wages</span>
                      <span className="font-headline text-sm">
                        {formatCurrency(lastWeekStats.staffWages)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Youth Team</span>
                      <span className="font-headline text-sm">
                        {formatCurrency(lastWeekStats.youthTeam)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Other</span>
                      <span className="font-headline text-sm">
                        {formatCurrency(lastWeekStats.other)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Transfer Out</span>
                      <span className="font-headline text-sm">
                        {formatCurrency(lastWeekStats.transferOut)}
                      </span>
                    </div>
                    <div className="pt-4 border-t border-outline-variant/30 flex justify-between items-end">
                      <span className="text-xs font-bold">Total</span>
                      <span className="font-headline text-lg font-bold">
                        {formatCurrency(calculateTotal(lastWeekStats, false))}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Bottom Section: Trend Chart */}
          <section className="glass-panel rounded-xl p-8 border border-white/5">
            <div className="flex justify-between items-end mb-10">
              <div>
                <h2 className="font-headline text-xl font-black text-on-surface tracking-tight uppercase">
                  Financial Trend (Last 8 Weeks)
                </h2>
                <p className="text-sm text-on-surface-variant mt-1">
                  Cash flow analysis and historical expenditure projections
                </p>
              </div>
              <div className="flex gap-6">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm bg-primary shadow-[0_0_8px_rgba(0,228,121,0.5)]"></span>
                  <span className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                    Income
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm bg-error/70"></span>
                  <span className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                    Expenditure
                  </span>
                </div>
              </div>
            </div>

            {/* Custom Bar Chart UI - Fixed 1/8 width per week */}
            <div className="h-72 flex items-end justify-between gap-3 px-2">
              {trendData.map((data) => {
                const hasData = data.income > 0 || data.expense > 0;
                // Scale based on max value among weeks with data
                const maxAmongWeeksWithData = Math.max(...trendData.map(w => Math.max(w.income, w.expense)));
                const scale = maxAmongWeeksWithData > 0 ? 220 / maxAmongWeeksWithData : 1;
                const incomeHeight = hasData ? Math.max(4, Math.round(data.income * scale)) : 0;
                const expenseHeight = hasData ? Math.max(4, Math.round(data.expense * scale)) : 0;
                const isCurrentWeek = data.week === selectedWeek;

                return (
                  <div
                    key={data.week}
                    className="w-1/8 flex flex-col items-center"
                  >
                    {/* Values above bars */}
                    <div
                      className="w-full flex justify-center items-end gap-1 mb-2"
                      style={{ height: "220px" }}
                    >
                      <div className="flex flex-col items-center">
                        {hasData && (
                          <span
                            className={`text-[9px] font-headline font-bold mb-1 ${isCurrentWeek ? "text-primary" : "text-on-surface/60"}`}
                          >
                            {data.income >= 1000000 ? `£${(data.income / 1000000).toFixed(1)}M` : `£${(data.income / 1000).toFixed(0)}K`}
                          </span>
                        )}
                        <div
                          className={`w-6 rounded-t-sm transition-all duration-300 ${
                            hasData
                              ? isCurrentWeek
                                ? "bg-primary shadow-[0_0_12px_rgba(0,228,121,0.6)]"
                                : "bg-gradient-to-t from-primary/80 to-primary/40"
                              : "bg-transparent"
                          }`}
                          style={{ height: `${incomeHeight}px` }}
                        ></div>
                      </div>
                      <div className="flex flex-col items-center">
                        {hasData && (
                          <span className="text-[9px] font-headline font-bold mb-1 text-error/70">
                            {data.expense >= 1000000 ? `£${(data.expense / 1000000).toFixed(1)}M` : `£${(data.expense / 1000).toFixed(0)}K`}
                          </span>
                        )}
                        <div
                          className={`w-6 rounded-t-sm ${hasData ? "bg-gradient-to-t from-error/80 to-error/40" : "bg-transparent"}`}
                          style={{ height: `${expenseHeight}px` }}
                        ></div>
                      </div>
                    </div>
                    {/* Week label */}
                    <span
                      className={`text-[11px] font-headline font-bold px-2 py-1 rounded-t-sm ${
                        isCurrentWeek
                          ? "bg-primary/20 text-primary"
                          : "text-on-surface-variant"
                      }`}
                    >
                      W{data.week.toString().padStart(2, "0")}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Stats Summary */}
            <div className="mt-6 flex justify-between items-center bg-surface-container-low p-4 rounded-xl">
              <div className="flex gap-12">
                <div>
                  <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">
                    Avg. Weekly Income
                  </p>
                  <p className="font-headline font-bold text-on-surface text-lg">
                    {avgWeeklyIncome >= 1000000 ? `£${(avgWeeklyIncome / 1000000).toFixed(1)}M` : `£${(avgWeeklyIncome / 1000).toFixed(0)}K`}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">
                    Avg. Weekly Expense
                  </p>
                  <p className="font-headline font-bold text-on-surface text-lg">
                    {avgWeeklyExpense >= 1000000 ? `£${(avgWeeklyExpense / 1000000).toFixed(1)}M` : `£${(avgWeeklyExpense / 1000).toFixed(0)}K`}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">
                    Projected Season End
                  </p>
                  <p className={`font-headline font-bold text-lg ${projectedNet >= 0 ? "text-primary" : "text-error"}`}>
                    {projectedNet >= 0 ? "+" : ""}{projectedNet >= 1000000 ? `£${(projectedNet / 1000000).toFixed(1)}M` : `£${(projectedNet / 1000).toFixed(0)}K`}
                  </p>
                </div>
              </div>
              <button className="bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest py-2 px-4 rounded-lg hover:text-on-surface transition-colors">
                View Detailed History
              </button>
            </div>
          </section>
        </div>
  );
}
