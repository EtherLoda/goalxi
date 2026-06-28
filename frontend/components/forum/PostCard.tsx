'use client';

import { useState } from 'react';
import type { ForumPost } from '@/lib/forum-api';
import { forumApi } from '@/lib/forum-api';
import { useAuth } from '@/components/auth/AuthContext';
import { ReactionButton } from './ReactionButton';

interface PostCardProps {
    post: ForumPost;
    onDeleted?: () => void;
}

export function PostCard({ post, onDeleted }: PostCardProps) {
    const { user } = useAuth();
    const [deleting, setDeleting] = useState(false);
    const [removed, setRemoved] = useState(false);
    const isAuthor = user?.id === post.authorId;

    async function handleDelete() {
        if (!confirm('Delete this post? This cannot be undone.')) return;
        setDeleting(true);
        try {
            await forumApi.deletePost(post.id);
            setRemoved(true);
            onDeleted?.();
        } catch (err) {
            console.error('Failed to delete post', err);
            alert('Failed to delete post.');
        } finally {
            setDeleting(false);
        }
    }

    if (removed) {
        return (
            <div className="p-4 bg-gray-800 border border-gray-700 rounded text-sm text-gray-500 italic">
                [deleted]
            </div>
        );
    }

    return (
        <div className="p-4 bg-gray-800 border border-gray-700 rounded">
            <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-400">
                    <span className="text-gray-300 font-medium">
                        {post.author?.username ?? 'unknown'}
                    </span>
                    {' · '}
                    {new Date(post.createdAt).toLocaleString()}
                </div>
                <div className="flex items-center gap-2">
                    <ReactionButton
                        postId={post.id}
                        initialCount={post.reactionCount}
                    />
                    {isAuthor && (
                        <button
                            onClick={handleDelete}
                            disabled={deleting}
                            className="text-xs px-2 py-1 text-red-400 hover:text-red-300 disabled:opacity-50"
                        >
                            {deleting ? 'Deleting…' : 'Delete'}
                        </button>
                    )}
                </div>
            </div>
            <p className="text-gray-200 whitespace-pre-wrap break-words">{post.body}</p>
        </div>
    );
}
