"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

interface HeaderProps {
  title?: string;
  showUser?: boolean;
  actions?: React.ReactNode;
}

export default function Header({ title, showUser = true, actions }: HeaderProps) {
  const params = useParams();
  const locale = params.locale as string || "en";
  const { user } = useAuth();

  return (
    <header className="h-16 bg-[#00110c]/70 backdrop-blur-2xl border-b border-white/5 flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-8">
        {title && (
          <h1 className="font-headline font-black text-sm uppercase tracking-[0.2em] text-[#a1ffc2]">
            {title}
          </h1>
        )}
        {actions}
      </div>
      <div className="flex items-center gap-4">
        <Link
          href={`/${locale}/transfers`}
          className="p-2 text-[#91b2a6] hover:text-[#a1ffc2] transition-colors"
        >
          <span className="material-symbols-outlined">storefront</span>
        </Link>
        <button className="p-2 text-[#91b2a6] hover:text-[#a1ffc2] transition-colors">
          <span className="material-symbols-outlined">notifications</span>
        </button>
        {showUser && (
          <>
            <div className="w-px h-6 bg-white/10" />
            <div className="w-8 h-8 rounded-full bg-[#a1ffc2]/20 border border-[#a1ffc2]/30 flex items-center justify-center">
              <span className="font-headline font-black text-xs text-[#a1ffc2]">
                {user?.nickname?.charAt(0) || "U"}
              </span>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
