//go:build whatsapp_native

package whatsapp

import "go.mau.fi/whatsmeow/types"

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

func TestWhatsAppLookupPhone(t *testing.T) {
	tests := []struct {
		name string
		jid  types.JID
		want string
	}{
		{
			name: "default user",
			jid:  types.NewJID("5587988553793", types.DefaultUserServer),
			want: "+5587988553793",
		},
		{
			name: "punctuation",
			jid:  types.NewJID("+55 (87) 98855-3793", types.DefaultUserServer),
			want: "+5587988553793",
		},
		{
			name: "lid ignored",
			jid:  types.NewJID("123456789", types.HiddenUserServer),
			want: "",
		},
		{
			name: "group ignored",
			jid:  types.NewJID("123456789", types.GroupServer),
			want: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := whatsAppLookupPhone(tt.jid); got != tt.want {
				t.Fatalf("whatsAppLookupPhone(%s) = %q, want %q", tt.jid, got, tt.want)
			}
		})
	}
}

func TestCanonicalWhatsAppUserJID(t *testing.T) {
	tests := []struct {
		name string
		jid  types.JID
		want types.JID
	}{
		{
			name: "legacy becomes default",
			jid:  types.NewJID("5587988553793", types.LegacyUserServer),
			want: types.NewJID("5587988553793", types.DefaultUserServer),
		},
		{
			name: "default preserved",
			jid:  types.NewJID("5587988553793", types.DefaultUserServer),
			want: types.NewJID("5587988553793", types.DefaultUserServer),
		},
		{
			name: "lid preserved",
			jid:  types.NewJID("123456789", types.HiddenUserServer),
			want: types.NewJID("123456789", types.HiddenUserServer),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := canonicalWhatsAppUserJID(tt.jid); got != tt.want {
				t.Fatalf("canonicalWhatsAppUserJID(%s) = %s, want %s", tt.jid, got, tt.want)
			}
		})
	}
}
