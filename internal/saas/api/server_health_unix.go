//go:build !windows

package api

import "syscall"

func fillDiskHealth(path string, entry *diskHealth) {
	var st syscall.Statfs_t
	if err := syscall.Statfs(path, &st); err != nil {
		return
	}
	block := float64(st.Bsize)
	total := float64(st.Blocks) * block
	free := float64(st.Bavail) * block
	used := total - free
	if total <= 0 {
		return
	}
	entry.Available = true
	entry.TotalGB = total / (1 << 30)
	entry.UsedGB = used / (1 << 30)
	entry.FreeGB = free / (1 << 30)
	entry.UsedPct = (1 - float64(st.Bavail)/float64(st.Blocks)) * 100
}
