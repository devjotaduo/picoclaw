package tenant

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/api/types/strslice"
	"github.com/docker/docker/api/types/system"
	"github.com/docker/docker/client"
)

type DockerClient struct {
	cli *client.Client
}

func NewDockerClient(host string) (*DockerClient, error) {
	cli, err := client.NewClientWithOpts(
		client.WithHost(host),
		client.WithAPIVersionNegotiation(),
	)
	if err != nil {
		return nil, err
	}
	return &DockerClient{cli: cli}, nil
}

func (d *DockerClient) Close() error { return d.cli.Close() }

// ContainerSpec describes a tenant container to create.
type ContainerSpec struct {
	Name        string
	Image       string
	Env         map[string]string
	HostVolume  string // bind source on host (primary mount → MountTarget)
	MountTarget string // bind target in container
	// ExtraMounts are appended after the primary HostVolume bind. Used to
	// bind-mount the workspace's frontend-dist into the container so the
	// launcher can serve a per-workspace custom build instead of its
	// embedded one. Empty for tenants without a built workspace frontend.
	ExtraMounts []ContainerMount
	MemLimitMB  int
	CPUQuota    float64 // e.g. 0.5
	NetworkEdge string
	NetworkLLM  string
	Labels      map[string]string
}

// ContainerMount is a single bind-mount pair added to a ContainerSpec
// alongside the primary HostVolume.
type ContainerMount struct {
	Source   string
	Target   string
	ReadOnly bool
}

func (d *DockerClient) CreateAndStart(ctx context.Context, spec ContainerSpec) (string, error) {
	env := make([]string, 0, len(spec.Env))
	for k, v := range spec.Env {
		env = append(env, k+"="+v)
	}
	cfg := &container.Config{
		Image:  spec.Image,
		Env:    env,
		Labels: spec.Labels,
	}
	mounts := make([]mount.Mount, 0, 1+len(spec.ExtraMounts))
	mounts = append(mounts, mount.Mount{
		Type:   mount.TypeBind,
		Source: spec.HostVolume,
		Target: spec.MountTarget,
	})
	for _, em := range spec.ExtraMounts {
		if em.Source == "" || em.Target == "" {
			continue
		}
		mounts = append(mounts, mount.Mount{
			Type:     mount.TypeBind,
			Source:   em.Source,
			Target:   em.Target,
			ReadOnly: em.ReadOnly,
		})
	}
	hostCfg := &container.HostConfig{
		// on-failure with cap on retries: a launcher that crashloops forever
		// (corrupt config, missing secret, OOM loop) spams the journal and
		// wastes IO. After 5 failures, leave it Exited and surface the error
		// to the operator instead of masking it.
		RestartPolicy: container.RestartPolicy{
			Name:              container.RestartPolicyOnFailure,
			MaximumRetryCount: 5,
		},
		Mounts: mounts,
		Resources: container.Resources{
			Memory:    int64(spec.MemLimitMB) * 1024 * 1024,
			NanoCPUs:  int64(spec.CPUQuota * 1e9),
			PidsLimit: ptrInt64(200),
		},
		// Hardening: tenant containers run agent code with tool execution —
		// any prompt-injection / arbitrary file read / RCE in a skill must
		// stay confined.
		CapDrop: strslice.StrSlice{"ALL"},
		SecurityOpt: []string{
			"no-new-privileges:true",
		},
		// Prefer killing the tenant before host processes under memory pressure.
		OomScoreAdj: 500,
		// /tmp must remain writable for go runtime, sqlite WAL, etc.; keep it
		// in tmpfs so it doesn't leave residue on the bind-mounted volume.
		Tmpfs: map[string]string{
			"/tmp": "rw,size=64m,mode=1777,nosuid,nodev,noexec",
		},
		// NOTE: ReadonlyRootfs not enabled — launcher writes transient state
		// outside the bind-mount (/root/.config, package caches). Enabling
		// requires auditing every write path. With CapDrop=ALL +
		// no-new-privs the residual attack surface is already much smaller.
	}
	netCfg := &network.NetworkingConfig{
		EndpointsConfig: map[string]*network.EndpointSettings{
			spec.NetworkEdge: {},
			spec.NetworkLLM:  {},
		},
	}

	resp, err := d.cli.ContainerCreate(ctx, cfg, hostCfg, netCfg, nil, spec.Name)
	if err != nil {
		return "", fmt.Errorf("create: %w", err)
	}
	if err := d.cli.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		_ = d.cli.ContainerRemove(ctx, resp.ID, container.RemoveOptions{Force: true})
		return "", fmt.Errorf("start: %w", err)
	}
	return resp.ID, nil
}

// WaitRunning polls Inspect until State.Running, or timeout.
func (d *DockerClient) WaitRunning(ctx context.Context, id string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for {
		insp, err := d.cli.ContainerInspect(ctx, id)
		if err != nil {
			return err
		}
		if insp.State != nil && insp.State.Running {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("container did not enter Running within %s", timeout)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(500 * time.Millisecond):
		}
	}
}

func (d *DockerClient) Stop(ctx context.Context, id string, timeoutSec int) error {
	err := d.cli.ContainerStop(ctx, id, container.StopOptions{Timeout: &timeoutSec})
	if isNotFound(err) {
		return nil // already gone
	}
	return err
}

func (d *DockerClient) Start(ctx context.Context, id string) error {
	return d.cli.ContainerStart(ctx, id, container.StartOptions{})
}

func (d *DockerClient) Remove(ctx context.Context, id string) error {
	err := d.cli.ContainerRemove(ctx, id, container.RemoveOptions{Force: true, RemoveVolumes: true})
	if isNotFound(err) {
		return ErrContainerNotFound
	}
	return err
}

func (d *DockerClient) RemoveTenantContainers(ctx context.Context, tenantID string, refs ...string) error {
	targets := map[string]struct{}{}
	add := func(ref string) {
		ref = strings.TrimSpace(ref)
		if ref != "" {
			targets[ref] = struct{}{}
		}
	}
	for _, ref := range refs {
		add(ref)
	}

	managed, err := d.ListManaged(ctx)
	if err != nil && len(targets) == 0 {
		return fmt.Errorf("list managed containers: %w", err)
	}
	if err == nil {
		for _, c := range managed {
			if c.TenantID != tenantID {
				continue
			}
			add(c.ID)
			add(c.Name)
		}
	}

	for ref := range targets {
		_ = d.Stop(ctx, ref, 10)
		if err := d.Remove(ctx, ref); err != nil && !errors.Is(err, ErrContainerNotFound) {
			return err
		}
	}
	return nil
}

func (d *DockerClient) Inspect(ctx context.Context, id string) (running bool, err error) {
	insp, err := d.cli.ContainerInspect(ctx, id)
	if err != nil {
		if isNotFound(err) {
			return false, ErrContainerNotFound
		}
		return false, err
	}
	return insp.State != nil && insp.State.Running, nil
}

// ContainerAddress returns a reachable Docker-network IP for a container.
// The preferred network is used when present; otherwise the first network
// with an assigned IPv4 address is returned.
func (d *DockerClient) ContainerAddress(ctx context.Context, ref, preferredNetwork string) (string, error) {
	insp, err := d.cli.ContainerInspect(ctx, ref)
	if err != nil {
		if isNotFound(err) {
			return "", ErrContainerNotFound
		}
		return "", err
	}
	if insp.NetworkSettings == nil || len(insp.NetworkSettings.Networks) == 0 {
		return "", fmt.Errorf("container has no networks")
	}
	preferredNetwork = strings.TrimSpace(preferredNetwork)
	if preferredNetwork != "" {
		if endpoint := insp.NetworkSettings.Networks[preferredNetwork]; endpoint != nil && endpoint.IPAddress != "" {
			return endpoint.IPAddress, nil
		}
	}
	for _, endpoint := range insp.NetworkSettings.Networks {
		if endpoint != nil && endpoint.IPAddress != "" {
			return endpoint.IPAddress, nil
		}
	}
	return "", fmt.Errorf("container has no network address")
}

// ManagedContainer summarizes a container created by Picoclaw SaaS (label
// picoclaw.saas.managed=true). Used by the reconciler to detect orphans.
type ManagedContainer struct {
	ID       string
	Name     string
	TenantID string
	Running  bool
}

// ListManaged returns all containers with the picoclaw.saas.managed=true label,
// regardless of state. Stopped tenant containers are still listed (for
// reconciliation), so we pass All=true.
func (d *DockerClient) ListManaged(ctx context.Context) ([]ManagedContainer, error) {
	f := filters.NewArgs()
	f.Add("label", "picoclaw.saas.managed=true")
	list, err := d.cli.ContainerList(ctx, container.ListOptions{All: true, Filters: f})
	if err != nil {
		return nil, err
	}
	out := make([]ManagedContainer, 0, len(list))
	for _, c := range list {
		name := ""
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}
		out = append(out, ManagedContainer{
			ID:       c.ID,
			Name:     name,
			TenantID: c.Labels["picoclaw.saas.tenant_id"],
			Running:  c.State == "running",
		})
	}
	return out, nil
}

// Logs fetches up to tail lines from the container's stdout+stderr.
// The Docker log stream has an 8-byte multiplexing header per chunk which is stripped.
func (d *DockerClient) Logs(ctx context.Context, containerID string, tail int) ([]string, error) {
	if tail <= 0 || tail > 1000 {
		tail = 200
	}
	opts := container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Tail:       fmt.Sprintf("%d", tail),
		Timestamps: true,
	}
	rc, err := d.cli.ContainerLogs(ctx, containerID, opts)
	if err != nil {
		return nil, err
	}
	defer rc.Close()

	var lines []string
	buf := make([]byte, 8)
	payloadBuf := make([]byte, 0, 4096)
	for {
		// Each Docker log frame: 8-byte header + payload
		if _, err := rc.Read(buf); err != nil {
			break // EOF or context done
		}
		// Bytes 4-7 (big-endian uint32) = payload length
		size := int(buf[4])<<24 | int(buf[5])<<16 | int(buf[6])<<8 | int(buf[7])
		if size <= 0 {
			continue
		}
		if cap(payloadBuf) < size {
			payloadBuf = make([]byte, size)
		}
		payload := payloadBuf[:size]
		if _, err := rc.Read(payload); err != nil {
			break
		}
		line := strings.TrimRight(string(payload), "\n\r")
		if line != "" {
			lines = append(lines, line)
		}
	}
	return lines, nil
}

var ErrContainerNotFound = fmt.Errorf("container not found")

func isNotFound(err error) bool {
	return err != nil && strings.Contains(strings.ToLower(err.Error()), "no such container")
}

func ptrInt64(v int64) *int64 { return &v }

// Ping returns the Docker daemon API version when reachable, or an error
// when the engine socket is unavailable.
func (d *DockerClient) Ping(ctx context.Context) (string, error) {
	p, err := d.cli.Ping(ctx)
	if err != nil {
		return "", err
	}
	return p.APIVersion, nil
}

// Info returns the Docker engine info used by the server-health page.
func (d *DockerClient) Info(ctx context.Context) (system.Info, error) {
	return d.cli.Info(ctx)
}
