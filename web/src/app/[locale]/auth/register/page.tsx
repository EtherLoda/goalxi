"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter, useParams } from "next/navigation";

export default function RegisterPage() {
  const t = useTranslations();
  const { login } = useAuth();
  const router = useRouter();
  const params = useParams();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [teamName, setTeamName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locale = params.locale as string;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (teamName.trim().length < 2 || teamName.trim().length > 50) {
      // Mirror the backend's `UpdateTeamReqDto.name` budget
      // (2..50). The user sees the failure inline rather than
      // waiting for the server to bounce it.
      setError("Team name must be 2–50 characters");
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      // Register via API. The backend creates the user, queues
      // the verification email, and enqueues an async
      // `assign-team` job carrying `teamName` — the
      // settlement worker stamps that name directly onto the
      // new team row during claim, so the user lands on
      // `/dashboard` with a club name they recognize. We do
      // not wait for the team here.
      const res = await fetch("http://localhost:3000/api/v1/auth/email/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password, teamName: teamName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Registration failed");
      }

      // Auto login after register. The `login` call in
      // AuthContext fetches the user and the team — but on a
      // freshly-registered user the team is still being
      // claimed asynchronously, so it routes the user to
      // `/onboarding/select` instead of `/dashboard`.
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setIsLoading(false);
    }
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
          <Link href={`/${locale}`} className="inline-block">
            <span className="font-headline font-black text-2xl tracking-tighter text-primary uppercase">
              GoalXi
            </span>
          </Link>
        </div>

        <div className="glass-panel rounded-2xl p-10">
          <div className="mb-8">
            <h1 className="font-headline text-3xl font-black text-on-surface mb-2">
              {t("auth.register.title")}
            </h1>
            <p className="font-body text-sm text-on-surface-variant">
              {t("auth.register.subtitle")}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Username */}
            <div>
              <label className="block font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                {t("auth.register.username")}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-surface-container-lowest border border-white/10 rounded-xl px-4 py-3 font-body text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary focus:outline-none transition-colors"
                placeholder="YourManagerName"
                required
              />
            </div>

            {/* Email */}
            <div>
              <label className="block font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                {t("auth.register.email")}
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
                {t("auth.register.password")}
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

            {/* Team Name — rides the assign-team job so the new
                club has a real name the moment the user lands
                on the dashboard. Required, 2-50 chars. */}
            <div>
              <label className="block font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                {t("auth.register.teamName")}
              </label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                minLength={2}
                maxLength={50}
                className="w-full bg-surface-container-lowest border border-white/10 rounded-xl px-4 py-3 font-body text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary focus:outline-none transition-colors"
                placeholder="My Club FC"
                required
              />
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block font-label text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">
                {t("auth.register.confirmPassword")}
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full bg-surface-container-lowest border border-white/10 rounded-xl px-4 py-3 font-body text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary focus:outline-none transition-colors"
                placeholder="••••••••"
                required
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="mb-4 p-3 bg-error/20 border border-error/30 rounded-xl text-error text-sm">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 bg-primary text-on-primary font-headline font-bold text-sm uppercase tracking-widest rounded-xl hover:opacity-90 transition-opacity mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Creating account..." : t("auth.register.submit")}
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

          {/* Login link */}
          <p className="text-center font-body text-sm text-on-surface-variant">
            {t("auth.register.hasAccount")}{" "}
            <Link
              href={`/${locale}/auth/login`}
              className="text-primary font-bold hover:underline"
            >
              {t("nav.login")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
