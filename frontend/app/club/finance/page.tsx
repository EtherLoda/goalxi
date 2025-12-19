'use client';

import { useEffect, useState } from 'react';
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
    Landmark
} from 'lucide-react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Skeleton } from '@/components/ui/SkeletonLoader';

export default function FinancePage() {
    const [finance, setFinance] = useState<FinanceState | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);

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
                    setTransactions(transactionsRes.value);
                }
            } catch (error) {
                console.error('Failed to fetch finance data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchFinanceData();
    }, []);

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
            case 'FACILITY_UPGRADE': return <Activity className="text-rose-500" size={18} />;
            default: return <Receipt className="text-slate-400" size={18} />;
        }
    };

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

    const totalIncome = transactions.filter(t => t.amount > 0).reduce((acc, curr) => acc + curr.amount, 0);
    const totalExpense = transactions.filter(t => t.amount < 0).reduce((acc, curr) => acc + Math.abs(curr.amount), 0);

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

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                {/* Balance Card */}
                <div className="relative overflow-hidden group p-6 rounded-2xl bg-white dark:bg-emerald-950/20 border-2 border-emerald-500/40 shadow-xl shadow-emerald-500/5">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                        <DollarSign size={80} className="text-emerald-500" />
                    </div>
                    <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-2">Current Balance</div>
                    <div className="text-4xl font-black italic text-emerald-900 dark:text-white">
                        {formatCurrency(finance?.balance || 0)}
                    </div>
                </div>

                {/* Income Card */}
                <div className="p-6 rounded-2xl bg-white dark:bg-black/40 border border-emerald-900/20">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                        <TrendingUp size={14} className="text-emerald-500" /> Total Income
                    </div>
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(totalIncome)}
                    </div>
                </div>

                {/* Expense Card */}
                <div className="p-6 rounded-2xl bg-white dark:bg-black/40 border border-emerald-900/20">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                        <TrendingDown size={14} className="text-rose-500" /> Total Expenses
                    </div>
                    <div className="text-2xl font-bold text-rose-500">
                        {formatCurrency(totalExpense)}
                    </div>
                </div>
            </div>

            {/* Transactions List */}
            <div className="rounded-2xl border bg-white border-emerald-500/40 dark:bg-black/40 dark:border-emerald-500/10 overflow-hidden">
                <div className="px-6 py-4 border-b border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-900/10 flex items-center justify-between">
                    <h3 className="font-bold text-emerald-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                        <Receipt size={18} className="text-emerald-500" /> Recent Transactions
                    </h3>
                    <div className="text-xs font-mono text-slate-500">Season 1 History</div>
                </div>

                <div className="divide-y divide-emerald-100 dark:divide-emerald-900/20">
                    {transactions.length === 0 ? (
                        <div className="p-12 text-center text-slate-500 italic">
                            No financial activities recorded yet.
                        </div>
                    ) : (
                        transactions.map((tx) => (
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
                                            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-emerald-900/20">W{tx.season}</span>
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
            </div>
        </div>
    );
}
