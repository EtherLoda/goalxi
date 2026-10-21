"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { AppIcon } from "@/components/icons/AppIcon";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { initialsOf } from "@/components/player/profile/player-profile-primitives";
import { useAuth } from "@/contexts/AuthContext";
import { api, type ManagerPublic } from "@/lib/api";

/**
 * Public manager profile (`/managers/[id]`).
 *
 * Scope is deliberately narrow — identity only: name, handle, join
 * date, support badge, bio. No club, no record, no money. A visitor
 * list entry is a link to "who is this", not a scouting report, and
 * the club page is where a club is described.
 *
 * The bio is edited on `/settings/user` (the existing `UserProfileForm`
 * already writes nickname / avatar / bio through `PATCH /users/me`),
 * so this page never posts anything — it is read-only for everyone,
 * including its owner.
 */
function formatJoined(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export default function ManagerProfilePage() {
  const params = useParams();
  const locale = useLocale();
  const t = useTranslations("managers.profile");
  const { user } = useAuth();

  const managerId = typeof params?.id === "string" ? params.id : null;

  const [result, setResult] = useState<{
    id: string;
    data?: ManagerPublic;
    failed?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!managerId) return;

    let cancelled = false;

    api.managers
      .getById(managerId)
      .then((data) => {
        if (!cancelled) setResult({ id: managerId, data });
      })
      .catch(() => {
        // 404 (unknown or soft-deleted account) and a transport failure
        // are different stories, but the client cannot tell them apart
        // and neither is actionable — both get the neutral wording.
        if (!cancelled) setResult({ id: managerId, failed: true });
      });

    return () => {
      cancelled = true;
    };
  }, [managerId]);

  // Derived, never stored: the effect only writes an async result, so
  // there is no setState-in-effect and no flash of the previous manager
  // when the route id changes.
  const settled = result && result.id === managerId ? result : null;

  if (!managerId || settled?.failed) {
    return (
      <div className="mx-auto w-full max-w-[720px] pb-8">
        <GlassPanel>
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <AppIcon name="person" className="text-4xl text-outline" />
            <p className="font-headline text-title font-black text-on-surface">
              {t("notFound")}
            </p>
            <p className="max-w-[36ch] text-label text-on-surface-variant">
              {t("notFoundHint")}
            </p>
          </div>
        </GlassPanel>
      </div>
    );
  }

  if (!settled?.data) {
    return (
      <div className="mx-auto w-full max-w-[720px] pb-8">
        <GlassPanel>
          <div className="flex animate-pulse items-center gap-5">
            <div className="h-24 w-24 rounded-2xl bg-white/[0.05]" />
            <div className="flex-1 space-y-3">
              <div className="h-6 w-40 rounded bg-white/[0.05]" />
              <div className="h-4 w-56 rounded bg-white/[0.04]" />
            </div>
          </div>
        </GlassPanel>
      </div>
    );
  }

  const manager = settled.data;

  const isSelf = user?.id === manager.id;
  const joined = formatJoined(manager.joinedAt, locale);

  return (
    <div className="mx-auto w-full max-w-[720px] pb-8">
      <GlassPanel>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary/10">
            {manager.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={manager.avatar}
                alt={manager.displayName}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="font-headline text-2xl font-black text-primary">
                {initialsOf(manager.displayName)}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="truncate font-headline text-2xl font-black tracking-tight text-on-surface">
              {manager.displayName}
            </h1>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-on-surface-variant">
              <span className="font-label tabular-nums">@{manager.username}</span>
              <span className="text-outline" aria-hidden>
                ·
              </span>
              <span>
                {t("joined", { date: joined })}
              </span>
            </div>

            {manager.supporterLevel > 0 && (
              <span className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-signal-gold/15 px-2 py-1 font-label text-kicker font-bold uppercase tracking-wide text-signal-gold">
                <AppIcon name="star" className="text-[13px]" />
                {t("supporter", { level: manager.supporterLevel })}
              </span>
            )}
          </div>

          {isSelf && (
            <Link
              href={`/${locale}/settings/user`}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-outline-variant/40 px-tight font-label text-label font-bold text-on-surface-variant transition hover:border-primary/40 hover:text-primary"
            >
              <AppIcon name="edit" className="text-[15px]" />
              {t("edit")}
            </Link>
          )}
        </div>

        <div className="mt-5 border-t border-outline-variant/30 pt-5">
          <p className="font-label text-kicker font-bold uppercase tracking-[0.2em] text-primary/70">
            {t("bio")}
          </p>
          {manager.bio ? (
            <p className="mt-2 whitespace-pre-wrap text-body leading-relaxed text-on-surface">
              {manager.bio}
            </p>
          ) : (
            <p className="mt-2 text-label text-on-surface-variant">{t("noBio")}</p>
          )}
        </div>
      </GlassPanel>
    </div>
  );
}
