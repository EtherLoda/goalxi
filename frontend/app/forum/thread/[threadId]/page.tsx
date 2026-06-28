'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
    forumApi,
    ForumThread,
    ForumPost,
    PaginatedResponse,
} from '@/lib/forum-api';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ThreadHeader } from '@/components/forum/ThreadHeader';
import { PostList } from '@/components/forum/PostList';
import { ReplyForm } from '@/components/forum/ReplyForm';
import { useAuth } from '@/components/auth/AuthContext';

export default function ThreadPage() {
    const params = useParams();
    const threadId = params.threadId as string;
    const { isLoggedIn } = useAuth();

    const [thread, setThread] = useState<ForumThread | null>(null);
    const [postsData, setPostsData] = useState<PaginatedResponse<ForumPost> | null>(null);
    const [error, setError] = useState<string | null>(null);

    const loadAll = useCallback(async () => {
        try {
            const t = await forumApi.getThread(threadId);
            setThread(t);
            const posts = await forumApi.listPosts(threadId, { limit: 50 });
            setPostsData(posts);
        } catch (err: any) {
            setError(err?.message ?? 'Failed to load thread');
        }
    }, [threadId]);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    async function handleReply(body: string) {
        await forumApi.createPost(threadId, { body });
        await loadAll();
    }

    if (error) {
        return (
            <div className="max-w-3xl mx-auto p-4 sm:p-6">
                <div className="p-4 rounded bg-red-900 text-red-200 text-sm">{error}</div>
                <Link href="/forum" className="text-blue-400 hover:underline text-sm mt-4 inline-block">
                    ← Back to forum
                </Link>
            </div>
        );
    }

    if (!thread || !postsData) {
        return (
            <div className="flex justify-center py-16">
                <LoadingSpinner />
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto p-4 sm:p-6">
            <nav className="text-sm text-gray-400 mb-3">
                <Link href="/forum" className="hover:text-gray-200">Forum</Link>
            </nav>
            <ThreadHeader thread={thread} />

            <div className="p-4 bg-gray-800 border border-gray-700 rounded mb-6">
                <p className="text-gray-200 whitespace-pre-wrap break-words">{thread.body}</p>
            </div>

            <h2 className="text-lg font-semibold text-white mb-3">
                {thread.replyCount} {thread.replyCount === 1 ? 'reply' : 'replies'}
            </h2>
            <PostList
                posts={postsData.data}
                pagination={postsData.pagination}
                onDeleted={loadAll}
            />

            {isLoggedIn ? (
                <ReplyForm onSubmit={handleReply} />
            ) : (
                <div className="mt-6 p-3 rounded bg-gray-800 border border-gray-700 text-sm text-gray-400 text-center">
                    Log in to reply.
                </div>
            )}
        </div>
    );
}
