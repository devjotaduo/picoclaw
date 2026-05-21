//go:build windows

package api

import "golang.org/x/sys/windows"

func fillDiskHealth(path string, entry *diskHealth) {
	pathPtr, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return
	}
	var freeAvailable uint64
	var totalBytes uint64
	var totalFree uint64
	if err := windows.GetDiskFreeSpaceEx(pathPtr, &freeAvailable, &totalBytes, &totalFree); err != nil {
		return
	}
	total := float64(totalBytes)
	free := float64(freeAvailable)
	used := total - free
	if total <= 0 {
		return
	}
	entry.Available = true
	entry.TotalGB = total / (1 << 30)
	entry.UsedGB = used / (1 << 30)
	entry.FreeGB = free / (1 << 30)
	entry.UsedPct = (1 - free/total) * 100
}
