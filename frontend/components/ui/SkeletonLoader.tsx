'use client';

import React from 'react';
import { clsx } from 'clsx';

interface SkeletonProps {
    className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className }) => {
    return (
        <div
            className={clsx(
                'animate-pulse bg-gradient-to-r from-emerald-950/40 via-emerald-900/30 to-emerald-950/40 bg-[length:200%_100%] rounded',
                'animate-shimmer',
                className
            )}
            style={{
                animation: 'shimmer 2s infinite linear'
            }}
        />
    );
};

export const SkeletonCard: React.FC = () => {
    return (
        <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-500/20 bg-black/40 backdrop-blur-sm p-6">
            <div className="flex gap-6">
                {/* Avatar */}
                <div className="shrink-0">
                    <Skeleton className="w-24 h-24 rounded-xl" />
                    <Skeleton className="w-12 h-12 rounded-xl mt-4 mx-auto" />
                </div>

                {/* Content */}
                <div className="flex-1 space-y-4">
                    {/* Header */}
                    <div className="space-y-2">
                        <Skeleton className="h-8 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-3">
                        <Skeleton className="h-16 rounded-xl" />
                        <Skeleton className="h-16 rounded-xl" />
                    </div>

                    {/* Attributes */}
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-full" />
                    </div>
                </div>
            </div>
        </div>
    );
};

export const SkeletonTable: React.FC<{ rows?: number }> = ({ rows = 5 }) => {
    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="grid grid-cols-4 gap-4 p-4 border-b border-emerald-500/20">
                <Skeleton className="h-4" />
                <Skeleton className="h-4" />
                <Skeleton className="h-4" />
                <Skeleton className="h-4" />
            </div>

            {/* Rows */}
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="grid grid-cols-4 gap-4 p-4">
                    <Skeleton className="h-4" />
                    <Skeleton className="h-4" />
                    <Skeleton className="h-4" />
                    <Skeleton className="h-4" />
                </div>
            ))}
        </div>
    );
};

export const SkeletonPlayerCard: React.FC = () => {
    return (
        <div className="relative overflow-hidden rounded-xl border border-emerald-500/20 bg-black/40 backdrop-blur-sm p-4">
            <div className="flex items-start justify-between mb-3">
                <Skeleton className="w-8 h-8 rounded-lg" />
                <Skeleton className="w-16 h-6 rounded-lg" />
            </div>

            <div className="flex items-center gap-3 mb-3">
                <Skeleton className="w-12 h-12 rounded-xl" />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
                <Skeleton className="h-14 rounded-lg" />
                <Skeleton className="h-14 rounded-lg" />
            </div>

            <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
            </div>
        </div>
    );
};
