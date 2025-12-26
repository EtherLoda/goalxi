# Match Simulation Polling Strategy & Testing Guide

## Smart Polling Strategy

### Fixed Polling Interval

Use a fixed 5-minute interval to balance resource usage and user experience:

```typescript
// Polling interval (in milliseconds)
const POLLING_INTERVAL = 5 * 60 * 1000; // 5 minutes (300,000 ms)

// Note: This means users may see events up to 5 minutes ahead of the "real-time" timeline
// This is acceptable for resource conservation, though it slightly reduces the real-time feel
```

### Implementation Strategy

1. **Fixed 5-minute polling** during active matches
2. **Use exponential backoff** on errors
3. **Stop polling** when match completes
4. **Respect page visibility** (pause when tab is hidden)
5. **Initial fetch** on component mount

## Testing Strategy

### 1. Unit Tests (Fast & Isolated)

Test polling logic without network calls:

```typescript
// frontend/hooks/__tests__/useMatchPolling.test.ts
describe('useMatchPolling', () => {
    it('should use correct interval for early match', () => {
        // Mock match at minute 15
        // Verify interval is 15000ms
    });
    
    it('should stop polling when match completes', () => {
        // Mock completed match
        // Verify polling stops
    });
    
    it('should pause polling when tab is hidden', () => {
        // Mock document.hidden = true
        // Verify polling pauses
    });
});
```

### 2. Integration Tests (API + Database)

Test full flow with test database:

```typescript
// api/src/api/match/__tests__/match-event.integration.spec.ts
describe('Match Event Service Integration', () => {
    it('should filter events by timeline correctly', async () => {
        // Create match scheduled 10 minutes ago
        // Generate all events
        // Request events - should only return events up to minute 10
    });
    
    it('should cache events in Redis', async () => {
        // Request events
        // Verify Redis cache is populated
        // Request again - verify cache hit
    });
});
```

### 3. E2E Tests (Full User Flow)

Test complete match lifecycle:

```typescript
// e2e/match-simulation.spec.ts
describe('Match Simulation E2E', () => {
    it('should simulate match and show events progressively', async () => {
        // 1. Create match
        // 2. Submit tactics
        // 3. Wait for deadline
        // 4. Trigger simulation
        // 5. Poll for events
        // 6. Verify events appear based on timeline
    });
});
```

### 4. Load Tests (Performance)

Test under realistic load:

```typescript
// tests/load/match-polling.load.test.ts
describe('Match Polling Load Test', () => {
    it('should handle 100 concurrent viewers', async () => {
        // Simulate 100 users polling same match
        // Measure response times
        // Verify Redis cache reduces DB load
    });
});
```

### 5. Manual Testing Scenarios

Easy-to-follow test cases:

#### Scenario 1: Normal Match Flow
1. Create match scheduled 5 minutes from now
2. Submit tactics for both teams
3. Wait 6 minutes (past deadline)
4. Verify match is queued automatically
5. Open match page
6. Verify events appear progressively
7. Verify polling stops when match completes

#### Scenario 2: Timeline Filtering
1. Create match with all events generated
2. Set match scheduled time to 20 minutes ago
3. Request events via API
4. Verify only events up to minute 20 are returned
5. Wait 1 minute
6. Request again - verify events up to minute 21

#### Scenario 3: Redis Caching
1. Clear Redis cache
2. Request match events (cache miss)
3. Verify events loaded from DB
4. Request again immediately (cache hit)
5. Verify response time is faster

## Recommended Polling Implementation

```typescript
// frontend/hooks/useMatchPolling.ts
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { api, MatchEventsResponse } from '@/lib/api';

const POLLING_INTERVAL = 5 * 60 * 1000; // 5 minutes

interface UseMatchPollingOptions {
    matchId: string;
    initialData?: MatchEventsResponse;
    enabled?: boolean;
}

export function useMatchPolling({ 
    matchId, 
    initialData, 
    enabled = true 
}: UseMatchPollingOptions) {
    const [data, setData] = useState<MatchEventsResponse | null>(initialData || null);
    const [error, setError] = useState<string | null>(null);
    const [isPolling, setIsPolling] = useState(false);
    
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const retryCountRef = useRef(0);

    // Fetch match events
    const fetchEvents = useCallback(async () => {
        try {
            const eventsData = await api.getMatchEvents(matchId);
            setData(eventsData);
            setError(null);
            retryCountRef.current = 0;
            
            // Stop polling if match is complete
            if (eventsData.isComplete) {
                setIsPolling(false);
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                }
                return;
            }
            
            // Continue polling if match is still active
            if (enabled && !eventsData.isComplete) {
                setIsPolling(true);
            }
            
        } catch (err) {
            console.error('Error fetching match events:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch events');
            
            // Exponential backoff on error (max 30 seconds)
            retryCountRef.current++;
            const backoffDelay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000);
            
            if (retryCountRef.current < 5 && enabled) {
                intervalRef.current = setTimeout(() => {
                    fetchEvents();
                }, backoffDelay);
            } else {
                setIsPolling(false);
            }
        }
    }, [matchId, enabled]);

    // Start polling
    useEffect(() => {
        if (!enabled) {
            setIsPolling(false);
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            return;
        }
        
        // Don't poll if match is already complete
        if (data?.isComplete) {
            setIsPolling(false);
            return;
        }
        
        setIsPolling(true);
        
        // Set up polling interval
        intervalRef.current = setInterval(() => {
            fetchEvents();
        }, POLLING_INTERVAL);
        
        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [enabled, data?.isComplete, fetchEvents]);

    // Pause polling when tab is hidden
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden) {
                // Pause polling
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                }
            } else if (enabled && !data?.isComplete) {
                // Resume polling
                setIsPolling(true);
                intervalRef.current = setInterval(() => {
                    fetchEvents();
                }, POLLING_INTERVAL);
            }
        };
        
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [enabled, data?.isComplete, fetchEvents]);

    return {
        data,
        error,
        isPolling,
        refetch: fetchEvents,
    };
}
```

## Testing Tools & Setup

### 1. Mock Time for Testing

```typescript
// tests/utils/time-mock.ts
export function mockTime(initialTime: Date) {
    const originalDate = global.Date;
    let currentTime = initialTime.getTime();
    
    global.Date = class extends originalDate {
        constructor(...args: any[]) {
            if (args.length === 0) {
                super(currentTime);
            } else {
                super(...args);
            }
        }
        
        static now() {
            return currentTime;
        }
    } as any;
    
    return {
        advanceTime: (ms: number) => {
            currentTime += ms;
        },
        setTime: (time: Date) => {
            currentTime = time.getTime();
        },
        restore: () => {
            global.Date = originalDate;
        },
    };
}
```

### 2. Test Match Factory

```typescript
// tests/factories/match.factory.ts
export async function createTestMatch(options: {
    scheduledMinutesFromNow?: number;
    status?: MatchStatus;
    hasEvents?: boolean;
}) {
    const scheduledAt = new Date(
        Date.now() + (options.scheduledMinutesFromNow || 0) * 60 * 1000
    );
    
    const match = await matchRepository.save({
        scheduledAt,
        status: options.status || MatchStatus.SCHEDULED,
        // ... other fields
    });
    
    if (options.hasEvents) {
        // Generate test events
        await generateTestEvents(match.id);
    }
    
    return match;
}
```

### 3. Redis Test Helper

```typescript
// tests/utils/redis-helper.ts
export async function clearMatchCache(matchId: string) {
    const redis = getRedisClient();
    await redis.del(`match:${matchId}:events`);
    await redis.del(`match:${matchId}:state`);
}

export async function getCachedEvents(matchId: string) {
    const redis = getRedisClient();
    const cached = await redis.lrange(`match:${matchId}:events`, 0, -1);
    return cached.map(e => JSON.parse(e));
}
```

## Performance Benchmarks

### Expected Metrics

- **Cache Hit Rate**: > 80% after first request
- **API Response Time** (cached): < 50ms
- **API Response Time** (DB fallback): < 200ms
- **Polling Overhead**: < 1% CPU usage per active viewer
- **Network Traffic**: ~2KB per poll (with compression)

### Monitoring

Add metrics to track:
- Polling frequency distribution
- Cache hit/miss rates
- Average response times
- Error rates
- Concurrent viewers per match

## Summary

**Recommended Polling Strategy:**
- **Fixed interval**: 5 minutes (300 seconds) for all active matches
- **Completed matches**: Stop polling
- **Tab hidden**: Pause polling (resume when visible)

**Benefits:**
- Minimal resource usage (12 requests per hour per viewer)
- Acceptable UX (events appear within 5 minutes)
- Simple implementation (no complex state management)
- Respects user's device (pauses when tab hidden)

**Trade-offs:**
- Users may see events up to 5 minutes ahead of "real-time" timeline
- Less immediate than shorter intervals, but acceptable for resource conservation

**Testing Approach:**
1. Unit tests for polling logic (fast)
2. Integration tests for API + Redis (medium)
3. E2E tests for full flow (slower but comprehensive)
4. Manual testing scenarios (for validation)
5. Load tests for performance (before production)

