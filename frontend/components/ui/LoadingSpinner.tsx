'use client';

import React from 'react';
import { clsx } from 'clsx';

interface LoadingSpinnerProps {
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
    size = 'md',
    className = ''
}) => {
    const sizeClasses = {
        sm: 'w-4 h-4 border-2',
        md: 'w-8 h-8 border-2',
        lg: 'w-12 h-12 border-3',
        xl: 'w-16 h-16 border-4'
    };

    return (
        <div className={clsx('inline-block', className)}>
            <div
                className={clsx(
                    'rounded-full border-emerald-500/30 border-t-emerald-400 animate-spin',
                    sizeClasses[size]
                )}
                style={{
                    boxShadow: '0 0 10px rgba(16, 185, 129, 0.3)'
                }}
            />
        </div>
    );
};

interface LoadingOverlayProps {
    message?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message = 'Loading...' }) => {
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-emerald-950/40 border-2 border-emerald-500/30 rounded-2xl p-8 backdrop-blur-md shadow-[0_0_40px_rgba(16,185,129,0.3)]">
                <div className="flex flex-col items-center gap-4">
                    <LoadingSpinner size="xl" />
                    <p className="text-emerald-400 font-mono font-bold tracking-wider uppercase">
                        {message}
                    </p>
                </div>
            </div>
        </div>
    );
};
