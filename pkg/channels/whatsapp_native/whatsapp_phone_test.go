//go:build whatsapp_native

package whatsapp

import "testing"

func TestSameWhatsAppPhoneUser(t *testing.T) {
	tests := []struct {
		name string
		a    string
		b    string
		want bool
	}{
		{
			name: "exact",
			a:    "558788260369",
			b:    "558788260369",
			want: true,
		},
		{
			name: "same brazilian mobile with ninth digit",
			a:    "558788260369",
			b:    "5587988260369",
			want: true,
		},
		{
			name: "same brazilian mobile with punctuation",
			a:    "+55 (87) 8826-0369",
			b:    "+55 (87) 9 8826-0369",
			want: true,
		},
		{
			name: "different brazilian number",
			a:    "558788260369",
			b:    "5587988260370",
			want: false,
		},
		{
			name: "different country does not apply ninth digit",
			a:    "15551234567",
			b:    "155591234567",
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := sameWhatsAppPhoneUser(tt.a, tt.b); got != tt.want {
				t.Fatalf("sameWhatsAppPhoneUser(%q, %q) = %v, want %v", tt.a, tt.b, got, tt.want)
			}
		})
	}
}
