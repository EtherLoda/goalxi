"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

export default function LoginPage() {
  const t = useTranslations();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: call auth API
    console.log({ email, password, remember });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      {/* Background */}
      <div className="fixed inset-0 z-0">
        <img
          alt="Stadium"
          className="w-full h-full object-cover grayscale brightness-30"
          src="https://images.unsplash.com/photo-1489944440615-453fc2b6a9a9?w=1920&q=80"
        />
        <div className="absolute inset-0 bg-surface/80" />
      </div>

      {/* Auth Card */}
      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <Link href="/en" className="inline-block">
            <span className="font-headline font-black text-2xl tracking-tighter text-primary uppercase">
              GoalXi
            </span>
          </Link>
        </div>

        <div className="glass-panel rounded-2xl p-10">
          <div className="mb-8">
            <h1 className="font-headline text-3xl font-black text-on-surface mb-2">
              {t("auth.login.title")}
            </h1>
            <p className="font-body text-sm text-on-surface-variant">
              {t("auth.login.subtitle")}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label className="block font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                {t("auth.login.email")}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-surface-container-lowest border border-white/10 rounded-xl px-4 py-3 font-body text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary focus:outline-none transition-colors"
                placeholder="manager@goalxi.com"
                required
              />
            </div>

            {/* Password */}
            <div>
              <label className="block font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                {t("auth.login.password")}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-surface-container-lowest border border-white/10 rounded-xl px-4 py-3 font-body text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary focus:outline-none transition-colors"
                placeholder="••••••••"
                required
              />
            </div>

            {/* Remember + Forgot */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-surface-container-lowest accent-primary"
                />
                <span className="font-body text-xs text-on-surface-variant">
                  {t("auth.login.rememberMe")}
                </span>
              </label>
              <a
                href="#"
                className="font-body text-xs text-primary hover:underline"
              >
                {t("auth.login.forgotPassword")}
              </a>
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="w-full py-3.5 bg-primary text-on-primary font-headline font-bold text-sm uppercase tracking-widest rounded-xl hover:opacity-90 transition-opacity"
            >
              {t("auth.login.submit")}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-4 my-6">
            <div className="flex-1 h-px bg-white/10" />
            <span className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">
              or
            </span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Register link */}
          <p className="text-center font-body text-sm text-on-surface-variant">
            {t("auth.login.noAccount")}{" "}
            <Link
              href="/auth/register"
              className="text-primary font-bold hover:underline"
            >
              {t("nav.signUp")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
