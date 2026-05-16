package channels

import (
	"testing"

	"github.com/sipeed/picoclaw/pkg/bus"
)

func newAllPassBehavior() *ChannelBehavior {
	return &ChannelBehavior{
		MasterEnabled:    true,
		RespondInDM:      true,
		RespondInGroups:  true,
		ProcessImages:    true,
		ProcessDocuments: true,
		ProcessAudio:     true,
		ProcessVideo:     true,
		ProcessStickers:  true,
		ProcessLocation:  true,
	}
}

type staticProvider struct {
	beh *ChannelBehavior
}

func (s *staticProvider) ChannelBehavior(_ string, _ string) *ChannelBehavior {
	return s.beh
}

type contextProvider struct {
	beh *ChannelBehavior
	got bus.InboundContext
}

func (s *contextProvider) ChannelBehavior(_ string, _ string) *ChannelBehavior {
	return s.beh
}

func (s *contextProvider) ChannelBehaviorForContext(ctx bus.InboundContext) *ChannelBehavior {
	s.got = ctx
	return s.beh
}

func newBaseChannelWith(beh *ChannelBehavior) *BaseChannel {
	bc := &BaseChannel{name: "test", behaviorProvider: &staticProvider{beh: beh}}
	return bc
}

func TestApplyBehaviorFilter_NoProvider_Passes(t *testing.T) {
	bc := &BaseChannel{name: "test"}
	content, media, allow := bc.applyBehaviorFilter("hi", []string{"media://x"}, bus.InboundContext{ChatType: "direct"}, bus.SenderInfo{})
	if !allow {
		t.Fatal("no provider should allow message")
	}
	if content != "hi" || len(media) != 1 {
		t.Errorf("content/media should be unchanged, got %q %v", content, media)
	}
}

func TestApplyBehaviorFilter_ContextProviderGetsInboundContext(t *testing.T) {
	provider := &contextProvider{beh: newAllPassBehavior()}
	bc := &BaseChannel{name: "whatsapp", behaviorProvider: provider}
	_, _, allow := bc.applyBehaviorFilter("hi", nil, bus.InboundContext{ChatType: "direct", ChatID: "123"}, bus.SenderInfo{})
	if !allow {
		t.Fatal("all-pass behavior should allow message")
	}
	if provider.got.Channel != "whatsapp" || provider.got.ChatID != "123" {
		t.Fatalf("context provider got %+v, want channel whatsapp chat 123", provider.got)
	}
}

func TestApplyBehaviorFilter_MasterOff_Drops(t *testing.T) {
	bc := newBaseChannelWith(&ChannelBehavior{MasterEnabled: false})
	_, _, allow := bc.applyBehaviorFilter("hi", nil, bus.InboundContext{ChatType: "direct"}, bus.SenderInfo{})
	if allow {
		t.Fatal("master_enabled=false should drop")
	}
}

func TestApplyBehaviorFilter_DM_RespectsToggle(t *testing.T) {
	beh := newAllPassBehavior()
	beh.RespondInDM = false
	bc := newBaseChannelWith(beh)
	_, _, allow := bc.applyBehaviorFilter("hi", nil, bus.InboundContext{ChatType: "direct"}, bus.SenderInfo{})
	if allow {
		t.Fatal("RespondInDM=false should drop direct messages")
	}
}

func TestApplyBehaviorFilter_Group_RespectsToggle(t *testing.T) {
	beh := newAllPassBehavior()
	beh.RespondInGroups = false
	bc := newBaseChannelWith(beh)
	_, _, allow := bc.applyBehaviorFilter("hi", nil, bus.InboundContext{ChatType: "group"}, bus.SenderInfo{})
	if allow {
		t.Fatal("RespondInGroups=false should drop group messages")
	}
}

func TestApplyBehaviorFilter_GroupMentionOnly(t *testing.T) {
	beh := newAllPassBehavior()
	beh.GroupMentionOnly = true
	bc := newBaseChannelWith(beh)

	_, _, allow := bc.applyBehaviorFilter("hi", nil, bus.InboundContext{ChatType: "group", Mentioned: false}, bus.SenderInfo{})
	if allow {
		t.Error("GroupMentionOnly should drop unmentioned group messages")
	}

	_, _, allow = bc.applyBehaviorFilter("hi @bot", nil, bus.InboundContext{ChatType: "group", Mentioned: true}, bus.SenderInfo{})
	if !allow {
		t.Error("GroupMentionOnly should pass when mentioned")
	}
}

func TestApplyBehaviorFilter_KeywordTrigger(t *testing.T) {
	beh := newAllPassBehavior()
	beh.KeywordTrigger = "/atendimento"
	bc := newBaseChannelWith(beh)

	_, _, allow := bc.applyBehaviorFilter("oi", nil, bus.InboundContext{ChatType: "direct"}, bus.SenderInfo{})
	if allow {
		t.Error("keyword trigger absent should drop")
	}

	_, _, allow = bc.applyBehaviorFilter("preciso de /atendimento agora", nil, bus.InboundContext{ChatType: "direct"}, bus.SenderInfo{})
	if !allow {
		t.Error("keyword trigger present should pass")
	}
}

func TestApplyBehaviorFilter_IgnoreSelf(t *testing.T) {
	beh := newAllPassBehavior()
	beh.IgnoreSelfMessages = true
	bc := newBaseChannelWith(beh)
	_, _, allow := bc.applyBehaviorFilter("hi", nil, bus.InboundContext{ChatType: "direct"}, bus.SenderInfo{IsSelf: true})
	if allow {
		t.Fatal("IgnoreSelfMessages should drop self messages")
	}
}

func TestApplyBehaviorFilter_IgnoreOtherBots(t *testing.T) {
	beh := newAllPassBehavior()
	beh.IgnoreOtherBots = true
	bc := newBaseChannelWith(beh)

	_, _, allow := bc.applyBehaviorFilter("hi", nil, bus.InboundContext{ChatType: "direct"}, bus.SenderInfo{IsBot: true})
	if allow {
		t.Error("IgnoreOtherBots should drop bot messages")
	}

	// self+bot still drops only via IgnoreSelf; IgnoreOtherBots specifically excludes self
	_, _, allow = bc.applyBehaviorFilter("hi", nil, bus.InboundContext{ChatType: "direct"}, bus.SenderInfo{IsBot: true, IsSelf: true})
	if !allow {
		t.Error("IgnoreOtherBots must not drop the bot's own messages (use IgnoreSelfMessages for that)")
	}
}

func TestApplyBehaviorFilter_Forwarded(t *testing.T) {
	beh := newAllPassBehavior()
	beh.IgnoreForwardedMessages = true
	bc := newBaseChannelWith(beh)
	_, _, allow := bc.applyBehaviorFilter("hi", nil, bus.InboundContext{ChatType: "direct", Forwarded: true}, bus.SenderInfo{})
	if allow {
		t.Fatal("IgnoreForwardedMessages should drop forwarded messages")
	}
}

func TestFilterMediaByBehavior_DropsByExtension(t *testing.T) {
	beh := newAllPassBehavior()
	beh.ProcessImages = false

	_, kept := filterMediaByBehavior("hi", []string{"media://a.jpg", "media://b.pdf"}, beh, nil)
	if len(kept) != 1 || kept[0] != "media://b.pdf" {
		t.Errorf("expected only PDF kept, got %v", kept)
	}
}

func TestFilterMediaByBehavior_AudioStripsAnnotation(t *testing.T) {
	beh := newAllPassBehavior()
	beh.ProcessAudio = false

	content, kept := filterMediaByBehavior("Texto antes [voice] texto depois", []string{"media://x.ogg"}, beh, nil)
	if len(kept) != 0 {
		t.Errorf("audio media should be dropped, got %v", kept)
	}
	if content == "Texto antes [voice] texto depois" {
		t.Errorf("audio annotation should be stripped, got %q", content)
	}
}

func TestFilterMediaByBehavior_AllDroppedReturnsEmpty(t *testing.T) {
	beh := newAllPassBehavior()
	beh.ProcessImages = false
	bc := newBaseChannelWith(beh)
	_, _, allow := bc.applyBehaviorFilter("", []string{"media://only.png"}, bus.InboundContext{ChatType: "direct"}, bus.SenderInfo{})
	if allow {
		t.Fatal("message with no content and all-dropped media should not allow")
	}
}

func TestClassifyByMIMEAndExt(t *testing.T) {
	cases := []struct {
		ref, ct string
		want    string
	}{
		{"media://x.jpg", "", "image"},
		{"media://x.PDF", "", "document"},
		{"media://x", "image/png", "image"},
		{"media://x", "audio/ogg", "audio"},
		{"media://x", "video/mp4", "video"},
		{"media://x", "image/webp", "image"},
		{"media://sticker/x", "image/webp", "sticker"},
		{"media://x", "image/gif", "sticker"},
		{"media://x", "application/pdf", "document"},
		{"media://x", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "document"},
		{"media://location/123", "", "location"},
		{"media://unknown.xyz", "", "other"},
	}
	for _, tc := range cases {
		got := classifyByMIMEAndExt(tc.ref, tc.ct)
		if got != tc.want {
			t.Errorf("classify(%q, %q) = %q, want %q", tc.ref, tc.ct, got, tc.want)
		}
	}
}
