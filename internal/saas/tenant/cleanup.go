package tenant

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

// ArchiveAndRemoveVolume tars+gzips volumeDir into <backupDir>/<tenantID>-<ts>.tar.gz
// and then removes the volume. Idempotent: if volumeDir doesn't exist, returns
// nil. The tarball is timestamped so re-runs don't clobber.
func ArchiveAndRemoveVolume(ctx context.Context, tenantID, volumeDir, backupDir string) error {
	if _, err := os.Stat(volumeDir); os.IsNotExist(err) {
		return nil
	} else if err != nil {
		return fmt.Errorf("stat volume: %w", err)
	}

	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		return fmt.Errorf("mkdir backup: %w", err)
	}

	ts := time.Now().UTC().Format("20060102T150405Z")
	tarPath := filepath.Join(backupDir, tenantID+"-"+ts+".tar.gz")

	if err := archiveDir(ctx, volumeDir, tarPath); err != nil {
		return fmt.Errorf("archive: %w", err)
	}
	if err := os.RemoveAll(volumeDir); err != nil {
		return fmt.Errorf("remove volume: %w", err)
	}
	return nil
}

func archiveDir(ctx context.Context, src, dst string) error {
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	gz := gzip.NewWriter(out)
	defer gz.Close()

	tw := tar.NewWriter(gz)
	defer tw.Close()

	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
		var link string
		if info.Mode()&os.ModeSymlink != 0 {
			if link, err = os.Readlink(path); err != nil {
				return err
			}
		}
		hdr, err := tar.FileInfoHeader(info, link)
		if err != nil {
			return err
		}
		// Use forward slashes inside the tarball for portability.
		hdr.Name = filepath.ToSlash(rel)
		if err := tw.WriteHeader(hdr); err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()
		if _, err := io.Copy(tw, f); err != nil {
			return err
		}
		return nil
	})
}
