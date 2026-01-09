import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Move } from 'lucide-react';

interface PositionSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: string[];
    placeholder?: string;
    className?: string;
    align?: 'left' | 'right';
    disabled?: boolean;
}

export function PositionSelect({
    value,
    onChange,
    options,
    placeholder = "Select Position",
    className = "",
    align = 'left',
    disabled = false
}: PositionSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl transition-all 
                ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-900' : 'hover:border-amber-400 dark:hover:border-amber-500/50 hover:shadow-sm cursor-pointer'} 
                ${isOpen ? 'ring-2 ring-amber-500/20 border-amber-500' : ''}`}
            >
                {value ? (
                    <div className={`flex-1 flex flex-col ${align === 'right' ? 'items-end text-right' : 'items-start text-left'}`}>
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            {value}
                        </span>
                        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-500 opacity-80">
                            New Position
                        </span>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-slate-400">
                        <Move size={14} />
                        <span className="text-xs font-medium">{placeholder}</span>
                    </div>
                )}
                {!disabled && (
                    <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180 text-amber-500' : ''}`} />
                )}
            </button>

            {isOpen && (
                <div
                    style={{
                        position: 'fixed',
                        top: containerRef.current ? containerRef.current.getBoundingClientRect().bottom + 8 : 0,
                        left: containerRef.current ? (align === 'right'
                            ? containerRef.current.getBoundingClientRect().right - 120 // Narrower than player select
                            : containerRef.current.getBoundingClientRect().left) : 0,
                        width: '120px', // Fixed width for position dropdown
                    }}
                    className={`z-[9999] max-h-[280px] overflow-y-auto bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl shadow-slate-200/50 dark:shadow-slate-950/50 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800 animate-in fade-in zoom-in-95 duration-100 flex flex-col`}
                >
                    <div className="p-1 space-y-0.5">
                        {options.map(option => (
                            <button
                                key={option}
                                onClick={() => {
                                    onChange(option);
                                    setIsOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-all group ${value === option
                                    ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                                    }`}
                            >
                                <span className="text-xs font-bold">{option}</span>
                                {value === option && <Check size={14} className="text-amber-500 flex-shrink-0 ml-2" />}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
