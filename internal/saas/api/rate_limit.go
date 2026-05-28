package api

import (
	"sync"
	"time"
)

// rateLimiter is a tiny in-memory sliding-window rate limiter keyed by client
// identity (typically IP). It mirrors loginAttempts but is parameterizable so
// it can be reused for public endpoints like anonymous tenant chat.
//
// In-memory means it does not survive process restart and does not coordinate
// across multiple saas-admin replicas. That is acceptable here because the
// rate limit is a coarse abuse cap, not a billing gate.
type rateLimiter struct {
	mu     sync.Mutex
	byKey  map[string][]time.Time
	limit  int
	window time.Duration
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	if limit <= 0 {
		limit = 30
	}
	if window <= 0 {
		window = 10 * time.Minute
	}
	return &rateLimiter{
		byKey:  map[string][]time.Time{},
		limit:  limit,
		window: window,
	}
}

// Allow returns true if the caller may proceed; false if the rate limit is hit.
// Every call counts toward the window, including the one that returns false.
func (l *rateLimiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	cut := now.Add(-l.window)
	hist := l.byKey[key]
	kept := hist[:0]
	for _, t := range hist {
		if t.After(cut) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= l.limit {
		l.byKey[key] = kept
		return false
	}
	kept = append(kept, now)
	l.byKey[key] = kept
	return true
}
