package api

import (
	"errors"
	"testing"
)

func TestResolvePythonExecutablePrefersPython3(t *testing.T) {
	got := resolvePythonExecutable(func(name string) (string, error) {
		switch name {
		case "python3":
			return "/usr/bin/python3", nil
		case "python":
			return "/usr/bin/python", nil
		default:
			return "", errors.New("not found")
		}
	})
	if got != "/usr/bin/python3" {
		t.Fatalf("resolvePythonExecutable() = %q, want python3 path", got)
	}
}

func TestResolvePythonExecutableFallsBackToPython(t *testing.T) {
	got := resolvePythonExecutable(func(name string) (string, error) {
		if name == "python" {
			return "/usr/bin/python", nil
		}
		return "", errors.New("not found")
	})
	if got != "/usr/bin/python" {
		t.Fatalf("resolvePythonExecutable() = %q, want python fallback", got)
	}
}
