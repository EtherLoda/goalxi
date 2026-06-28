'use client';

import type { ForumCategory } from '@/lib/forum-api';
import { CategoryCard } from './CategoryCard';

interface CategoryListProps {
    categories: ForumCategory[];
}

export function CategoryList({ categories }: CategoryListProps) {
    if (categories.length === 0) {
        return (
            <p className="text-gray-400">No categories yet.</p>
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
