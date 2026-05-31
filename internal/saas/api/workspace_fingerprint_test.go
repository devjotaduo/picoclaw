package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/sipeed/picoclaw/internal/saas/store"
	"github.com/sipeed/picoclaw/internal/saas/tenant"
)

func TestWorkspaceFingerprintExtractedBaselineMatchesEmbeddedBaseline(t *testing.T) {
	homeDir := t.TempDir()
	if err := extractEmbeddedBaseline(homeDir); err != nil {
		t.Fatalf("extractEmbeddedBaseline: %v", err)
	}

	fp, err := fingerprintWorkspaceHomeDir(homeDir)
	if err != nil {
		t.Fatalf("fingerprintWorkspaceHomeDir: %v", err)
	}
	baseline, err := fingerprintEmbeddedBaseline()
	if err != nil {
		t.Fatalf("fingerprintEmbeddedBaseline: %v", err)
	}
	if fp.HashSHA256 != baseline.HashSHA256 {
		t.Fatalf("hash = %s, want embedded baseline %s", fp.HashSHA256, baseline.HashSHA256)
	}
	if fp.FileCount != baseline.FileCount {
		t.Fatalf("file count = %d, want embedded baseline %d", fp.FileCount, baseline.FileCount)
	}
}

func TestWorkspaceFingerprintIgnoresRuntimeState(t *testing.T) {
	homeDir := t.TempDir()
	if err := extractEmbeddedBaseline(homeDir); err != nil {
		t.Fatalf("extractEmbeddedBaseline: %v", err)
	}
	before, err := fingerprintWorkspaceHomeDir(homeDir)
	if err != nil {
		t.Fatalf("fingerprint before: %v", err)
	}

	runtimeFiles := map[string]string{
		"workspace/sessions/session.jsonl":          "{}\n",
		"workspace/agents/sofia/state/runtime.json": `{"seen":true}`,
		"workspace/agents/sofia/heartbeat.log":      "tick\n",
		"workspace/.cache/temp.bin":                 "cache",
	}
	for rel, body := range runtimeFiles {
		full := filepath.Join(homeDir, filepath.FromSlash(rel))
		if err := mkdirWriteFile(full, body); err != nil {
			t.Fatalf("write runtime file %s: %v", rel, err)
		}
	}

	after, err := fingerprintWorkspaceHomeDir(homeDir)
	if err != nil {
		t.Fatalf("fingerprint after: %v", err)
	}
	if after != before {
		t.Fatalf("runtime files changed fingerprint: before=%+v after=%+v", before, after)
	}
}

func TestWorkspaceSyncStatusDivergesOnRealContentChange(t *testing.T) {
	hostPath := t.TempDir()
	homeDir := filepath.Join(hostPath, tenant.WorkspaceHomeSubdir)
	if err := extractEmbeddedBaseline(homeDir); err != nil {
		t.Fatalf("extractEmbeddedBaseline: %v", err)
	}
	ws := &store.Workspace{ID: "ws-sync-test", Slug: "sync-test", HostPath: hostPath, Version: 1}

	synced := workspaceSyncStatusForWorkspace(ws, time.Unix(0, 0).UTC())
	if synced.Status != workspaceSyncStatusSynced {
		t.Fatalf("fresh baseline status = %q, want synced", synced.Status)
	}

	agentPath := filepath.Join(homeDir, "workspace", "AGENT.md")
	if err := mkdirAppendFile(agentPath, "\n# local admin edit\n"); err != nil {
		t.Fatalf("append AGENT.md: %v", err)
	}

	diverged := workspaceSyncStatusForWorkspace(ws, time.Unix(0, 0).UTC())
	if diverged.Status != workspaceSyncStatusDiverged {
		t.Fatalf("edited workspace status = %q, want diverged", diverged.Status)
	}
}

func TestWriteWorkspaceFileBumpsVersion(t *testing.T) {
	h := newTestHandlerWithMCPKey(t)
	wsID := seedWorkspace(t, h, "ws-file-version")
	before, err := h.Workspaces.Get(context.Background(), wsID)
	if err != nil {
		t.Fatalf("get before: %v", err)
	}

	body := `{"path":"home/workspace/AGENT.md","content":"# Edited\n"}`
	r := withChiParams(
		httptest.NewRequest(http.MethodPut, "/api/v1/workspaces/"+wsID+"/files", strings.NewReader(body)),
		map[string]string{"id": wsID},
	)
	w := httptest.NewRecorder()
	h.handleWriteWorkspaceFile(w, r)
	if w.Code != http.StatusNoContent {
		t.Fatalf("PUT got %d, body: %s", w.Code, w.Body.String())
	}

	after, err := h.Workspaces.Get(context.Background(), wsID)
	if err != nil {
		t.Fatalf("get after: %v", err)
	}
	if after.Version != before.Version+1 {
		t.Fatalf("version = %d, want %d", after.Version, before.Version+1)
	}
}

func mkdirWriteFile(path, body string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(body), 0o644)
}

func mkdirAppendFile(path, body string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	if _, err := f.WriteString(body); err != nil {
		_ = f.Close()
		return err
	}
	return f.Close()
}
