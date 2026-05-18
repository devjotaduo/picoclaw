//go:build whatsapp_native

package whatsapp

import (
	"path/filepath"
	"testing"

	"go.mau.fi/whatsmeow"

	"github.com/sipeed/picoclaw/pkg/bus"
	"github.com/sipeed/picoclaw/pkg/channels"
	"github.com/sipeed/picoclaw/pkg/media"
)

var _ channels.MediaSender = (*WhatsAppNativeChannel)(nil)

func TestWhatsAppNativeMediaHelpersInferImage(t *testing.T) {
	part := bus.MediaPart{Type: "image", Filename: "creative.png", Caption: "caption"}
	meta := media.MediaMeta{ContentType: "image/png"}
	data := []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}

	if got := whatsappMediaFilename(part, meta, "/tmp/creative.png"); got != "creative.png" {
		t.Fatalf("filename = %q", got)
	}
	if got := whatsappMediaContentType(part, meta, "/tmp/creative.png", data); got != "image/png" {
		t.Fatalf("content type = %q", got)
	}
	if got := whatsappMediaType(part, "image/png"); got != whatsmeow.MediaImage {
		t.Fatalf("media type = %q, want image", got)
	}
	if got := whatsappMediaObserverContent(part, "creative.png", whatsmeow.MediaImage); got != "caption" {
		t.Fatalf("observer content = %q", got)
	}
}

func TestBuildWhatsAppMediaMessage_Image(t *testing.T) {
	resp := whatsmeow.UploadResponse{
		URL:           "https://example.test/media",
		DirectPath:    "/v/t62/test",
		MediaKey:      []byte("media-key"),
		FileEncSHA256: []byte("enc-sha"),
		FileSHA256:    []byte("sha"),
		FileLength:    123,
	}

	msg := buildWhatsAppMediaMessage(
		bus.MediaPart{Caption: "created"},
		"creative.png",
		"image/png",
		whatsmeow.MediaImage,
		resp,
	)

	if msg.GetImageMessage() == nil {
		t.Fatal("expected image message")
	}
	image := msg.GetImageMessage()
	if image.GetCaption() != "created" || image.GetMimetype() != "image/png" {
		t.Fatalf("unexpected image fields: caption=%q mimetype=%q", image.GetCaption(), image.GetMimetype())
	}
	if image.GetURL() != resp.URL || image.GetDirectPath() != resp.DirectPath || image.GetFileLength() != resp.FileLength {
		t.Fatalf("unexpected upload fields on image message")
	}
}

func TestBuildWhatsAppMediaMessage_Document(t *testing.T) {
	resp := whatsmeow.UploadResponse{
		URL:           "https://example.test/doc",
		DirectPath:    "/v/t62/doc",
		MediaKey:      []byte("media-key"),
		FileEncSHA256: []byte("enc-sha"),
		FileSHA256:    []byte("sha"),
		FileLength:    456,
	}

	localPath := filepath.Join(t.TempDir(), "brief.pdf")
	part := bus.MediaPart{Caption: "brief"}
	msg := buildWhatsAppMediaMessage(
		part,
		whatsappMediaFilename(part, media.MediaMeta{}, localPath),
		"application/pdf",
		whatsmeow.MediaDocument,
		resp,
	)

	if msg.GetDocumentMessage() == nil {
		t.Fatal("expected document message")
	}
	doc := msg.GetDocumentMessage()
	if doc.GetFileName() != "brief.pdf" || doc.GetTitle() != "brief.pdf" {
		t.Fatalf("unexpected document filename/title: %q/%q", doc.GetFileName(), doc.GetTitle())
	}
	if doc.GetCaption() != "brief" || doc.GetMimetype() != "application/pdf" {
		t.Fatalf("unexpected document caption/mimetype: %q/%q", doc.GetCaption(), doc.GetMimetype())
	}
}
