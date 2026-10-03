"use client";

import { AppIcon } from "@/components/icons/AppIcon";
import Link from "next/link";
import Image from "next/image";
import { useTranslations, useLocale } from "next-intl";

const STATS = [
  { value: "85", key: "leagues" },
  { value: "4", key: "tiers" },
  { value: "90", key: "minutes" },
] as const;

export default function Home() {
  const t = useTranslations();
  const locale = useLocale();

  const otherLocale = locale === "en" ? "zh" : "en";

  // English: split every 2 words for 2-line display
  // Chinese: keep as single line
  const heroTitle = t("hero.title");
  const heroLines = locale === "en"
    ? (() => {
        const words = heroTitle.split(" ");
        return [words.slice(0, 3).join(" "), words.slice(3).join(" ")];
      })()
    : [heroTitle];

  const registerHref = `/${locale}/auth/register`;
  const focusRing =
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <a
        href="#main"
        className={`sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:bg-primary focus:text-on-primary focus:px-4 focus:py-2 focus:font-headline focus:text-xs focus:font-bold focus:uppercase focus:tracking-widest ${focusRing}`}
      >
        {t("nav.skipToContent")}
      </a>

      {/* ── Top AppBar ── */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center px-6 md:px-8 bg-surface/70 backdrop-blur-2xl border-b border-white/5">
        {/* Logo — left */}
        <span className="font-headline font-black text-sm uppercase tracking-[0.15em] text-primary shrink-0">
          GoalXi
        </span>
        {/* Nav — absolutely centered, single line */}
        <nav className="hidden md:flex absolute left-1/2 -translate-x-1/2 gap-8">
          <Link
            href={`/${locale}/manual`}
            className={`font-headline text-xs font-medium text-on-surface-variant hover:text-on-surface transition-colors duration-200 ${focusRing}`}
          >
            {t("nav.howToPlay")}
          </Link>
          <Link
            href={`/${locale}/forum`}
            className={`font-headline text-xs font-medium text-on-surface-variant hover:text-on-surface transition-colors duration-200 ${focusRing}`}
          >
            {t("nav.news")}
          </Link>
        </nav>
        {/* Auth — right */}
        <div className="flex items-center gap-3 md:gap-4 ml-auto shrink-0">
          <Link
            href={`/${locale}/auth/login`}
            className={`font-headline font-bold text-xs uppercase tracking-widest px-4 md:px-5 py-2 text-primary border border-primary/30 hover:bg-primary/10 transition-colors duration-200 ${focusRing}`}
          >
            {t("nav.login")}
          </Link>
          <Link
            href={registerHref}
            className={`font-headline font-bold text-xs uppercase tracking-widest px-4 md:px-5 py-2 bg-primary text-on-primary hover:opacity-90 active:scale-[0.98] transition duration-200 ${focusRing}`}
          >
            {t("nav.signUp")}
          </Link>
        </div>
      </header>

      <main id="main" className="flex-1">
        {/* ── Hero: left-aligned content, photo carries the right side ── */}
        <section className="relative min-h-[100dvh] flex items-center overflow-hidden">
          <div className="absolute inset-0 z-0">
            <Image
              alt="Stadium under floodlights at night"
              className="object-cover grayscale brightness-50"
              fill
              priority
              sizes="100vw"
              src="/hero-stadium.jpg"
            />
            {/* Vertical scrim keeps text legible on small screens */}
            <div className="absolute inset-0 bg-gradient-to-b from-surface/50 via-surface/30 to-surface" />
            {/* Horizontal scrim on desktop opens the right half for the photo */}
            <div className="hidden lg:block absolute inset-0 bg-gradient-to-r from-surface via-surface/75 to-transparent" />
          </div>

          <div className="relative z-20 w-full max-w-7xl mx-auto px-6 pt-24 pb-16">
            <div className="max-w-2xl">
              <h1 className="font-headline text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter leading-[1.05] text-primary text-balance">
                {heroLines.map((line, i) => (
                  <span key={i} className="block">{line}</span>
                ))}
              </h1>
              <p className="font-body text-base md:text-lg text-on-surface-variant max-w-[65ch] mt-6 leading-relaxed">
                {t("hero.subtitle")}
              </p>
              <Link
                href={registerHref}
                className={`group relative inline-block mt-10 px-8 py-4 bg-primary text-on-primary font-headline font-bold text-base tracking-tight overflow-hidden transition duration-200 hover:opacity-90 active:scale-[0.98] ${focusRing}`}
              >
                <span className="relative z-10">{t("hero.cta")}</span>
                <span
                  aria-hidden="true"
                  className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500"
                />
              </Link>
            </div>
          </div>
        </section>

        {/* ── Facts Strip: verified product facts, single accent ── */}
        <section className="py-10 bg-surface-container-low border-y border-outline-variant/30">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
              {STATS.map((stat) => (
                <div key={stat.key} className="space-y-1">
                  <div className="font-headline text-4xl md:text-5xl font-black text-primary tracking-tighter">
                    {stat.value}
                  </div>
                  <div className="font-label text-xs tracking-[0.2em] uppercase text-on-surface-variant">
                    {t(`stats.${stat.key}`)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features: one wide cell + two below (asymmetric, never 3 equal) ── */}
        <section className="py-20 md:py-24 max-w-7xl mx-auto px-6">
          <div className="max-w-[65ch] mb-12">
            <h2 className="font-headline text-3xl md:text-4xl font-bold tracking-tight text-on-surface text-balance">
              {t("features.title")}
            </h2>
            <p className="mt-4 font-body text-on-surface-variant leading-relaxed">
              {t("features.subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <article className="md:col-span-2 relative overflow-hidden p-8 border border-white/5 bg-gradient-to-br from-primary-container via-surface-container-low to-surface-container-lowest transition-colors duration-200 hover:via-surface-container">
              <div className="w-12 h-12 bg-surface-container-highest flex items-center justify-center border border-primary/30">
                <AppIcon name="strategy" className="text-primary" />
              </div>
              <h3 className="font-headline text-xl md:text-2xl font-bold mt-6 text-on-surface">
                {t("features.tacticalCanvas.title")}
              </h3>
              <p className="font-body text-sm text-on-surface-variant leading-relaxed mt-3 max-w-[65ch]">
                {t("features.tacticalCanvas.desc")}
              </p>
            </article>

            <article className="glass-panel p-8 transition-shadow duration-200 hover:shadow-card">
              <div className="w-12 h-12 bg-primary-container flex items-center justify-center mb-6 border border-primary/20">
                <AppIcon name="travel_explore" className="text-primary" />
              </div>
              <h3 className="font-headline text-xl md:text-2xl font-bold mb-3 text-on-surface">
                {t("features.scouting.title")}
              </h3>
              <p className="font-body text-sm text-on-surface-variant leading-relaxed max-w-[65ch]">
                {t("features.scouting.desc")}
              </p>
            </article>

            <article className="p-8 border border-white/5 bg-surface-container-high transition-colors duration-200 hover:bg-surface-container-highest">
              <div className="w-12 h-12 bg-surface-container-highest flex items-center justify-center mb-6 border border-white/10">
                <AppIcon name="monitoring" className="text-primary" />
              </div>
              <h3 className="font-headline text-xl md:text-2xl font-bold mb-3 text-on-surface">
                {t("features.dataDriven.title")}
              </h3>
              <p className="font-body text-sm text-on-surface-variant leading-relaxed max-w-[65ch]">
                {t("features.dataDriven.desc")}
              </p>
            </article>
          </div>
        </section>

        {/* ── CTA: copy left, single action right ── */}
        <section className="pb-20 md:pb-24 max-w-7xl mx-auto px-6">
          <div className="glass-panel border-t-2 border-primary p-8 md:p-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="max-w-xl">
              <h2 className="font-headline text-2xl md:text-3xl font-bold tracking-tight text-on-surface text-balance">
                {t("cta.title")}
              </h2>
              <p className="mt-3 font-body text-on-surface-variant leading-relaxed">
                {t("cta.subtitle")}
              </p>
              <p className="mt-4 font-label text-xs text-on-surface-variant uppercase tracking-widest">
                {t("cta.note")}
              </p>
            </div>
            <Link
              href={registerHref}
              className={`shrink-0 inline-block px-8 py-4 bg-primary text-on-primary font-headline font-bold text-base tracking-tight text-center hover:opacity-90 active:scale-[0.98] transition duration-200 ${focusRing}`}
            >
              {t("cta.button")}
            </Link>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="w-full py-10 px-6 md:px-8 bg-surface-container-lowest border-t border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex flex-col gap-1">
            <div className="font-headline text-lg font-black text-primary tracking-tighter uppercase">
              {t("footer.brand")}
            </div>
            <p className="font-body text-xs text-on-surface-variant">{t("footer.copyright")}</p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2 md:mx-auto">
            {[
              { key: "privacy", label: t("footer.privacy") },
              { key: "terms", label: t("footer.terms") },
              { key: "cookies", label: t("footer.cookies") },
              { key: "contact", label: t("footer.contact") },
            ].map((link) => (
              <a
                key={link.key}
                href="#"
                className={`font-body text-xs text-on-surface-variant hover:text-primary transition-colors duration-200 whitespace-nowrap ${focusRing}`}
              >
                {link.label}
              </a>
            ))}
          </nav>

          <Link
            href={`/${otherLocale}`}
            lang={otherLocale}
            className={`font-headline text-xs font-bold uppercase tracking-widest text-on-surface-variant hover:text-primary border border-white/10 px-3 py-1.5 transition-colors duration-200 ${focusRing}`}
          >
            {otherLocale === "zh" ? "中文" : "EN"}
          </Link>
        </div>

        <div className="max-w-7xl mx-auto mt-8">
          <p className="font-body text-xs text-on-surface-variant opacity-40">
            {t("footer.allRights")}
          </p>
        </div>
      </footer>
    </div>
  );
}
