'use client';

import Link from 'next/link';
import type { ForumThread } from '@/lib/forum-api';

interface ThreadListItemProps {
    thread: ForumThread;
}

function timeAgo(iso: string | null): string {
    if (!iso) return '';
    const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
}

export function ThreadListItem({ thread }: ThreadListItemProps) {
    return (
        <Link
            href={`/forum/thread/${thread.id}`}
            className="flex items-start gap-3 p-4 border-b border-gray-700 hover:bg-gray-800 transition-colors"
        >
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    {thread.isPinned && (
                        <span className="text-xs px-1.5 py-0.5 bg-yellow-900 text-yellow-200 rounded">
                            Pinned
                        </span>
                    )}
                    <h4 className="text-white font-medium truncate">{thread.title}</h4>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>by {thread.author?.username ?? 'unknown'}</span>
                    <span>·</span>
                    <span>{timeAgo(thread.createdAt)}</span>
                </div>
            </div>
            <div className="text-right text-xs text-gray-500 shrink-0">
                <div>{thread.replyCount} replies</div>
                {thread.lastReplyAt && (
                    <div className="text-gray-600">last: {timeAgo(thread.lastReplyAt)}</div>
                )}
            </div>
        </Link>
    );
}
