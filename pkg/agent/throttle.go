package agent

import (
	"sync"
	"time"
)

// behaviorThrottle enforces per-user (or per-session) rate limits and a global
// cooldown between consecutive bot responses. State is in-memory and per-process;
// it does not survive restarts.
//
// Two limits coexist:
//
//   - MaxMessagesPerMinutePerUser: a sliding window of timestamps per user; a
//     new message is rejected once the count within the last minute hits the
//     cap. Implemented with a simple ring buffer of recent timestamps.
//   - ResponseCooldownSeconds: the minimum gap between any two messages from
//     the same user. Cheaper than the sliding window, applied first.
type behaviorThrottle struct {
	mu      sync.Mutex
	buckets map[string]*throttleBucket
}

type throttleBucket struct {
	lastAt    time.Time
	timestamps []time.Time // sorted oldest→newest; entries older than 60s are pruned on access
}

func newBehaviorThrottle() *behaviorThrottle {
	return &behaviorThrottle{buckets: make(map[string]*throttleBucket)}
}

// Allow reports whether a new message from `key` should be accepted under the
// supplied limits. `key` is typically the canonical sender ID. A maxPerMin of
// 0 disables the per-minute cap; cooldownSeconds of 0 disables the cooldown.
func (t *behaviorThrottle) Allow(key string, maxPerMin int, cooldownSeconds int) bool {
	if key == "" || (maxPerMin <= 0 && cooldownSeconds <= 0) {
		return true
	}
	now := time.Now()
	t.mu.Lock()
	defer t.mu.Unlock()
	b, ok := t.buckets[key]
	if !ok {
		b = &throttleBucket{}
		t.buckets[key] = b
	}

	if cooldownSeconds > 0 {
		if !b.lastAt.IsZero() && now.Sub(b.lastAt) < time.Duration(cooldownSeconds)*time.Second {
			return false
		}
	}

	if maxPerMin > 0 {
		windowStart := now.Add(-time.Minute)
		// Prune timestamps older than the window. The slice is append-only and
		// kept sorted by construction.
		i := 0
		for i < len(b.timestamps) && b.timestamps[i].Before(windowStart) {
			i++
		}
		if i > 0 {
			b.timestamps = b.timestamps[i:]
		}
		if len(b.timestamps) >= maxPerMin {
			return false
		}
		b.timestamps = append(b.timestamps, now)
	}

	b.lastAt = now
	return true
}

// Reset clears throttle state for one key. Used by tests and by manual admin
// actions that need to forgive a throttled user.
func (t *behaviorThrottle) Reset(key string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.buckets, key)
}
