import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { locales, type Locale } from "../../i18n";
import AppShell from "@/components/AppShell";
import { AuthProvider } from "@/contexts/AuthContext";
import { TeamViewProvider } from "@/contexts/TeamViewContext";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;

  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  setRequestLocale(locale);
  // Pass `locale` explicitly so the React `cache()` inside `getConfig`
  // keys on the resolved locale. Without it, both the (now-removed)
  // root layout and this layout would hit the same `undefined`-keyed
  // cache entry, returning the wrong messages file.
  const messages = await getMessages({ locale });

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AuthProvider>
        <TeamViewProvider>
          <AppShell locale={locale}>{children}</AppShell>
        </TeamViewProvider>
      </AuthProvider>
    </NextIntlClientProvider>
  );
}
