'use client';

import type { ForumThread } from '@/lib/forum-api';

interface ThreadHeaderProps {
    thread: ForumThread;
}

export function ThreadHeader({ thread }: ThreadHeaderProps) {
    return (
        <div className="mb-6 pb-4 border-b border-gray-700">
            <div className="flex items-start gap-2 mb-2">
                {thread.isPinned && (
                    <span className="text-xs px-2 py-0.5 bg-yellow-900 text-yellow-200 rounded mt-1">
                        Pinned
                    </span>
                )}
                <h1 className="text-2xl font-bold text-white flex-1">{thread.title}</h1>
            </div>
            <div className="text-sm text-gray-400">
                Started by{' '}
                <span className="text-gray-300 font-medium">
                    {thread.author?.username ?? 'unknown'}
                </span>
                {' · '}
                {new Date(thread.createdAt).toLocaleString()}
            </div>
        </div>
    );
}
