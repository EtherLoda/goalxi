"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { AppIcon } from "@/components/icons/AppIcon";

interface NavItem {
  slug: string;
  labelKey: "nav.market" | "nav.shortlist" | "nav.history";
  icon: "travel_explore" | "bookmark" | "history";
}

const ITEMS: readonly NavItem[] = [
  { slug: "", labelKey: "nav.market", icon: "travel_explore" },
  { slug: "/shortlist", labelKey: "nav.shortlist", icon: "bookmark" },
  { slug: "/history", labelKey: "nav.history", icon: "history" },
];

/**
 * The three transfer surfaces had no way to reach each other: the market
 * page, the shortlist and the history page each rendered their own header
 * and nothing linked them. This is the shared tab strip.
 */
export default function TransferNav() {
  const t = useTranslations("transfers");
  const pathname = usePathname();
  const params = useParams();
  const locale = params.locale as string;
  const base = `/${locale}/transfers`;

  return (
    <nav
      aria-label={t("title")}
      className="flex w-fit items-center gap-1 rounded-xl bg-surface-container p-1"
    >
      {ITEMS.map((item) => {
        const href = `${base}${item.slug}`;
        // Exact match for the market tab, prefix match for the sub-pages —
        // otherwise "market" would stay active on /transfers/shortlist.
        const active = item.slug === "" ? pathname === base : pathname.startsWith(href);

        return (
          <Link
            key={item.slug || "market"}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex h-9 items-center gap-tight rounded-lg px-tight font-label text-label font-bold transition-colors duration-quick ${
              active
                ? "bg-primary text-on-primary"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            <AppIcon name={item.icon} className="text-label" />
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
