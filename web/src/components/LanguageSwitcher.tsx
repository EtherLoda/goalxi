"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

type Locale = "en" | "zh";

interface LanguageSwitcherProps {
  locale: Locale;
}

export default function LanguageSwitcher({ locale }: LanguageSwitcherProps) {
  const t = useTranslations("langSwitcher");
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const switchLocale = (nextLocale: Locale) => {
    const segments = pathname.split("/");
    // pathname is like /en/... or /zh/...
    segments[1] = nextLocale;
    const newPath = segments.join("/");

    startTransition(() => {
      router.push(newPath);
    });
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2">
      {/* EN button */}
      <button
        onClick={() => switchLocale("en")}
        disabled={isPending || locale === "en"}
        className={`
          px-3 py-1.5 text-xs font-headline font-bold uppercase tracking-widest rounded-lg border transition-all
          ${locale === "en"
            ? "bg-primary text-on-primary border-primary"
            : "bg-surface-container-low text-on-surface-variant border-white/10 hover:border-primary hover:text-primary"
          }
          disabled:opacity-40 disabled:cursor-default
        `}
      >
        EN
      </button>
      {/* ZH button */}
      <button
        onClick={() => switchLocale("zh")}
        disabled={isPending || locale === "zh"}
        className={`
          px-3 py-1.5 text-xs font-headline font-bold uppercase tracking-widest rounded-lg border transition-all
          ${locale === "zh"
            ? "bg-primary text-on-primary border-primary"
            : "bg-surface-container-low text-on-surface-variant border-white/10 hover:border-primary hover:text-primary"
          }
          disabled:opacity-40 disabled:cursor-default
        `}
      >
        中文
      </button>
    </div>
  );
}
