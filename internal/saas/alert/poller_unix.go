//go:build !windows

package alert

import "syscall"

// diskUsedPct returns the percentage of disk used at path. Linux/Darwin only;
// the Windows build uses a stub in poller_windows.go.
func diskUsedPct(path string) (float64, error) {
	var st syscall.Statfs_t
	if err := syscall.Statfs(path, &st); err != nil {
		return 0, err
	}
	total := float64(st.Blocks) * float64(st.Bsize)
	free := float64(st.Bavail) * float64(st.Bsize)
	if total == 0 {
		return 0, nil
	}
	return (1 - free/total) * 100, nil
}
