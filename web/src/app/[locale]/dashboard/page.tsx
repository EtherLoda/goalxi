"use client";

import { useTranslations } from "next-intl";
import Sidebar from "../../../components/dashboard/Sidebar";

export default function DashboardPage() {
  const t = useTranslations();

  const alerts = [
    {
      type: "warning" as const,
      icon: "contract",
      color: "tertiary",
      title: "Contract Expiring: Bruno Fernandes",
      desc: "Player contract expires in 6 months. Begin negotiations.",
    },
    {
      type: "danger" as const,
      icon: "medical_services",
      color: "error",
      title: "Injured: Rashford",
      desc: "Pulled Hamstring. Out for approximately 2 weeks.",
    },
    {
      type: "success" as const,
      icon: "check_circle",
      color: "primary",
      title: "Tactical Training Complete",
      desc: "Attacking cohesion drill finished. +3 chemistry boost.",
    },
  ];

  const formResults = [
    { result: "W", type: "win" as const },
    { result: "W", type: "win" as const },
    { result: "D", type: "draw" as const },
    { result: "L", type: "loss" as const },
    { result: "W", type: "win" as const },
  ];

  const news = [
    {
      tag: "Club Feature",
      tagColor: "primary",
      title: "New Season Pass Available",
      desc: "Unlock exclusive retro kits, training stadium skins, and premium scouting reports for Season 4.",
      time: "Released Today",
    },
    {
      tag: "Operations",
      tagColor: "white",
      title: "Server Maintenance on July 20th",
      desc: "Scheduled downtime from 02:00 UTC to 04:00 UTC for infrastructure optimization.",
      time: "2 Days Ago",
    },
    {
      tag: "Scouting Update",
      tagColor: "tertiary",
      title: "Youth Intake Phase 2 Begins",
      desc: "The latest wave of prospects from South America is being processed into the scouting database.",
      time: "3 Days Ago",
    },
  ];

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar />

      <main className="flex-1 ml-64 flex flex-col">
        {/* Top AppBar */}
        <header className="h-16 bg-surface/70 backdrop-blur-2xl border-b border-white/5 flex items-center justify-between px-6 shrink-0">
          <h1 className="font-headline font-black text-sm uppercase tracking-[0.2em] text-primary">
            {t("dashboard.title")}
          </h1>
          <div className="flex items-center gap-4">
            <button className="p-2 text-on-surface-variant hover:text-primary transition-colors">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <div className="w-px h-6 bg-white/10" />
            <div className="flex items-center gap-3">
              <div className="hidden sm:block text-right">
                <div className="font-label text-[10px] font-black text-primary uppercase tracking-widest">
                  {t("dashboard.nextMatch")}
                </div>
                <div className="font-headline text-[10px] text-on-surface-variant">
                  vs Liverpool (H)
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                <span className="font-headline font-black text-xs text-primary">A</span>
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 p-6 space-y-6 max-w-7xl mx-auto w-full">
          {/* Hero Grid: Next Match */}
          <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Next Match Card */}
            <div className="xl:col-span-2 glass-panel rounded-2xl overflow-hidden p-8 relative">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent" />
              <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                {/* Left info */}
                <div className="flex-1 space-y-4 text-center md:text-left">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="font-label text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                      {t("dashboard.matchday")} 24
                    </span>
                  </div>
                  <h2 className="font-headline text-5xl font-black tracking-tighter text-on-surface">
                    THE DERBY
                  </h2>
                  <p className="font-body text-sm text-on-surface-variant max-w-sm leading-relaxed">
                    Liverpool visit the Fortress this Sunday. Tactical adjustments in defensive transitions are prioritized.
                  </p>
                  <div className="flex flex-wrap gap-6 pt-2 justify-center md:justify-start">
                    <div className="flex flex-col">
                      <span className="font-label text-[9px] uppercase tracking-[0.2em] text-primary font-black mb-1">
                        {t("dashboard.kickoff")}
                      </span>
                      <span className="font-headline font-bold text-on-surface">SUNDAY 15:00</span>
                    </div>
                    <div className="w-px h-8 bg-white/10" />
                    <div className="flex flex-col">
                      <span className="font-label text-[9px] uppercase tracking-[0.2em] text-primary font-black mb-1">
                        {t("dashboard.venue")}
                      </span>
                      <span className="font-headline font-bold text-on-surface">ELITE STADIUM</span>
                    </div>
                  </div>
                </div>

                {/* VS Block */}
                <div className="flex items-center gap-6 px-8 py-6 rounded-3xl bg-surface-container-low/80 backdrop-blur-md border border-white/5">
                  <div className="text-center space-y-2">
                    <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center">
                      <span className="font-headline font-black text-lg text-primary">EF</span>
                    </div>
                    <span className="font-label text-[10px] font-black text-secondary uppercase tracking-widest">
                      {t("dashboard.home")}
                    </span>
                  </div>
                  <div className="font-headline font-black text-2xl text-on-surface-variant/30">VS</div>
                  <div className="text-center space-y-2">
                    <div className="w-16 h-16 rounded-full bg-error/10 border-2 border-error/30 flex items-center justify-center">
                      <span className="font-headline font-black text-lg text-error">LIV</span>
                    </div>
                    <span className="font-label text-[10px] font-black text-error uppercase tracking-widest">
                      {t("dashboard.away")}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Squad Status */}
            <div className="glass-panel rounded-2xl p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-headline font-black text-xs uppercase tracking-[0.2em] text-primary">
                    {t("dashboard.squadStatus")}
                  </h3>
                  <span className="font-label text-[9px] font-black text-on-surface-variant uppercase tracking-widest">
                    Premier Division
                  </span>
                </div>
                <div className="flex items-center gap-4 mb-6">
                  <span className="font-headline text-6xl font-black text-on-surface tracking-tighter">03</span>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-primary">
                      <span className="material-symbols-outlined text-sm">trending_up</span>
                      <span className="font-label text-[10px] font-black uppercase tracking-wider">UP 2</span>
                    </div>
                    <p className="font-body text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
                      48 {t("dashboard.points")} | 23 {t("dashboard.games")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Recent Form */}
              <div className="space-y-3">
                <p className="font-label text-[9px] uppercase tracking-[0.2em] text-primary font-black">
                  {t("dashboard.recentForm")}
                </p>
                <div className="flex gap-2">
                  {formResults.map((r, i) => (
                    <div
                      key={i}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center font-headline font-black text-xs border ${
                        r.type === "win"
                          ? "bg-primary text-on-primary border-primary shadow-[0_0_12px_rgba(0,228,121,0.3)]"
                          : r.type === "draw"
                          ? "bg-white/5 text-on-surface-variant border-white/10"
                          : "bg-error/10 text-error border-error/20"
                      }`}
                    >
                      {r.result}
                    </div>
                  ))}
                </div>
                <div className="pt-3 border-t border-white/5 flex justify-between items-center">
                  <span className="font-label text-[10px] text-on-surface-variant font-bold uppercase">
                    Next: Liverpool (H)
                  </span>
                  <a href="#" className="font-label text-[10px] font-black text-primary uppercase tracking-widest hover:underline">
                    Full Table →
                  </a>
                </div>
              </div>
            </div>
          </section>

          {/* Second Grid */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Action Required */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-headline font-black text-xs uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg">assignment_late</span>
                  {t("dashboard.actionRequired")}
                </h3>
                <span className="font-label text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                  3 Active
                </span>
              </div>
              <div className="glass-panel rounded-2xl overflow-hidden divide-y divide-white/5">
                {alerts.map((alert, i) => (
                  <div
                    key={i}
                    className="p-5 flex items-center gap-4 hover:bg-white/5 transition-colors cursor-pointer group"
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center border text-${alert.color}`}
                      style={{
                        background: `var(--color-${alert.color})/10`,
                        borderColor: `var(--color-${alert.color})/20`,
                        color: `var(--color-${alert.color})`,
                      }}
                    >
                      <span className="material-symbols-outlined text-lg">{alert.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className={`font-headline text-sm font-bold text-on-surface group-hover:text-${alert.color} transition-colors truncate`}>
                        {alert.title}
                      </h4>
                      <p className="font-body text-xs text-on-surface-variant leading-relaxed">
                        {alert.desc}
                      </p>
                    </div>
                    <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors">
                      chevron_right
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Official News */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-headline font-black text-xs uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>campaign</span>
                  {t("dashboard.officialNews")}
                </h3>
                <a href="#" className="font-label text-[10px] font-black text-on-surface-variant uppercase tracking-widest hover:text-primary transition-colors">
                  Archive
                </a>
              </div>
              <div className="space-y-4">
                {news.map((item, i) => (
                  <div
                    key={i}
                    className="glass-panel rounded-2xl p-5 relative group cursor-pointer"
                    style={{ borderLeftWidth: "3px", borderLeftColor: `var(--color-${item.tagColor})` }}
                  >
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-white/2" />
                    <span
                      className="font-label text-[9px] font-black uppercase tracking-[0.2em] block mb-2"
                      style={{ color: `var(--color-${item.tagColor})` }}
                    >
                      {item.tag}
                    </span>
                    <h4 className="font-headline text-sm font-bold text-on-surface mb-1 relative z-10">
                      {item.title}
                    </h4>
                    <p className="font-body text-xs text-on-surface-variant leading-relaxed relative z-10">
                      {item.desc}
                    </p>
                    <div className="mt-3 flex justify-between items-center relative z-10">
                      <span className="font-label text-[9px] text-on-surface-variant/50 font-black uppercase tracking-widest">
                        {item.time}
                      </span>
                      <span className="font-label text-[9px] font-black text-primary uppercase tracking-widest hover:underline">
                        Read More
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
