'use client';

import { useEffect, useState, useMemo } from 'react';
import { api, Transaction, FinanceState } from '@/lib/api';
import {
    TrendingUp,
    TrendingDown,
    DollarSign,
    ArrowLeft,
    Calendar,
    Receipt,
    Trophy,
    Users,
    Activity,
    Landmark,
    Filter,
    X,
    AlertTriangle,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Skeleton } from '@/components/ui/SkeletonLoader';

type TransactionType = 'MATCH_INCOME' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'WAGES' | 'SPONSORSHIP' | 'OTHER_EXPENSE' | 'OTHER_INCOME' | 'ALL';

const TRANSACTION_TYPES: { value: TransactionType; label: string }[] = [
    { value: 'ALL', label: 'All Types' },
    { value: 'MATCH_INCOME', label: 'Match Income' },
    { value: 'TRANSFER_IN', label: 'Transfer In' },
    { value: 'TRANSFER_OUT', label: 'Transfer Out' },
    { value: 'WAGES', label: 'Wages' },
    { value: 'SPONSORSHIP', label: 'Sponsorship' },
    { value: 'OTHER_EXPENSE', label: 'Other Expense' },
    { value: 'OTHER_INCOME', label: 'Other Income' },
];

const ITEMS_PER_PAGE = 10;
const BUDGET_WARNING_THRESHOLD = 1000000; // £1M warning threshold

export default function FinancePage() {
    const [finance, setFinance] = useState<FinanceState | null>(null);
    const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Filters
    const [selectedType, setSelectedType] = useState<TransactionType>('ALL');
    const [selectedSeason, setSelectedSeason] = useState<number | 'ALL'>('ALL');
    const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
    
    // Pagination
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        const fetchFinanceData = async () => {
            setLoading(true);
            try {
                const results = await Promise.allSettled([
                    api.getFinanceBalance(),
                    api.getTransactions()
                ]);

                const [balanceRes, transactionsRes] = results;

                if (balanceRes.status === 'fulfilled') {
                    setFinance(balanceRes.value);
                }

                if (transactionsRes.status === 'fulfilled') {
                    setAllTransactions(transactionsRes.value);
                }
            } catch (error) {
                console.error('Failed to fetch finance data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchFinanceData();
    }, []);

    // Filter transactions
    const filteredTransactions = useMemo(() => {
        let filtered = [...allTransactions];

        // Filter by type
        if (selectedType !== 'ALL') {
            filtered = filtered.filter(tx => tx.type === selectedType);
        }

        // Filter by season
        if (selectedSeason !== 'ALL') {
            filtered = filtered.filter(tx => tx.season === selectedSeason);
        }

        // Filter by date range
        if (dateRange.start) {
            const startDate = new Date(dateRange.start);
            filtered = filtered.filter(tx => new Date(tx.createdAt) >= startDate);
        }
        if (dateRange.end) {
            const endDate = new Date(dateRange.end);
            endDate.setHours(23, 59, 59, 999); // End of day
            filtered = filtered.filter(tx => new Date(tx.createdAt) <= endDate);
        }

        return filtered;
    }, [allTransactions, selectedType, selectedSeason, dateRange]);

    // Pagination
    const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE);
    const paginatedTransactions = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;
        return filteredTransactions.slice(start, end);
    }, [filteredTransactions, currentPage]);

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [selectedType, selectedSeason, dateRange]);

    // Calculate statistics
    const stats = useMemo(() => {
        const income = filteredTransactions.filter(t => t.amount > 0).reduce((acc, curr) => acc + curr.amount, 0);
        const expense = filteredTransactions.filter(t => t.amount < 0).reduce((acc, curr) => acc + Math.abs(curr.amount), 0);
        const net = income - expense;
        
        // Group by month for chart
        const monthlyData = filteredTransactions.reduce((acc, tx) => {
            const date = new Date(tx.createdAt);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!acc[monthKey]) {
                acc[monthKey] = { income: 0, expense: 0 };
            }
            if (tx.amount > 0) {
                acc[monthKey].income += tx.amount;
            } else {
                acc[monthKey].expense += Math.abs(tx.amount);
            }
            return acc;
        }, {} as Record<string, { income: number; expense: number }>);

        const chartData = Object.entries(monthlyData)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-6) // Last 6 months
            .map(([month, data]) => ({
                month: new Date(month + '-01').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
                income: data.income,
                expense: data.expense,
            }));

        return { income, expense, net, chartData };
    }, [filteredTransactions]);

    // Get available seasons
    const availableSeasons = useMemo(() => {
        const seasons = [...new Set(allTransactions.map(tx => tx.season))].sort((a, b) => b - a);
        return seasons;
    }, [allTransactions]);

    // Budget warning
    const showBudgetWarning = finance && finance.balance < BUDGET_WARNING_THRESHOLD;
    const budgetWarningLevel = finance && finance.balance < BUDGET_WARNING_THRESHOLD / 2 ? 'critical' : 'warning';

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-GB', {
            style: 'currency',
            currency: 'GBP',
            maximumFractionDigits: 0
        }).format(amount);
    };

    const getTransactionIcon = (type: string, amount: number) => {
        const isPositive = amount > 0;
        switch (type) {
            case 'MATCH_INCOME': return <Trophy className={isPositive ? "text-emerald-500" : "text-rose-500"} size={18} />;
            case 'WAGES': return <Users className="text-rose-500" size={18} />;
            case 'TRANSFER_IN': return <TrendingDown className="text-rose-500" size={18} />;
            case 'TRANSFER_OUT': return <TrendingUp className="text-emerald-500" size={18} />;
            case 'SPONSORSHIP': return <DollarSign className="text-emerald-500" size={18} />;
            case 'OTHER_EXPENSE': return <Activity className="text-rose-500" size={18} />;
            case 'OTHER_INCOME': return <Activity className="text-emerald-500" size={18} />;
            default: return <Receipt className="text-slate-400" size={18} />;
        }
    };

    const clearFilters = () => {
        setSelectedType('ALL');
        setSelectedSeason('ALL');
        setDateRange({ start: '', end: '' });
    };

    const hasActiveFilters = selectedType !== 'ALL' || selectedSeason !== 'ALL' || dateRange.start || dateRange.end;

    if (loading) {
        return (
            <div className="container mx-auto px-4 py-8 space-y-8">
                <Skeleton className="h-12 w-64" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Skeleton className="h-32 rounded-2xl" />
                    <Skeleton className="h-32 rounded-2xl" />
                    <Skeleton className="h-32 rounded-2xl" />
                </div>
                <Skeleton className="h-[400px] w-full rounded-2xl" />
            </div>
        );
    }

    const maxChartValue = Math.max(
        ...stats.chartData.map(d => Math.max(d.income, d.expense)),
        1000000 // Minimum scale
    );

    return (
        <div className="container mx-auto px-4 py-8 max-w-6xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <Link href="/club" className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm mb-2 hover:translate-x-[-4px] transition-transform">
                        <ArrowLeft size={16} /> BACK TO CLUB
                    </Link>
                    <h1 className="text-4xl md:text-5xl font-black italic tracking-tighter text-emerald-900 dark:text-white">
                        FINANCE
                    </h1>
                </div>
                <div className="hidden md:block">
                    <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 font-bold text-sm flex items-center gap-2">
                        <Landmark size={18} /> Elite League Certified
                    </div>
                </div>
            </div>

            {/* Budget Warning */}
            {showBudgetWarning && (
                <div className={clsx(
                    "mb-6 p-4 rounded-xl border-2 flex items-start gap-3",
                    budgetWarningLevel === 'critical'
                        ? "bg-rose-500/10 border-rose-500/50 text-rose-700 dark:text-rose-400"
                        : "bg-amber-500/10 border-amber-500/50 text-amber-700 dark:text-amber-400"
                )}>
                    <AlertTriangle size={20} className="flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <div className="font-black text-sm uppercase tracking-wider mb-1">
                            {budgetWarningLevel === 'critical' ? 'Critical Budget Alert' : 'Budget Warning'}
                        </div>
                        <div className="text-xs">
                            Your balance is below {formatCurrency(BUDGET_WARNING_THRESHOLD)}. 
                            {budgetWarningLevel === 'critical' && ' Consider reducing expenses or increasing income sources.'}
                        </div>
                    </div>
                </div>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {/* Balance Card */}
                <div className={clsx(
                    "relative overflow-hidden group p-6 rounded-2xl border-2 shadow-xl transition-all",
                    showBudgetWarning && budgetWarningLevel === 'critical'
                        ? "bg-rose-500/10 border-rose-500/40 shadow-rose-500/5"
                        : showBudgetWarning
                        ? "bg-amber-500/10 border-amber-500/40 shadow-amber-500/5"
                        : "bg-white dark:bg-emerald-950/20 border-emerald-500/40 shadow-emerald-500/5"
                )}>
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                        <DollarSign size={80} className={showBudgetWarning ? "text-rose-500" : "text-emerald-500"} />
                    </div>
                    <div className={clsx(
                        "text-xs font-bold uppercase tracking-widest mb-2",
                        showBudgetWarning ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"
                    )}>
                        Current Balance
                    </div>
                    <div className={clsx(
                        "text-4xl font-black italic",
                        showBudgetWarning ? "text-rose-900 dark:text-rose-300" : "text-emerald-900 dark:text-white"
                    )}>
                        {formatCurrency(finance?.balance || 0)}
                    </div>
                </div>

                {/* Income Card */}
                <div className="p-6 rounded-2xl bg-white dark:bg-black/40 border border-emerald-900/20">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                        <TrendingUp size={14} className="text-emerald-500" /> Total Income
                    </div>
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(stats.income)}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                        {filteredTransactions.length} transactions
                    </div>
                </div>

                {/* Expense Card */}
                <div className="p-6 rounded-2xl bg-white dark:bg-black/40 border border-emerald-900/20">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                        <TrendingDown size={14} className="text-rose-500" /> Total Expenses
                    </div>
                    <div className="text-2xl font-bold text-rose-500">
                        {formatCurrency(stats.expense)}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                        Net: {formatCurrency(stats.net)}
                    </div>
                </div>
            </div>

            {/* Trend Chart */}
            {stats.chartData.length > 0 && (
                <div className="mb-8 p-6 rounded-2xl bg-white dark:bg-black/40 border border-emerald-900/20">
                    <h3 className="text-lg font-black italic text-slate-900 dark:text-white mb-4 uppercase tracking-tight">
                        Financial Trends (Last 6 Months)
                    </h3>
                    <div className="space-y-3">
                        {stats.chartData.map((data, index) => (
                            <div key={index} className="space-y-1">
                                <div className="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                                    <span>{data.month}</span>
                                    <span className="text-emerald-600 dark:text-emerald-400">
                                        Net: {formatCurrency(data.income - data.expense)}
                                    </span>
                                </div>
                                <div className="flex gap-2 h-6">
                                    {/* Income Bar */}
                                    <div className="flex-1 relative bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
                                        <div
                                            className="h-full bg-emerald-500 flex items-center justify-end pr-2 transition-all"
                                            style={{ width: `${(data.income / maxChartValue) * 100}%` }}
                                        >
                                            {data.income > maxChartValue * 0.1 && (
                                                <span className="text-[9px] font-black text-white">
                                                    {formatCurrency(data.income)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {/* Expense Bar */}
                                    <div className="flex-1 relative bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
                                        <div
                                            className="h-full bg-rose-500 flex items-center justify-end pr-2 transition-all"
                                            style={{ width: `${(data.expense / maxChartValue) * 100}%` }}
                                        >
                                            {data.expense > maxChartValue * 0.1 && (
                                                <span className="text-[9px] font-black text-white">
                                                    {formatCurrency(data.expense)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2 text-[9px] text-slate-500">
                                    <span className="flex-1">Income</span>
                                    <span className="flex-1 text-right">Expense</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="mb-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/30 border border-emerald-500/20">
                <div className="flex items-center gap-2 mb-4">
                    <Filter size={16} className="text-emerald-500" />
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider">
                        Filters
                    </h3>
                    {hasActiveFilters && (
                        <button
                            onClick={clearFilters}
                            className="ml-auto flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                        >
                            <X size={12} /> Clear All
                        </button>
                    )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Type Filter */}
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">
                            Transaction Type
                        </label>
                        <select
                            value={selectedType}
                            onChange={(e) => setSelectedType(e.target.value as TransactionType)}
                            className="w-full px-3 py-2 text-sm bg-white dark:bg-black/20 border border-emerald-500/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 font-medium"
                        >
                            {TRANSACTION_TYPES.map(type => (
                                <option key={type.value} value={type.value}>{type.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Season Filter */}
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">
                            Season
                        </label>
                        <select
                            value={selectedSeason}
                            onChange={(e) => setSelectedSeason(e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value))}
                            className="w-full px-3 py-2 text-sm bg-white dark:bg-black/20 border border-emerald-500/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 font-medium"
                        >
                            <option value="ALL">All Seasons</option>
                            {availableSeasons.map(season => (
                                <option key={season} value={season}>Season {season}</option>
                            ))}
                        </select>
                    </div>

                    {/* Date Range */}
                    <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">
                            Date Range
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="date"
                                value={dateRange.start}
                                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                className="flex-1 px-3 py-2 text-sm bg-white dark:bg-black/20 border border-emerald-500/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                            />
                            <input
                                type="date"
                                value={dateRange.end}
                                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                className="flex-1 px-3 py-2 text-sm bg-white dark:bg-black/20 border border-emerald-500/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Transactions List */}
            <div className="rounded-2xl border bg-white border-emerald-500/40 dark:bg-black/40 dark:border-emerald-500/10 overflow-hidden">
                <div className="px-6 py-4 border-b border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-900/10 flex items-center justify-between">
                    <h3 className="font-bold text-emerald-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                        <Receipt size={18} className="text-emerald-500" /> Transactions
                    </h3>
                    <div className="text-xs font-mono text-slate-500">
                        Showing {paginatedTransactions.length} of {filteredTransactions.length}
                    </div>
                </div>

                <div className="divide-y divide-emerald-100 dark:divide-emerald-900/20">
                    {paginatedTransactions.length === 0 ? (
                        <div className="p-12 text-center text-slate-500 italic">
                            No transactions found matching your filters.
                        </div>
                    ) : (
                        paginatedTransactions.map((tx) => (
                            <div key={tx.id} className="p-4 md:p-6 flex items-center justify-between hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                        {getTransactionIcon(tx.type, tx.amount)}
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                                            {tx.type.replace(/_/g, ' ')}
                                        </div>
                                        <div className="flex items-center gap-3 text-[10px] font-medium text-slate-500 uppercase tracking-widest">
                                            <span className="flex items-center gap-1"><Calendar size={10} /> {new Date(tx.createdAt).toLocaleDateString()}</span>
                                            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-emerald-900/20">S{tx.season}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className={clsx(
                                    "text-lg font-black italic",
                                    tx.amount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"
                                )}>
                                    {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="px-6 py-4 border-t border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-900/10 flex items-center justify-between">
                        <div className="text-xs font-medium text-slate-500">
                            Page {currentPage} of {totalPages}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className={clsx(
                                    "p-2 rounded-lg border transition-all",
                                    currentPage === 1
                                        ? "border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed"
                                        : "border-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                                )}
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className={clsx(
                                    "p-2 rounded-lg border transition-all",
                                    currentPage === totalPages
                                        ? "border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed"
                                        : "border-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                                )}
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
