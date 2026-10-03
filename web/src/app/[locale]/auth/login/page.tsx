"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AppIcon } from "@/components/icons/AppIcon";
import { AnimatedIcon } from "@/components/icons/AnimatedIcon";
import StadiumBackdrop from "@/components/auth/StadiumBackdrop";

export default function LoginPage() {
  const t = useTranslations();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotification(null);
    setIsLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setNotification({ type: 'error', message: err instanceof Error ? err.message : "Login failed" });
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-dismiss notification after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      {/* Notification Toast */}
      {notification && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-[200] flex flex-col w-full max-w-md px-4">
          <div className={`
            relative overflow-hidden rounded-2xl border backdrop-blur-2xl
            ${notification.type === 'success'
              ? 'bg-ink-600/95 border-accent/30 shadow-[0_0_30px_rgba(161,255,194,0.15)]'
              : 'bg-danger-surface/95 border-danger/30 shadow-[0_0_30px_rgba(255,100,100,0.1)]'
            }
          `}>
            {/* Accent line */}
            <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${
              notification.type === 'success' ? 'bg-accent' : 'bg-danger'
            }`} />

            {/* Content */}
            <div className="flex items-center gap-4 px-5 py-4 pl-6">
              <div className={`
                w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                ${notification.type === 'success'
                  ? 'bg-accent/10 text-accent'
                  : 'bg-danger/10 text-red-400'
                }
              `}>
                <AppIcon
                  name={notification.type === 'success' ? 'check_circle' : 'error'}
                  className="text-xl"
                />
              </div>

              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${
                  notification.type === 'success' ? 'text-frost' : 'text-red-200'
                }`}>
                  {notification.message}
                </p>
              </div>

              <button
                onClick={() => setNotification(null)}
                className={`
                  w-8 h-8 rounded-lg flex items-center justify-center shrink-0
                  transition-all duration-200 hover:scale-110
                  ${notification.type === 'success'
                    ? 'text-muted hover:text-frost hover:bg-accent/10'
                    : 'text-red-400/60 hover:text-red-300 hover:bg-danger/10'
                  }
                `}
                >
                  <AppIcon name="close" className="text-lg" />
                </button>
            </div>

            {/* Auto-dismiss progress bar */}
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-black/20">
              <div
                className={`h-full animate-[shrink_5s_linear_forwards] ${
                  notification.type === 'success'
                    ? 'bg-accent'
                    : 'bg-danger'
                }`}
                style={{
                  animation: 'shrink 5s linear forwards',
                }}
              />
            </div>
          </div>
        </div>
      )}
      <style jsx>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
      {/* Background */}
      <StadiumBackdrop />

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
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-surface-container-lowest border border-white/10 rounded-xl px-4 py-3 pr-12 font-body text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary focus:outline-none transition-colors"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle password visibility"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
                >
                  <AnimatedIcon
                    slot="password-visibility"
                    active={showPassword}
                    size={20}
                  />
                </button>
              </div>
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
              disabled={isLoading}
              className="w-full py-3.5 bg-primary text-on-primary font-headline font-bold text-sm uppercase tracking-widest rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Signing in..." : t("auth.login.submit")}
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
