'use client';

import { useEffect, useState } from 'react';
import { forumApi, ForumCategory } from '@/lib/forum-api';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { CategoryList } from '@/components/forum/CategoryList';

export default function ForumIndexPage() {
    const [categories, setCategories] = useState<ForumCategory[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        forumApi
            .listCategories()
            .then((data) => {
                if (!cancelled) setCategories(data);
            })
            .catch((err: any) => {
                if (!cancelled) setError(err?.message ?? 'Failed to load categories');
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Community Forum</h1>
            <p className="text-sm text-gray-400 mb-6">
                Talk tactics, transfers, and the game with other managers.
            </p>
            {error && (
                <div className="p-3 mb-4 rounded bg-red-900 text-red-200 text-sm">{error}</div>
            )}
            {!categories && !error && (
                <div className="flex justify-center py-12">
                    <LoadingSpinner />
                </div>
            )}
            {categories && <CategoryList categories={categories} />}
        </div>
    );
}
