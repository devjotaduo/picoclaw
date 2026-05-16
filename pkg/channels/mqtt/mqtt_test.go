package mqtt

import (
	"testing"

	"github.com/sipeed/picoclaw/pkg/config"
)

// newTestChannel builds a minimal MQTTChannel for unit-testing pure helper methods.
// Only cfg is needed; topicPrefix and clientIDFromTopic do not touch BaseChannel or client.
func newTestChannel(agentID, prefix string) *MQTTChannel {
	return &MQTTChannel{
		cfg: &config.MQTTSettings{
			Broker:      "tcp://test:1883",
			AgentID:     agentID,
			TopicPrefix: prefix,
		},
	}
}

func TestTopicPrefix(t *testing.T) {
	cases := []struct {
		raw  string
		want string
	}{
		{"", "/picoclaw"},            // empty → default
		{"/myapp", "/myapp"},         // explicit prefix preserved
		{"/myapp/", "/myapp"},        // trailing slash stripped
		{"myapp", "myapp"},           // no leading slash kept as-is
		{"a/b/c/", "a/b/c"},         // multi-segment, trailing slash stripped
	}
	for _, tc := range cases {
		ch := newTestChannel("agent1", tc.raw)
		if got := ch.topicPrefix(); got != tc.want {
			t.Errorf("topicPrefix(raw=%q) = %q, want %q", tc.raw, got, tc.want)
		}
	}
}

func TestClientIDFromTopic(t *testing.T) {
	ch := newTestChannel("myagent", "/picoclaw")

	cases := []struct {
		topic   string
		wantID  string
		wantOK  bool
	}{
		{"/picoclaw/myagent/client123/request", "client123", true},
		{"/picoclaw/myagent/abc/request", "abc", true},
		{"/picoclaw/myagent/long-client-id/request", "long-client-id", true},
		// Wrong prefix
		{"/other/myagent/client123/request", "", false},
		// Wrong agent ID
		{"/picoclaw/otheragent/client123/request", "", false},
		// No slash after client ID segment
		{"/picoclaw/myagent/noslash", "", false},
		// Empty topic
		{"", "", false},
	}
	for _, tc := range cases {
		id, ok := ch.clientIDFromTopic(tc.topic)
		if ok != tc.wantOK || id != tc.wantID {
			t.Errorf("clientIDFromTopic(%q) = %q,%v; want %q,%v",
				tc.topic, id, ok, tc.wantID, tc.wantOK)
		}
	}
}

func TestClientIDFromTopicCustomPrefix(t *testing.T) {
	ch := newTestChannel("bot42", "myns/production")

	valid := "myns/production/bot42/device-xyz/request"
	id, ok := ch.clientIDFromTopic(valid)
	if !ok || id != "device-xyz" {
		t.Errorf("clientIDFromTopic(%q) = %q,%v; want device-xyz,true", valid, id, ok)
	}

	invalid := "/picoclaw/bot42/device-xyz/request"
	if _, ok := ch.clientIDFromTopic(invalid); ok {
		t.Errorf("clientIDFromTopic with wrong prefix should return false")
	}
}
