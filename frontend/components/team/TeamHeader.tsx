
import React from 'react';

interface TeamHeaderProps {
    name: string;
    logoUrl?: string;
    managerName?: string;
}

export function TeamHeader({ name, logoUrl, managerName }: TeamHeaderProps) {
    return (
        <div className="bg-slate-800 rounded-lg p-6 mb-6 flex items-center shadow-lg border border-slate-700">
            <div className="w-24 h-24 bg-slate-700 rounded-full flex-shrink-0 flex items-center justify-center mr-6 border-2 border-slate-600">
                {logoUrl ? (
                    <img src={logoUrl} alt={name} className="w-20 h-20 object-contain" />
                ) : (
                    <span className="text-3xl font-bold text-slate-400">{name.substring(0, 2).toUpperCase()}</span>
                )}
            </div>
            <div>
                <h1 className="text-3xl font-bold text-white mb-2">{name}</h1>
                {managerName && (
                    <p className="text-slate-400 text-sm font-medium">
                        Manager: <span className="text-white">{managerName}</span>
                    </p>
                )}
            </div>
        </div>
    );
}
