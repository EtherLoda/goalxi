'use client';

import { useState } from 'react';
import { forumApi } from '@/lib/forum-api';
import { useAuth } from '@/components/auth/AuthContext';

interface ReactionButtonProps {
    postId: string;
    initialCount: number;
    initialHasReacted?: boolean;
    onChange?: (count: number, hasReacted: boolean) => void;
}

export function ReactionButton({
    postId,
    initialCount,
    initialHasReacted = false,
    onChange,
}: ReactionButtonProps) {
    const { isLoggedIn } = useAuth();
    const [count, setCount] = useState(initialCount);
    const [hasReacted, setHasReacted] = useState(initialHasReacted);
    const [loading, setLoading] = useState(false);

    async function toggle() {
        if (!isLoggedIn || loading) return;
        setLoading(true);
        try {
            const res = await forumApi.toggleReaction(postId);
            setCount(res.count);
            setHasReacted(res.hasReacted);
            onChange?.(res.count, res.hasReacted);
        } catch (err) {
            console.error('Failed to toggle reaction', err);
        } finally {
            setLoading(false);
        }
    }

    return (
        <button
            onClick={toggle}
            disabled={!isLoggedIn || loading}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                hasReacted
                    ? 'bg-blue-900 text-blue-200'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            aria-label={hasReacted ? 'Unlike' : 'Like'}
        >
            <span>👍</span>
            <span>{count}</span>
        </button>
    );
}
