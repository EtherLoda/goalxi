"use client";

import { Suspense } from "react";
import { useAuth } from "@/contexts/AuthContext";
import Sidebar from "@/components/dashboard/Sidebar";
import GlobalHeader from "@/components/GlobalHeader";
import { usePathname } from "next/navigation";

interface AppShellProps {
  locale: string;
  children: React.ReactNode;
}

// Routes that don't need sidebar/header
const PUBLIC_ROUTES = ["/", "/auth/login", "/auth/register"];

export default function AppShell({ locale, children }: AppShellProps) {
  const { user } = useAuth();
  const pathname = usePathname();

  // Check if current route is public
  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === `/${locale}${route}` || pathname === route
  );

  // Don't show sidebar/header only for public routes (allow anonymous viewing)
  if (isPublicRoute) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar />
      <div className="fixed top-0 left-64 right-0 z-50">
        <Suspense fallback={<div className="h-16 bg-surface/70" />}>
          <GlobalHeader locale={locale} />
        </Suspense>
      </div>
      <main className="pt-16 pl-64">{children}</main>
    </>
  );
}
