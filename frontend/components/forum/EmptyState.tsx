'use client';

interface EmptyStateProps {
    title: string;
    description?: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
    return (
        <div className="text-center py-12 px-4 text-gray-400">
            <p className="text-lg mb-1">{title}</p>
            {description && (
                <p className="text-sm text-gray-500">{description}</p>
            )}
        </div>
    );
}
