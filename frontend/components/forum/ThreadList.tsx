'use client';

import type { ForumThread, Pagination } from '@/lib/forum-api';
import { ThreadListItem } from './ThreadListItem';

interface ThreadListProps {
    threads: ForumThread[];
    pagination?: Pagination;
}

export function ThreadList({ threads, pagination }: ThreadListProps) {
    if (threads.length === 0) {
        return (
            <div className="text-center py-12 text-gray-400">
                <p className="text-lg mb-2">No threads yet</p>
                <p className="text-sm">Be the first to start a discussion!</p>
            </div>
        );
    }
    return (
        <div>
            <div className="rounded-lg border border-gray-700 bg-gray-900 overflow-hidden">
                {threads.map((t) => (
                    <ThreadListItem key={t.id} thread={t} />
                ))}
            </div>
            {pagination && pagination.totalPages > 1 && (
                <div className="text-center text-xs text-gray-500 mt-4">
                    Page {pagination.currentPage} of {pagination.totalPages} ({pagination.totalRecords} total)
                </div>
            )}
        </div>
    );
}
