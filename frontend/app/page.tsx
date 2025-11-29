'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { MiniPlayer } from '@/components/MiniPlayer';
import { generateTeam } from '@/lib/playerGenerator';
import { Player } from '@/types/player';

export default function Home() {
  const [team, setTeam] = useState<Player[]>([]);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    setTeam(generateTeam(11));
  }, []);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // Theme Config
  const isDark = theme === 'dark';

  const bgClass = isDark ? 'bg-black text-emerald-400' : 'bg-slate-50 text-emerald-800';
  const selectionClass = isDark ? 'selection:bg-emerald-500 selection:text-black' : 'selection:bg-emerald-500 selection:text-white';

  // Grid
  const gridGradient = isDark
    ? 'bg-[linear-gradient(to_right,#022c22_1px,transparent_1px),linear-gradient(to_bottom,#022c22_1px,transparent_1px)]'
    : 'bg-[linear-gradient(to_right,#dcfce7_1px,transparent_1px),linear-gradient(to_bottom,#dcfce7_1px,transparent_1px)]';

  // Containers
  const cardBg = isDark ? 'bg-black/40 border-emerald-900/50' : 'bg-white border-emerald-100/50';
  const cardHover = isDark ? 'hover:border-emerald-400/50 hover:shadow-[0_0_40px_rgba(52,211,153,0.15)]' : 'hover:border-emerald-300 hover:shadow-xl hover:shadow-emerald-100/50';
  const headerBg = isDark ? 'bg-emerald-950/20 border-emerald-500/20 shadow-[0_0_30px_rgba(2,44,34,0.5)]' : 'bg-white/90 border-emerald-200 shadow-lg shadow-emerald-100/20';

  // Text
  const titleGradient = isDark
    ? 'from-emerald-400 via-green-500 to-teal-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]'
    : 'from-emerald-600 via-green-600 to-teal-600';

  const subText = isDark ? 'text-emerald-600' : 'text-emerald-600';
  const statLabel = isDark ? 'text-emerald-600' : 'text-emerald-400';
  const statValue = isDark ? 'text-white' : 'text-slate-800';
  const playerName = isDark ? 'text-white group-hover:text-emerald-300' : 'text-slate-800 group-hover:text-emerald-600';

  return (
    <div className={`min-h-screen font-mono overflow-x-hidden transition-colors duration-500 ${bgClass} ${selectionClass}`}>

      {/* --- Cyber Background --- */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {/* Grid Floor */}
        <div className={`absolute inset-0 ${gridGradient} bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-50`}></div>

        {/* Glowing Center Circle (Pitch) */}
        <div className={`absolute top-[-20%] left-[20%] w-[60%] h-[60%] rounded-full blur-[100px] animate-pulse transition-colors duration-700 ${isDark ? 'border border-emerald-500/20 bg-emerald-900/10' : 'border border-emerald-500/20 bg-emerald-100/40'}`}></div>
        <div className={`absolute bottom-[-20%] right-[-10%] w-[40%] h-[40%] rounded-full blur-[100px] transition-colors duration-700 ${isDark ? 'border border-lime-500/20 bg-lime-900/10' : 'border border-lime-500/20 bg-lime-100/40'}`}></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto p-6">

        {/* --- HUD Header --- */}
        <header className={`flex flex-col md:flex-row justify-between items-end backdrop-blur-md border rounded-2xl p-6 mb-12 transition-all duration-300 ${headerBg}`}>
          <div className="mb-4 md:mb-0">
            <h1 className={`text-6xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r ${titleGradient}`}>
              CYBER<span className={isDark ? 'text-white' : 'text-slate-800'}>PITCH</span>
            </h1>
            <div className={`flex items-center gap-2 mt-2 text-xs tracking-[0.3em] pl-2 ${subText}`}>
              <span className={`w-2 h-2 rounded-full animate-ping ${isDark ? 'bg-emerald-500' : 'bg-emerald-500'}`}></span>
              SYSTEM ONLINE // TURF LINK ESTABLISHED
            </div>
          </div>

          <div className="flex items-center gap-6">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className={`p-3 rounded-xl border transition-all ${isDark ? 'bg-black/40 border-emerald-500/30 hover:bg-emerald-900/20 text-emerald-400' : 'bg-white border-emerald-200 hover:bg-emerald-50 text-emerald-600 shadow-sm'}`}
            >
              {isDark ? '☀️ DAY MATCH' : '🌙 NIGHT MATCH'}
            </button>

            <div className={`hidden md:flex gap-8 text-sm font-bold rounded-xl p-4 border ${isDark ? 'bg-black/40 border-emerald-900/50' : 'bg-white/50 border-emerald-100'}`}>
              <div className="text-right">
                <div className={`text-[10px] uppercase ${subText}`}>Budget</div>
                <div className={`text-xl ${statValue}`}>¥ 4,290,000</div>
              </div>
              <div className={`w-px ${isDark ? 'bg-emerald-900/50' : 'bg-emerald-200'}`}></div>
              <div className="text-right">
                <div className={`text-[10px] uppercase ${subText}`}>Season</div>
                <div className={`text-xl ${statValue}`}>2077</div>
              </div>
            </div>
          </div>
        </header>

        {/* --- Control Deck --- */}
        <div className="flex flex-wrap gap-4 mb-12 justify-center">
          <button
            onClick={() => setTeam(generateTeam(11))}
            className={`group relative px-10 py-4 border overflow-hidden transition-all rounded-xl shadow-lg ${isDark ? 'bg-emerald-950/40 border-emerald-500/30 hover:border-emerald-400 hover:shadow-emerald-500/20' : 'bg-white border-emerald-200 hover:border-emerald-400 hover:shadow-emerald-500/20'}`}
          >
            <div className={`absolute inset-0 translate-y-full group-hover:translate-y-0 transition-transform duration-300 rounded-xl ${isDark ? 'bg-emerald-500/10' : 'bg-emerald-50'}`}></div>
            <span className={`relative font-bold uppercase tracking-widest transition-colors flex items-center gap-2 ${isDark ? 'group-hover:text-white' : 'text-slate-700 group-hover:text-emerald-700'}`}>
              <span className="text-xl">⚡</span> Initialize Squad
            </span>
          </button>

          <button className={`group relative px-10 py-4 border overflow-hidden transition-all rounded-xl shadow-lg ${isDark ? 'bg-lime-950/40 border-lime-500/30 hover:border-lime-400 hover:shadow-lime-500/20' : 'bg-white border-lime-300 hover:border-lime-500 hover:shadow-lime-500/20'}`}>
            <div className={`absolute inset-0 translate-y-full group-hover:translate-y-0 transition-transform duration-300 rounded-xl ${isDark ? 'bg-lime-500/10' : 'bg-lime-50'}`}></div>
            <span className={`relative font-bold uppercase tracking-widest transition-colors flex items-center gap-2 ${isDark ? 'text-lime-400 group-hover:text-white' : 'text-lime-700 group-hover:text-lime-900'}`}>
              <span className="text-xl">💎</span> Marketplace
            </span>
          </button>
        </div>

        {/* --- Player Grid (Holographic Cards) --- */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {team.map((player, index) => (
            <div
              key={player.id}
              className={`group relative backdrop-blur-md border p-1 transition-all duration-300 hover:-translate-y-2 rounded-2xl ${cardBg} ${cardHover}`}
            >
              {/* Scanline Effect Overlay - Dark Mode Only */}
              {isDark && (
                <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.05)_50%)] bg-[size:100%_4px] pointer-events-none z-20 rounded-2xl"></div>
              )}

              <div className="relative p-5 h-full flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center mb-4">
                  <span className={`text-[10px] font-bold px-3 py-1 rounded-lg border ${isDark ? 'text-emerald-700 bg-emerald-950/30 border-emerald-900/30' : 'text-emerald-700 bg-emerald-50 border-emerald-100'}`}>UNIT_0{index + 1}</span>
                  <span className={`text-[10px] font-bold px-3 py-1 rounded-lg border ${player.position === 'GK' ? (isDark ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : 'bg-yellow-50 text-yellow-600 border-yellow-200') :
                      player.position === 'FWD' ? (isDark ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-red-50 text-red-600 border-red-200') :
                        (isDark ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-emerald-50 text-emerald-600 border-emerald-200')
                    }`}>
                    {player.position}
                  </span>
                </div>

                {/* Avatar Container */}
                <div className="relative flex justify-center mb-6 py-2">
                  {/* Hologram Base - Dark Mode Only */}
                  {isDark && (
                    <div className="absolute bottom-2 w-24 h-6 blur-xl rounded-[100%] bg-emerald-500/20"></div>
                  )}

                  <div className={`relative z-10 filter transition-all scale-110 ${isDark ? 'drop-shadow-[0_0_8px_rgba(52,211,153,0.3)] group-hover:drop-shadow-[0_0_15px_rgba(52,211,153,0.6)]' : 'drop-shadow-md'}`}>
                    <MiniPlayer appearance={player.appearance} position={player.position} size={100} />
                  </div>
                </div>

                {/* Player Name */}
                <h3 className={`text-xl font-bold uppercase tracking-wider mb-6 truncate text-center transition-colors ${playerName}`}>
                  {player.name}
                </h3>

                {/* Stats Matrix */}
                <div className="mt-auto grid grid-cols-3 gap-2 text-center">
                  <div className={`p-2 rounded-xl border transition-colors ${isDark ? 'bg-emerald-950/30 border-emerald-900/30 group-hover:border-emerald-500/30 group-hover:bg-emerald-900/20' : 'bg-emerald-50/50 border-emerald-100 group-hover:border-emerald-300 group-hover:bg-emerald-100'}`}>
                    <div className={`text-[9px] uppercase mb-1 font-bold ${statLabel}`}>SPD</div>
                    <div className={`text-lg font-black ${statValue}`}>{player.stats.speed}</div>
                  </div>
                  <div className={`p-2 rounded-xl border transition-colors ${isDark ? 'bg-emerald-950/30 border-emerald-900/30 group-hover:border-emerald-500/30 group-hover:bg-emerald-900/20' : 'bg-emerald-50/50 border-emerald-100 group-hover:border-emerald-300 group-hover:bg-emerald-100'}`}>
                    <div className={`text-[9px] uppercase mb-1 font-bold ${statLabel}`}>PWR</div>
                    <div className={`text-lg font-black ${statValue}`}>{player.stats.power}</div>
                  </div>
                  <div className={`p-2 rounded-xl border transition-colors ${isDark ? 'bg-emerald-950/30 border-emerald-900/30 group-hover:border-emerald-500/30 group-hover:bg-emerald-900/20' : 'bg-emerald-50/50 border-emerald-100 group-hover:border-emerald-300 group-hover:bg-emerald-100'}`}>
                    <div className={`text-[9px] uppercase mb-1 font-bold ${statLabel}`}>SKL</div>
                    <div className={`text-lg font-black ${statValue}`}>{player.stats.skill}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
