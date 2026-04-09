"use client";

import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";

export default function Home() {
  const t = useTranslations();
  const locale = useLocale();

  // English: split every 2 words for 2-line display
  // Chinese: keep as single line
  const heroTitle = t("hero.title");
  const heroLines = locale === "en"
    ? (() => {
        const words = heroTitle.split(" ");
        return [words.slice(0, 3).join(" "), words.slice(3).join(" ")];
      })()
    : [heroTitle];

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Top AppBar ── */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center px-8 bg-surface/70 backdrop-blur-2xl border-b border-white/5">
        {/* Logo — left */}
        <span className="font-headline font-black text-sm uppercase tracking-[0.15em] text-primary shrink-0">
          GoalXi
        </span>
        {/* Nav — absolutely centered */}
        <nav className="hidden md:flex absolute left-1/2 -translate-x-1/2 gap-8">
          <a href="#" className="font-headline text-xs font-medium text-primary border-b-2 border-primary pb-1">
            {t("nav.howToPlay")}
          </a>
          <a href="#" className="font-headline text-xs font-medium text-on-surface-variant hover:text-on-surface transition-colors">
            {t("nav.leaderboard")}
          </a>
          <a href="#" className="font-headline text-xs font-medium text-on-surface-variant hover:text-on-surface transition-colors">
            {t("nav.news")}
          </a>
        </nav>
        {/* Auth — right */}
        <div className="flex items-center gap-4 ml-auto shrink-0">
          <Link href="/auth/login" className="font-headline font-bold text-xs uppercase tracking-widest px-5 py-2 text-primary border border-primary/30 hover:bg-primary/10 transition-all">
            {t("nav.login")}
          </Link>
          <Link href="/auth/register" className="font-headline font-bold text-xs uppercase tracking-widest px-5 py-2 bg-primary text-on-primary hover:opacity-90 transition-all">
            {t("nav.signUp")}
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* ── Hero Section ── */}
        <section className="relative h-screen flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 z-0">
            <img
              alt="Stadium at night"
              className="w-full h-full object-cover grayscale brightness-50"
              src="https://images.unsplash.com/photo-1489944440615-453fc2b6a9a9?w=1920&q=80"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-surface/40 to-surface z-10" />
          </div>

          <div className="relative z-20 container mx-auto px-6 text-center">
            <h1 className="font-headline text-6xl md:text-8xl font-black tracking-tighter text-primary mb-6 leading-none">
              {heroLines.map((line, i) => <span key={i} className="block">{line}</span>)}
            </h1>
            <p className="font-body text-lg md:text-2xl text-on-surface-variant max-w-2xl mx-auto mb-10 font-light leading-relaxed">
              {t("hero.subtitle")}
            </p>
            <Link
              href="/auth/register"
              className="group relative inline-block px-10 py-5 bg-primary text-on-primary font-headline font-bold text-xl tracking-tighter overflow-hidden hover:opacity-90 transition-all"
            >
              <span className="relative z-10">{t("hero.cta")}</span>
              <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
            </Link>
          </div>
        </section>

        {/* ── Stats Strip ── */}
        <section className="py-12 bg-surface-container-low border-y border-[#414845]/20">
          <div className="container mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
              <div className="space-y-1">
                <div className="font-headline text-4xl font-black text-tertiary">50,000+</div>
                <div className="font-label text-xs tracking-[0.2em] uppercase text-on-surface-variant">{t("stats.managersOnline")}</div>
              </div>
              <div className="space-y-1">
                <div className="font-headline text-4xl font-black text-primary">2.5M</div>
                <div className="font-label text-xs tracking-[0.2em] uppercase text-on-surface-variant">{t("stats.matchesPlayed")}</div>
              </div>
              <div className="space-y-1">
                <div className="font-headline text-4xl font-black text-secondary">#1</div>
                <div className="font-label text-xs tracking-[0.2em] uppercase text-on-surface-variant">{t("stats.tacticalSimulation")}</div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Features Bento ── */}
        <section className="py-24 container mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-4">
            <h2 className="font-headline text-4xl font-bold tracking-tight">
              {t("features.title")}
            </h2>
            <p className="hidden md:block text-on-surface-variant max-w-md text-right border-r-2 border-primary pr-6 font-body">
              {t("features.subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass-panel p-8 group hover:bg-surface-container-high transition-all duration-300">
              <div className="w-12 h-12 bg-primary-container flex items-center justify-center mb-6 border border-primary/20">
                <span className="material-symbols-outlined text-primary">strategy</span>
              </div>
              <h3 className="font-headline text-2xl font-bold mb-4 text-on-surface">
                {t("features.tacticalCanvas.title")}
              </h3>
              <p className="font-body text-on-surface-variant leading-relaxed text-sm">
                {t("features.tacticalCanvas.desc")}
              </p>
            </div>

            <div className="glass-panel p-8 group hover:bg-surface-container-high transition-all duration-300">
              <div className="w-12 h-12 bg-primary-container flex items-center justify-center mb-6 border border-primary/20">
                <span className="material-symbols-outlined text-primary">travel_explore</span>
              </div>
              <h3 className="font-headline text-2xl font-bold mb-4 text-on-surface">
                {t("features.scouting.title")}
              </h3>
              <p className="font-body text-on-surface-variant leading-relaxed text-sm">
                {t("features.scouting.desc")}
              </p>
            </div>

            <div className="glass-panel p-8 group hover:bg-surface-container-high transition-all duration-300">
              <div className="w-12 h-12 bg-primary-container flex items-center justify-center mb-6 border border-primary/20">
                <span className="material-symbols-outlined text-primary">monitoring</span>
              </div>
              <h3 className="font-headline text-2xl font-bold mb-4 text-on-surface">
                {t("features.dataDriven.title")}
              </h3>
              <p className="font-body text-on-surface-variant leading-relaxed text-sm">
                {t("features.dataDriven.desc")}
              </p>
            </div>
          </div>
        </section>

        {/* ── CTA Section ── */}
        <section className="py-24 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] -z-10" />
          <div className="container mx-auto px-6">
            <div className="max-w-4xl mx-auto glass-panel p-12 text-center border-t-2 border-primary">
              <h2 className="font-headline text-4xl font-bold mb-6">
                {t("cta.title")}
              </h2>
              <p className="font-body text-on-surface-variant mb-10 text-lg">
                {t("cta.subtitle")}
              </p>
              <form className="flex flex-col md:flex-row gap-4 max-w-lg mx-auto">
                <input
                  className="flex-grow bg-surface-container-lowest border border-[#414845]/30 px-6 py-4 focus:border-primary outline-none transition-all text-on-surface font-body placeholder:text-[#c1c8c4]/50"
                  placeholder={t("cta.placeholder")}
                  type="email"
                />
                <button
                  type="submit"
                  className="bg-primary text-on-primary font-headline font-bold px-8 py-4 hover:opacity-90 transition-colors whitespace-nowrap"
                >
                  {t("cta.button")}
                </button>
              </form>
              <p className="mt-6 font-label text-xs text-on-surface-variant uppercase tracking-widest">
                {t("cta.note")}
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="relative w-full py-12 px-8 bg-surface-container-lowest border-t border-white/5">
        {/* Brand — left */}
        <div className="flex flex-col gap-1">
          <div className="font-headline text-lg font-black text-primary tracking-tighter uppercase">{t("footer.brand")}</div>
          <p className="font-body text-xs text-on-surface-variant">{t("footer.copyright")}</p>
        </div>

        {/* Links — absolutely centered */}
        <nav className="hidden md:flex absolute left-1/2 -translate-x-1/2 gap-6">
          {[
            { key: "privacy", label: t("footer.privacy") },
            { key: "terms", label: t("footer.terms") },
            { key: "cookies", label: t("footer.cookies") },
            { key: "contact", label: t("footer.contact") },
          ].map((link) => (
            <a key={link.key} href="#" className="font-body text-xs text-on-surface-variant hover:text-primary transition-colors whitespace-nowrap">
              {link.label}
            </a>
          ))}
        </nav>

        {/* Social icons — right */}
        <div className="absolute right-8 top-12 flex gap-3">
          <button className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center hover:border-primary transition-colors cursor-pointer group" aria-label="Share">
            <span className="material-symbols-outlined text-base text-on-surface-variant group-hover:text-primary transition-colors">share</span>
          </button>
          <button className="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center hover:border-primary transition-colors cursor-pointer group" aria-label="Language">
            <span className="material-symbols-outlined text-base text-on-surface-variant group-hover:text-primary transition-colors">language</span>
          </button>
        </div>

        {/* Copyright — centered below */}
        <div className="flex justify-center mt-8">
          <p className="font-body text-xs text-on-surface-variant opacity-40">{t("footer.allRights")}</p>
        </div>
      </footer>
    </div>
  );
}
