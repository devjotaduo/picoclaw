//go:build windows

package alert

// On Windows, the controlplane is only used during local development inside
// a Linux container. We don't actually need disk monitoring during native
// Windows go builds for tests — diskUsedPct is a stub that returns 0.
func diskUsedPct(_ string) (float64, error) {
	return 0, nil
}
