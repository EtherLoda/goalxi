'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { forumApi } from '@/lib/forum-api';

interface NewThreadFormProps {
    categoryId: string;
    categorySlug: string;
}

const TITLE_MIN = 5;
const TITLE_MAX = 200;
const BODY_MIN = 10;
const BODY_MAX = 10000;

export function NewThreadForm({ categoryId, categorySlug }: NewThreadFormProps) {
    const router = useRouter();
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const titleError =
        title.length > 0 && title.length < TITLE_MIN
            ? `Title must be at least ${TITLE_MIN} characters`
            : title.length > TITLE_MAX
                ? `Title must be at most ${TITLE_MAX} characters`
                : null;
    const bodyError =
        body.length > 0 && body.length < BODY_MIN
            ? `Body must be at least ${BODY_MIN} characters`
            : body.length > BODY_MAX
                ? `Body must be at most ${BODY_MAX} characters`
                : null;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (submitting) return;
        if (titleError || bodyError) return;
        setSubmitting(true);
        setError(null);
        try {
            const thread = await forumApi.createThread(categoryId, {
                title: title.trim(),
                body: body.trim(),
            });
            router.push(`/forum/thread/${thread.id}`);
        } catch (err: any) {
            setError(err?.message ?? 'Failed to create thread.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                    Title
                </label>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="What is this thread about?"
                    maxLength={TITLE_MAX + 50}
                    className="w-full p-2 rounded bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                    disabled={submitting}
                />
                <div className="text-xs text-gray-500 mt-1">
                    {title.length} / {TITLE_MAX} characters
                    {titleError && (
                        <span className="text-yellow-500 ml-2">{titleError}</span>
                    )}
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                    Body
                </label>
                <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Write your post here..."
                    rows={8}
                    className="w-full p-3 rounded bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none resize-y"
                    disabled={submitting}
                />
                <div className="text-xs text-gray-500 mt-1">
                    {body.length} / {BODY_MAX} characters
                    {bodyError && (
                        <span className="text-yellow-500 ml-2">{bodyError}</span>
                    )}
                </div>
            </div>
            {error && (
                <p className="text-sm text-red-400">{error}</p>
            )}
            <div className="flex items-center gap-3">
                <button
                    type="submit"
                    disabled={
                        submitting ||
                        !!titleError ||
                        !!bodyError ||
                        title.length < TITLE_MIN ||
                        body.length < BODY_MIN
                    }
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                    {submitting ? 'Posting…' : 'Post Thread'}
                </button>
                <button
                    type="button"
                    onClick={() => router.push(`/forum/${categorySlug}`)}
                    disabled={submitting}
                    className="px-4 py-2 text-gray-400 hover:text-gray-200 text-sm"
                >
                    Cancel
                </button>
            </div>
        </form>
    );
}
