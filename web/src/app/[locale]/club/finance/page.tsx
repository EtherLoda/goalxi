"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { api, type FinanceTransaction } from "@/lib/api";

interface WeeklyStats {
  ticketSales: number;
  merchandising: number;
  tvRights: number;
  sponsorships: number;
  playerSales: number;
  playerWages: number;
  staffWages: number;
  maintenance: number;
  transferFees: number;
  taxes: number;
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
  const [selectedSeason, setSelectedSeason] = useState<number>(4);
  const [selectedWeek, setSelectedWeek] = useState<number>(12);

  const SEASONS = [1, 2, 3, 4];
  const WEEKS_PER_SEASON = 16;

  useEffect(() => {
    if (!team) return;

    setIsLoading(true);
    // First get current game state (season and week)
    api.game.getCurrent()
      .then(({ season, week }) => {
        // Then fetch transactions for all seasons and the current game state
        return Promise.all([
          api.finance.getBalance(),
          api.finance.getTransactions({ season: 1 }),
          api.finance.getTransactions({ season: 2 }),
          api.finance.getTransactions({ season: 3 }),
          api.finance.getTransactions({ season: 4 }),
        ]).then(([balanceData, s1, s2, s3, s4]) => ({
          balanceData,
          s1, s2, s3, s4,
          season,
          week,
        }));
      })
      .then(({ balanceData, s1, s2, s3, s4, season, week }) => {
        setBalance(balanceData.balance);
        setLockedCash(balanceData.lockedCash || 0);
        setAllTransactions([...s1, ...s2, ...s3, ...s4]);
        setSelectedSeason(season);
        setSelectedWeek(week);
        // Set transactions for current season
        const seasonTxs = [s1, s2, s3, s4][season - 1] || [];
        setTransactions(seasonTxs);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [team]);

  // Change selected season transactions
  useEffect(() => {
    if (allTransactions.length > 0) {
      const seasonTxs = allTransactions.filter(tx => tx.season === selectedSeason);
      setTransactions(seasonTxs);
    }
  }, [selectedSeason, allTransactions]);

  // Calculate weekly stats from transactions
  const calculateWeeklyStats = (txs: FinanceTransaction[]): WeeklyStats => {
    const stats: WeeklyStats = {
      ticketSales: 0,
      merchandising: 0,
      tvRights: 0,
      sponsorships: 0,
      playerSales: 0,
      playerWages: 0,
      staffWages: 0,
      maintenance: 0,
      transferFees: 0,
      taxes: 0,
    };

    txs.forEach((tx) => {
      switch (tx.type) {
        case "TICKET_INCOME":
          stats.ticketSales += tx.amount;
          break;
        case "SPONSORSHIP":
          stats.sponsorships += tx.amount;
          break;
        case "TRANSFER_IN":
          stats.playerSales += tx.amount;
          break;
        case "TRANSFER_OUT":
          stats.transferFees += Math.abs(tx.amount);
          break;
        case "WAGES":
          stats.playerWages += Math.abs(tx.amount);
          break;
        case "STAFF_WAGES":
          stats.staffWages += Math.abs(tx.amount);
          break;
        case "STADIUM_MAINTENANCE":
          stats.maintenance += Math.abs(tx.amount);
          break;
      }
    });

    return stats;
  };

  // Generate trend data from real transactions
  const generateTrendData = (): WeeklyData[] => {
    if (allTransactions.length === 0) {
      // Return realistic mock data matching seed data scale
      return [
        { week: 5, income: 225000, expense: 131000 },
        { week: 6, income: 248000, expense: 142000 },
        { week: 7, income: 198000, expense: 158000 },
        { week: 8, income: 265000, expense: 113000 },
        { week: 9, income: 218000, expense: 134000 },
        { week: 10, income: 289000, expense: 124000 },
        { week: 11, income: 227000, expense: 147000 },
        { week: 12, income: 248000, expense: 131000 },
      ];
    }

    // Group transactions by season and week
    const season = 4;
    const weeks: WeeklyData[] = [];

    for (let w = 5; w <= 12; w++) {
      const weekTxs = allTransactions.filter(tx => {
        // Simple week extraction from description "Week X ..."
        const match = tx.description?.match(/Week (\d+)/);
        return match && parseInt(match[1]) === w && tx.season === season;
      });

      let income = 0;
      let expense = 0;
      weekTxs.forEach(tx => {
        if (tx.amount > 0) income += tx.amount;
        else expense += Math.abs(tx.amount);
      });

      // If no real data for this week, use mock
      if (income === 0 && expense === 0) {
        const mockData: Record<number, { income: number; expense: number }> = {
          5: { income: 18400000, expense: 11200000 },
          6: { income: 21500000, expense: 9500000 },
          7: { income: 12800000, expense: 15800000 },
          8: { income: 24000000, expense: 6300000 },
          9: { income: 19800000, expense: 8400000 },
          10: { income: 26500000, expense: 7400000 },
          11: { income: 18200000, expense: 13700000 },
          12: { income: 20770500, expense: 10740000 },
        };
        income = mockData[w].income;
        expense = mockData[w].expense;
      }

      weeks.push({ week: w, income, expense });
    }

    return weeks;
  };

  // Filter transactions by selected week
  const weekTransactions = transactions.filter(tx => {
    const match = tx.description?.match(/Week (\d+)/);
    return match && parseInt(match[1]) === selectedWeek;
  });

  // Calculate last week (previous week data)
  let lastWeek = selectedWeek - 1;
  let lastWeekSeason = selectedSeason;
  if (selectedWeek === 1) {
    lastWeek = 16;
    lastWeekSeason = selectedSeason - 1;
  }
  // Filter last week transactions from allTransactions
  const lastWeekTransactions = lastWeekSeason > 0
    ? allTransactions.filter(tx => {
        const match = tx.description?.match(/Week (\d+)/);
        return match && parseInt(match[1]) === lastWeek && tx.season === lastWeekSeason;
      })
    : [];

  const thisWeekStats = calculateWeeklyStats(weekTransactions);
  const lastWeekStats = lastWeekTransactions.length > 0
    ? calculateWeeklyStats(lastWeekTransactions)
    : { ticketSales: 0, merchandising: 0, tvRights: 0, sponsorships: 0, playerSales: 0, playerWages: 0, staffWages: 0, maintenance: 0, transferFees: 0, taxes: 0 };
  const trendData = generateTrendData();

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
        stats.tvRights +
        stats.merchandising +
        stats.sponsorships +
        stats.playerSales +
        stats.ticketSales
      );
    }
    return (
      stats.playerWages +
      stats.staffWages +
      stats.maintenance +
      stats.transferFees +
      stats.taxes
    );
  };

  const netGrowth =
    calculateTotal(thisWeekStats, true) - calculateTotal(thisWeekStats, false);
  const lastWeekNet =
    calculateTotal(lastWeekStats, true) - calculateTotal(lastWeekStats, false);
  const growthPercent =
    lastWeekNet > 0 ? ((netGrowth - lastWeekNet) / lastWeekNet) * 100 : 0;

  // For bar chart scaling
  const maxValue = Math.max(
    ...trendData.map((d) => Math.max(d.income, d.expense)),
  );

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
                  {SEASONS.map(s => (
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
                  {Array.from({ length: WEEKS_PER_SEASON }, (_, i) => i + 1).map(w => (
                    <option key={w} value={w}>
                      {w === WEEKS_PER_SEASON ? `Week ${w} (Final)` : `Week ${w}`}
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
                        Merchandising
                      </span>
                      <span className="font-headline text-sm font-bold text-on-background">
                        {formatCurrency(thisWeekStats.merchandising)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center group">
                      <span className="text-sm text-on-surface/80 group-hover:text-on-surface transition-colors">
                        TV Rights
                      </span>
                      <span className="font-headline text-sm font-bold text-on-background">
                        {formatCurrency(thisWeekStats.tvRights)}
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
                        Player Sales
                      </span>
                      <span className="font-headline text-sm font-bold text-primary-fixed-dim">
                        + {formatCurrency(thisWeekStats.playerSales)}
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
                        Maintenance
                      </span>
                      <span className="font-headline text-sm font-bold text-on-background">
                        {formatCurrency(thisWeekStats.maintenance)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center group">
                      <span className="text-sm text-on-surface/80 group-hover:text-on-surface transition-colors">
                        Transfer Fees
                      </span>
                      <span className="font-headline text-sm font-bold text-on-background">
                        {formatCurrency(thisWeekStats.transferFees)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center group">
                      <span className="text-sm text-on-surface/80 group-hover:text-on-surface transition-colors">
                        Taxes
                      </span>
                      <span className="font-headline text-sm font-bold text-on-background">
                        {formatCurrency(thisWeekStats.taxes)}
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
                      <span className="text-sm">Merchandising</span>
                      <span className="font-headline text-sm">
                        {formatCurrency(lastWeekStats.merchandising)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">TV Rights</span>
                      <span className="font-headline text-sm">
                        {formatCurrency(lastWeekStats.tvRights)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Sponsorships</span>
                      <span className="font-headline text-sm">
                        {formatCurrency(lastWeekStats.sponsorships)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Player Sales</span>
                      <span className="font-headline text-sm">
                        {formatCurrency(lastWeekStats.playerSales)}
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
                      <span className="text-sm">Maintenance</span>
                      <span className="font-headline text-sm">
                        {formatCurrency(lastWeekStats.maintenance)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Transfer Fees</span>
                      <span className="font-headline text-sm">
                        {formatCurrency(lastWeekStats.transferFees)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Taxes</span>
                      <span className="font-headline text-sm">
                        {formatCurrency(lastWeekStats.taxes)}
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

            {/* Custom Bar Chart UI */}
            <div className="h-72 flex items-end justify-between gap-3 px-2">
              {trendData.map((data, idx) => {
                const isCurrentWeek = data.week === 12;
                // Dynamic heights based on actual data values (max ~220px)
                const scale = maxValue > 0 ? 220 / maxValue : 1;
                const incomeHeight = Math.max(4, Math.round(data.income * scale));
                const expenseHeight = Math.max(4, Math.round(data.expense * scale));
                // Format numbers for display
                const formatBarValue = (val: number) => {
                  if (val >= 1000000) return `£${(val / 1000000).toFixed(1)}M`;
                  if (val >= 1000) return `£${(val / 1000).toFixed(0)}K`;
                  return `£${val}`;
                };

                return (
                  <div
                    key={data.week}
                    className="flex-1 flex flex-col items-center"
                  >
                    {/* Values above bars */}
                    <div
                      className="w-full flex justify-center items-end gap-1 mb-2"
                      style={{ height: "220px" }}
                    >
                      <div className="flex flex-col items-center">
                        <span
                          className={`text-[9px] font-headline font-bold mb-1 ${isCurrentWeek ? "text-primary" : "text-on-surface/60"}`}
                        >
                          {formatBarValue(data.income)}
                        </span>
                        <div
                          className={`w-6 rounded-t-sm transition-all duration-300 ${
                            isCurrentWeek
                              ? "bg-primary shadow-[0_0_12px_rgba(0,228,121,0.6)]"
                              : "bg-gradient-to-t from-primary/80 to-primary/40"
                          }`}
                          style={{ height: `${incomeHeight}px` }}
                        ></div>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] font-headline font-bold mb-1 text-error/70">
                          {formatBarValue(data.expense)}
                        </span>
                        <div
                          className="w-6 bg-gradient-to-t from-error/80 to-error/40 rounded-t-sm"
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
                    £18.4M
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">
                    Avg. Weekly Expense
                  </p>
                  <p className="font-headline font-bold text-on-surface text-lg">
                    £11.2M
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">
                    Projected Year End
                  </p>
                  <p className="font-headline font-bold text-primary text-lg">
                    +£244.1M
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
