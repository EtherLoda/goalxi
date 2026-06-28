'use client';

import { useState } from 'react';

interface ReplyFormProps {
    onSubmit: (body: string) => Promise<void>;
    disabled?: boolean;
    placeholder?: string;
}

const MIN = 10;
const MAX = 10000;

export function ReplyForm({ onSubmit, disabled, placeholder }: ReplyFormProps) {
    const [body, setBody] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const tooShort = body.length > 0 && body.length < MIN;
    const tooLong = body.length > MAX;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (disabled || submitting) return;
        if (body.length < MIN) {
            setError(`Reply must be at least ${MIN} characters.`);
            return;
        }
        if (body.length > MAX) {
            setError(`Reply must be at most ${MAX} characters.`);
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await onSubmit(body);
            setBody('');
        } catch (err: any) {
            setError(err?.message ?? 'Failed to post reply.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="mt-6">
            <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={placeholder ?? 'Write your reply...'}
                rows={4}
                className="w-full p-3 rounded bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none resize-y"
                disabled={disabled || submitting}
            />
            <div className="flex items-center justify-between mt-2">
                <div className="text-xs text-gray-500">
                    {body.length} / {MAX} characters
                    {tooShort && <span className="text-yellow-500 ml-2">(min {MIN})</span>}
                    {tooLong && <span className="text-red-500 ml-2">(too long)</span>}
                </div>
                <button
                    type="submit"
                    disabled={disabled || submitting || tooShort || tooLong}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                    {submitting ? 'Posting…' : 'Post Reply'}
                </button>
            </div>
            {error && (
                <p className="text-sm text-red-400 mt-2">{error}</p>
            )}
        </form>
    );
}
