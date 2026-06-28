'use client';

import type { ForumPost, Pagination } from '@/lib/forum-api';
import { PostCard } from './PostCard';

interface PostListProps {
    posts: ForumPost[];
    pagination?: Pagination;
    onDeleted?: () => void;
}

export function PostList({ posts, pagination, onDeleted }: PostListProps) {
    if (posts.length === 0) {
        return (
            <p className="text-center text-gray-500 py-6 text-sm italic">
                No replies yet. Be the first to respond.
            </p>
        );
    }
    return (
        <div className="space-y-3">
            {posts.map((p) => (
                <PostCard key={p.id} post={p} onDeleted={onDeleted} />
            ))}
            {pagination && pagination.totalPages > 1 && (
                <div className="text-center text-xs text-gray-500 mt-2">
                    Page {pagination.currentPage} of {pagination.totalPages}
                </div>
            )}
        </div>
    );
}
