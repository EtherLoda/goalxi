'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api, MatchEventsResponse } from '@/lib/api';

export function useMatchPolling(matchId: string, initialData?: MatchEventsResponse) {
    const [data, setData] = useState<MatchEventsResponse | null>(initialData || null);
    const [error, setError] = useState<string | null>(null);
    const [isPolling, setIsPolling] = useState(true);

    // Use a ref to track if we should be polling, to handle visibility changes
    // while preserving the user's intent or match state
    const shouldPollRef = useRef(true);

    const fetchData = useCallback(async () => {
        try {
            const eventsData = await api.getMatchEvents(matchId);
            setData(eventsData);

            if (eventsData.isComplete) {
                setIsPolling(false);
                shouldPollRef.current = false;
            }
        } catch (err) {
            console.error('Error fetching match events:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch events');
        }
    }, [matchId]);

    useEffect(() => {
        if (!isPolling) return;

        // Fetch immediately on mount if no initial data
        if (!initialData) {
            fetchData();
        }

        const intervalId = setInterval(() => {
            if (document.visibilityState === 'visible' && shouldPollRef.current) {
                fetchData();
            }
        }, 5 * 60 * 1000); // 5 minutes

        // Handle visibility change
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && shouldPollRef.current) {
                fetchData(); // Fetch immediately when coming back
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isPolling, fetchData, initialData]);

    return {
        data,
        error,
        isPolling
    };
}
