package api

import (
	"bufio"
	"context"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"
)

var processStartedAt = time.Now()

type serverHealthResponse struct {
	Now       time.Time         `json:"now"`
	Host      hostHealth        `json:"host"`
	Process   processHealth     `json:"process"`
	Disks     []diskHealth      `json:"disks"`
	Docker    dockerHealth      `json:"docker"`
	Tenants   tenantHealth      `json:"tenants"`
	Container []containerHealth `json:"containers"`
}

type hostHealth struct {
	Hostname     string  `json:"hostname"`
	UptimeSec    int64   `json:"uptime_sec"`
	Load1        float64 `json:"load_1"`
	Load5        float64 `json:"load_5"`
	Load15       float64 `json:"load_15"`
	CPUCount     int     `json:"cpu_count"`
	MemTotalKB   int64   `json:"mem_total_kb"`
	MemFreeKB    int64   `json:"mem_free_kb"`
	MemAvailKB   int64   `json:"mem_available_kb"`
	SwapTotalKB  int64   `json:"swap_total_kb"`
	SwapFreeKB   int64   `json:"swap_free_kb"`
	KernelString string  `json:"kernel"`
}

type processHealth struct {
	UptimeSec    int64  `json:"uptime_sec"`
	GoVersion    string `json:"go_version"`
	NumGoroutine int    `json:"num_goroutine"`
	AllocBytes   uint64 `json:"alloc_bytes"`
	SysBytes     uint64 `json:"sys_bytes"`
	NumGC        uint32 `json:"num_gc"`
	PID          int    `json:"pid"`
}

type diskHealth struct {
	Path      string  `json:"path"`
	TotalGB   float64 `json:"total_gb"`
	UsedGB    float64 `json:"used_gb"`
	FreeGB    float64 `json:"free_gb"`
	UsedPct   float64 `json:"used_pct"`
	Available bool    `json:"available"`
}

type dockerHealth struct {
	Reachable      bool   `json:"reachable"`
	Error          string `json:"error,omitempty"`
	APIVersion     string `json:"api_version,omitempty"`
	ServerVersion  string `json:"server_version,omitempty"`
	OperatingSys   string `json:"operating_system,omitempty"`
	Driver         string `json:"storage_driver,omitempty"`
	NCPU           int    `json:"ncpu,omitempty"`
	MemTotal       int64  `json:"mem_total,omitempty"`
	ContainersAll  int    `json:"containers_all,omitempty"`
	ContainersUp   int    `json:"containers_running,omitempty"`
	ContainersDown int    `json:"containers_stopped,omitempty"`
	Images         int    `json:"images,omitempty"`
}

type tenantHealth struct {
	Active    int `json:"active"`
	Suspended int `json:"suspended"`
	Errors    int `json:"errors"`
	Managed   int `json:"managed_containers"`
	Running   int `json:"managed_running"`
	Stopped   int `json:"managed_stopped"`
}

type containerHealth struct {
	Name     string `json:"name"`
	TenantID string `json:"tenant_id"`
	Running  bool   `json:"running"`
}

func (h *Handler) handleServerHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	resp := serverHealthResponse{
		Now:     time.Now().UTC(),
		Host:    readHostHealth(),
		Process: readProcessHealth(),
		Disks:   readDiskHealth(h.diskPathsToProbe()),
		Docker:  dockerHealth{Reachable: false},
	}

	if h.Provisioner != nil && h.Provisioner.Docker != nil {
		dk := h.Provisioner.Docker
		if ver, err := dk.Ping(ctx); err != nil {
			resp.Docker.Error = err.Error()
		} else {
			resp.Docker.Reachable = true
			resp.Docker.APIVersion = ver
		}
		if resp.Docker.Reachable {
			if info, err := dk.Info(ctx); err == nil {
				resp.Docker.ServerVersion = info.ServerVersion
				resp.Docker.OperatingSys = info.OperatingSystem
				resp.Docker.Driver = info.Driver
				resp.Docker.NCPU = info.NCPU
				resp.Docker.MemTotal = info.MemTotal
				resp.Docker.ContainersAll = info.Containers
				resp.Docker.ContainersUp = info.ContainersRunning
				resp.Docker.ContainersDown = info.ContainersStopped + info.ContainersPaused
				resp.Docker.Images = info.Images
			}
			managed, err := dk.ListManaged(ctx)
			if err == nil {
				resp.Container = make([]containerHealth, 0, len(managed))
				for _, c := range managed {
					if c.Running {
						resp.Tenants.Running++
					} else {
						resp.Tenants.Stopped++
					}
					resp.Container = append(resp.Container, containerHealth{
						Name:     c.Name,
						TenantID: c.TenantID,
						Running:  c.Running,
					})
				}
				resp.Tenants.Managed = len(managed)
			}
		}
	}

	if h.Usage != nil {
		if stats, err := h.Usage.PlatformSummary(ctx); err == nil && stats != nil {
			resp.Tenants.Active = stats.ActiveTenants
			resp.Tenants.Suspended = stats.SuspendedTenants
			resp.Tenants.Errors = stats.ErrorTenants
		}
	}

	writeJSON(w, http.StatusOK, resp)
}

// diskPathsToProbe returns the host paths whose disk usage matters most for
// SaaS health: the root filesystem and the tenant volume root (where
// per-tenant $PICOCLAW_HOME directories live).
func (h *Handler) diskPathsToProbe() []string {
	paths := []string{"/"}
	if h.Cfg != nil && h.Cfg.TenantHostDataDir != "" && h.Cfg.TenantHostDataDir != "/" {
		paths = append(paths, h.Cfg.TenantHostDataDir)
	}
	return paths
}

func readHostHealth() hostHealth {
	hh := hostHealth{CPUCount: runtime.NumCPU()}
	if name, err := os.Hostname(); err == nil {
		hh.Hostname = name
	}
	if data, err := os.ReadFile("/proc/uptime"); err == nil {
		fields := strings.Fields(string(data))
		if len(fields) > 0 {
			if up, err := strconv.ParseFloat(fields[0], 64); err == nil {
				hh.UptimeSec = int64(up)
			}
		}
	}
	if data, err := os.ReadFile("/proc/loadavg"); err == nil {
		fields := strings.Fields(string(data))
		if len(fields) >= 3 {
			hh.Load1, _ = strconv.ParseFloat(fields[0], 64)
			hh.Load5, _ = strconv.ParseFloat(fields[1], 64)
			hh.Load15, _ = strconv.ParseFloat(fields[2], 64)
		}
	}
	if f, err := os.Open("/proc/meminfo"); err == nil {
		defer f.Close()
		sc := bufio.NewScanner(f)
		for sc.Scan() {
			parts := strings.Fields(sc.Text())
			if len(parts) < 2 {
				continue
			}
			val, err := strconv.ParseInt(parts[1], 10, 64)
			if err != nil {
				continue
			}
			switch parts[0] {
			case "MemTotal:":
				hh.MemTotalKB = val
			case "MemFree:":
				hh.MemFreeKB = val
			case "MemAvailable:":
				hh.MemAvailKB = val
			case "SwapTotal:":
				hh.SwapTotalKB = val
			case "SwapFree:":
				hh.SwapFreeKB = val
			}
		}
	}
	sys := readTrimmed("/proc/sys/kernel/ostype")
	rel := readTrimmed("/proc/sys/kernel/osrelease")
	hh.KernelString = strings.TrimSpace(sys + " " + rel)
	return hh
}

func readTrimmed(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

func readProcessHealth() processHealth {
	var ms runtime.MemStats
	runtime.ReadMemStats(&ms)
	return processHealth{
		UptimeSec:    int64(time.Since(processStartedAt).Seconds()),
		GoVersion:    runtime.Version(),
		NumGoroutine: runtime.NumGoroutine(),
		AllocBytes:   ms.Alloc,
		SysBytes:     ms.Sys,
		NumGC:        ms.NumGC,
		PID:          os.Getpid(),
	}
}

func readDiskHealth(paths []string) []diskHealth {
	out := make([]diskHealth, 0, len(paths))
	seen := map[string]struct{}{}
	for _, p := range paths {
		if _, ok := seen[p]; ok {
			continue
		}
		seen[p] = struct{}{}
		entry := diskHealth{Path: p}
		var st syscall.Statfs_t
		if err := syscall.Statfs(p, &st); err == nil {
			block := float64(st.Bsize)
			total := float64(st.Blocks) * block
			free := float64(st.Bavail) * block
			used := total - free
			if total > 0 {
				entry.Available = true
				entry.TotalGB = total / (1 << 30)
				entry.UsedGB = used / (1 << 30)
				entry.FreeGB = free / (1 << 30)
				entry.UsedPct = (1 - float64(st.Bavail)/float64(st.Blocks)) * 100
			}
		}
		out = append(out, entry)
	}
	return out
}
