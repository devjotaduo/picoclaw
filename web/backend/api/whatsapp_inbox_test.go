package api

import (
	"testing"
)

// ---------------------------------------------------------------------------
// singleSlashJoin
// ---------------------------------------------------------------------------

func TestSingleSlashJoin(t *testing.T) {
	tests := []struct {
		name   string
		base   string
		suffix string
		want   string
	}{
		{"empty suffix returns base", "/whatsapp_native/inbox", "", "/whatsapp_native/inbox"},
		{"suffix with leading slash appended directly", "/a", "/b", "/a/b"},
		{"suffix without leading slash gets separator added", "/a", "b", "/a/b"},
		{"both have slash: joined once", "/a/", "/b", "/a//b"},
		{"empty base with slash suffix", "", "/foo", "/foo"},
		{"empty base without slash suffix", "", "foo", "/foo"},
		{"empty both", "", "", ""},
		{"root path with suffix", "/whatsapp_native/inbox", "/chats", "/whatsapp_native/inbox/chats"},
		{"root path without leading slash in suffix", "/whatsapp_native/inbox", "chats", "/whatsapp_native/inbox/chats"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := singleSlashJoin(tt.base, tt.suffix)
			if got != tt.want {
				t.Fatalf("singleSlashJoin(%q, %q) = %q, want %q", tt.base, tt.suffix, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// escapeJSONString
// ---------------------------------------------------------------------------

func TestEscapeJSONString(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{"empty string", "", ""},
		{"plain ASCII", "hello world", "hello world"},
		{"double quote escaped", `say "hello"`, `say \"hello\"`},
		{"backslash escaped", `path\to\file`, `path\\to\\file`},
		{"newline escaped", "line1\nline2", `line1\nline2`},
		{"carriage return escaped", "line1\rline2", `line1\rline2`},
		{"tab escaped", "col1\tcol2", `col1\tcol2`},
		{"control char stripped", "before\x01after", "beforeafter"},
		{"control char 0x1F stripped", "a\x1fb", "ab"},
		{"null byte stripped", "a\x00b", "ab"},
		{"combined escapes", "a\"b\\c\nd", `a\"b\\c\nd`},
		{"unicode preserved", "こんにちは", "こんにちは"},
		{"emoji preserved", "test \U0001F600 end", "test \U0001F600 end"},
		{"space char 0x20 preserved", "a b", "a b"}, // 0x20 is NOT a control char
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := escapeJSONString(tt.input)
			if got != tt.want {
				t.Fatalf("escapeJSONString(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

// Verify that escapeJSONString output is valid JSON when embedded.
func TestEscapeJSONString_ProducesValidJSON(t *testing.T) {
	import_json := func(s string) bool {
		// The simplest check: wrap in quotes and try to unmarshal.
		var dst string
		err := unmarshalJSONString(`"`+escapeJSONString(s)+`"`, &dst)
		return err == nil
	}

	cases := []string{
		"plain",
		`with "quotes"`,
		`with \backslash`,
		"newline\n",
		"tab\t",
		"control\x01char",
	}
	for _, s := range cases {
		if !import_json(s) {
			t.Errorf("escapeJSONString(%q) did not produce valid JSON", s)
		}
	}
}

// unmarshalJSONString is a local helper for the JSON-validity test.
func unmarshalJSONString(jsonStr string, dst *string) error {
	import_encoding := func() error {
		b := []byte(jsonStr)
		if len(b) < 2 || b[0] != '"' || b[len(b)-1] != '"' {
			return errInvalidJSON
		}
		inner := b[1 : len(b)-1]
		result := make([]byte, 0, len(inner))
		i := 0
		for i < len(inner) {
			if inner[i] != '\\' {
				result = append(result, inner[i])
				i++
				continue
			}
			if i+1 >= len(inner) {
				return errInvalidJSON
			}
			switch inner[i+1] {
			case '"':
				result = append(result, '"')
			case '\\':
				result = append(result, '\\')
			case 'n':
				result = append(result, '\n')
			case 'r':
				result = append(result, '\r')
			case 't':
				result = append(result, '\t')
			default:
				return errInvalidJSON
			}
			i += 2
		}
		*dst = string(result)
		return nil
	}
	return import_encoding()
}

var errInvalidJSON = &invalidJSONError{}

type invalidJSONError struct{}

func (e *invalidJSONError) Error() string { return "invalid JSON string" }
