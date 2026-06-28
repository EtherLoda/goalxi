'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
    forumApi,
    ForumCategory,
    ForumThread,
    Pagination,
    ThreadSort,
} from '@/lib/forum-api';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ThreadList } from '@/components/forum/ThreadList';
import { EmptyState } from '@/components/forum/EmptyState';
import { useAuth } from '@/components/auth/AuthContext';

export default function CategoryPage() {
    const params = useParams();
    const router = useRouter();
    const slug = params.categorySlug as string;
    const { isLoggedIn } = useAuth();

    const [category, setCategory] = useState<ForumCategory | null>(null);
    const [threads, setThreads] = useState<ForumThread[] | null>(null);
    const [pagination, setPagination] = useState<Pagination | null>(null);
    const [sort, setSort] = useState<ThreadSort>('latest');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setCategory(null);
        setThreads(null);
        setError(null);

        forumApi
            .getCategoryBySlug(slug)
            .then(async (cat) => {
                if (cancelled) return;
                setCategory(cat);
                const result = await forumApi.listThreads(cat.id, { sort });
                if (cancelled) return;
                setThreads(result.data);
                setPagination(result.pagination);
            })
            .catch((err: any) => {
                if (!cancelled) setError(err?.message ?? 'Failed to load category');
            });

        return () => {
            cancelled = true;
        };
    }, [slug, sort]);

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-6">
            <nav className="text-sm text-gray-400 mb-2">
                <Link href="/forum" className="hover:text-gray-200">Forum</Link>
                {' / '}
                <span className="text-gray-200">{category?.name ?? '...'}</span>
            </nav>

            {error && (
                <div className="p-3 mb-4 rounded bg-red-900 text-red-200 text-sm">{error}</div>
            )}

            {category && (
                <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
                    <div className="flex-1 min-w-0">
                        <h1 className="text-2xl font-bold text-white">{category.name}</h1>
                        {category.description && (
                            <p className="text-sm text-gray-400 mt-1">{category.description}</p>
                        )}
                    </div>
                    {isLoggedIn && (
                        <button
                            onClick={() => router.push(`/forum/${slug}/new`)}
                            className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                        >
                            + New Thread
                        </button>
                    )}
                </div>
            )}

            <div className="flex items-center gap-2 mb-4">
                <span className="text-xs text-gray-500">Sort:</span>
                {(['latest', 'hot'] as ThreadSort[]).map((s) => (
                    <button
                        key={s}
                        onClick={() => setSort(s)}
                        className={`text-xs px-2 py-1 rounded ${
                            sort === s
                                ? 'bg-blue-900 text-blue-200'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}
                    >
                        {s === 'latest' ? 'Latest' : 'Hot'}
                    </button>
                ))}
            </div>

            {!threads && !error && (
                <div className="flex justify-center py-12">
                    <LoadingSpinner />
                </div>
            )}
            {threads && threads.length === 0 && (
                <EmptyState
                    title="No threads in this category yet"
                    description={isLoggedIn ? 'Be the first to start a discussion.' : 'Log in to start a discussion.'}
                />
            )}
            {threads && threads.length > 0 && (
                <ThreadList threads={threads} pagination={pagination ?? undefined} />
            )}
        </div>
    );
}
