'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { forumApi, ForumCategory } from '@/lib/forum-api';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { NewThreadForm } from '@/components/forum/NewThreadForm';

export default function NewThreadPage() {
    const params = useParams();
    const slug = params.categorySlug as string;
    const [category, setCategory] = useState<ForumCategory | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        forumApi
            .getCategoryBySlug(slug)
            .then(setCategory)
            .catch((err: any) => setError(err?.message ?? 'Failed to load category'));
    }, [slug]);

    return (
        <div className="max-w-2xl mx-auto p-4 sm:p-6">
            <nav className="text-sm text-gray-400 mb-2">
                <Link href="/forum" className="hover:text-gray-200">Forum</Link>
                {' / '}
                {category && (
                    <>
                        <Link href={`/forum/${slug}`} className="hover:text-gray-200">
                            {category.name}
                        </Link>
                        {' / '}
                    </>
                )}
                <span className="text-gray-200">New Thread</span>
            </nav>
            <h1 className="text-2xl font-bold text-white mb-4">Start a new thread</h1>
            {error && (
                <div className="p-3 mb-4 rounded bg-red-900 text-red-200 text-sm">{error}</div>
            )}
            {!category && !error && (
                <div className="flex justify-center py-12">
                    <LoadingSpinner />
                </div>
            )}
            {category && (
                <NewThreadForm categoryId={category.id} categorySlug={slug} />
            )}
        </div>
    );
}
