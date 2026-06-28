'use client';

import Link from 'next/link';
import type { ForumCategory } from '@/lib/forum-api';

interface CategoryCardProps {
    category: ForumCategory;
}

export function CategoryCard({ category }: CategoryCardProps) {
    return (
        <Link
            href={`/forum/${category.slug}`}
            className="block p-5 rounded-lg border border-gray-700 hover:border-blue-500 transition-colors bg-gray-800"
        >
            <h3 className="text-lg font-semibold text-white mb-1">{category.name}</h3>
            {category.description && (
                <p className="text-sm text-gray-400 mb-3">{category.description}</p>
            )}
            <div className="flex gap-4 text-xs text-gray-500">
                <span>{category.threadCount} threads</span>
                <span>{category.postCount} posts</span>
            </div>
        </Link>
    );
}
