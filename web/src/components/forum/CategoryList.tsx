"use client";

import type { ForumCategory } from "@/lib/forum-api";
import { useTranslations } from "next-intl";
import CategoryCard from "./CategoryCard";

interface CategoryListProps {
  categories: ForumCategory[];
}

export default function CategoryList({ categories }: CategoryListProps) {
  const t = useTranslations("forum");
  if (categories.length === 0) {
    return (
      <div className="glass-panel p-12 rounded-2xl border border-outline-variant/10 text-center">
        <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 mb-3 block">
          forum
        </span>
        <p className="font-headline text-on-surface-variant">{t("emptyCategories")}</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {categories.map((c) => (
        <CategoryCard key={c.id} category={c} />
      ))}
    </div>
  );
}