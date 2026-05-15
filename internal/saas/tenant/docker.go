package tenant

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/mount"
	"github.com/docker/docker/api/types/network"
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
	HostVolume  string // bind source on host
	MountTarget string // bind target in container
	MemLimitMB  int
	CPUQuota    float64 // e.g. 0.5
	NetworkEdge string
	NetworkLLM  string
	Labels      map[string]string
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
	hostCfg := &container.HostConfig{
		RestartPolicy: container.RestartPolicy{Name: container.RestartPolicyUnlessStopped},
		Mounts: []mount.Mount{{
			Type:   mount.TypeBind,
			Source: spec.HostVolume,
			Target: spec.MountTarget,
		}},
		Resources: container.Resources{
			Memory:    int64(spec.MemLimitMB) * 1024 * 1024,
			NanoCPUs:  int64(spec.CPUQuota * 1e9),
			PidsLimit: ptrInt64(200),
		},
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
	err := d.cli.ContainerRemove(ctx, id, container.RemoveOptions{Force: true})
	if isNotFound(err) {
		return ErrContainerNotFound
	}
	return err
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

var ErrContainerNotFound = fmt.Errorf("container not found")

func isNotFound(err error) bool {
	return err != nil && strings.Contains(strings.ToLower(err.Error()), "no such container")
}

func ptrInt64(v int64) *int64 { return &v }
