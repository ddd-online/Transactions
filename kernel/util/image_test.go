package util

import (
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"
)

func TestDecodeBase64Data(t *testing.T) {
	// Valid JPEG data URI
	raw := "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA=="
	mime, data, err := decodeBase64Data(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mime != "image/jpeg" {
		t.Errorf("expected mime 'image/jpeg', got '%s'", mime)
	}
	if len(data) == 0 {
		t.Error("expected non-empty data")
	}

	// No comma separator
	_, _, err = decodeBase64Data("invalid")
	if err == nil {
		t.Error("expected error for invalid data URI")
	}

	// Invalid base64
	_, _, err = decodeBase64Data("data:image/png;base64,!!!not-valid-base64!!!")
	if err == nil {
		t.Error("expected error for invalid base64")
	}

	// PNG data URI
	raw = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+A8AAQEBASFjAWAAAAAASUVORK5CYII="
	mime, data, err = decodeBase64Data(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if mime != "image/png" {
		t.Errorf("expected mime 'image/png', got '%s'", mime)
	}
	if len(data) == 0 {
		t.Error("expected non-empty data")
	}
}

func TestMimeToExt(t *testing.T) {
	tests := []struct {
		mime string
		ext  string
	}{
		{"image/jpeg", ".jpg"},
		{"image/png", ".png"},
		{"image/gif", ".gif"},
		{"image/webp", ".webp"},
		{"image/bmp", ".jpg"},   // default
		{"", ".jpg"},             // default
		{"application/octet-stream", ".jpg"}, // default
	}

	for _, tt := range tests {
		t.Run(tt.mime, func(t *testing.T) {
			got := mimeToExt(tt.mime)
			if got != tt.ext {
				t.Errorf("mimeToExt(%q) = %q, want %q", tt.mime, got, tt.ext)
			}
		})
	}
}

func makeTestPNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 1, 1))
	img.Set(0, 0, color.RGBA{R: 255, G: 0, B: 0, A: 255})
	buf := new(bytesWriter)
	if err := png.Encode(buf, img); err != nil {
		t.Fatalf("failed to encode test PNG: %v", err)
	}
	return buf.data
}

type bytesWriter struct {
	data []byte
}

func (b *bytesWriter) Write(p []byte) (int, error) {
	b.data = append(b.data, p...)
	return len(p), nil
}

func TestGenerateThumbnail(t *testing.T) {
	dir := t.TempDir()

	smallPNG := makeTestPNG(t)

	// Small image (1x1) — should still encode as JPEG
	outPath := filepath.Join(dir, "thumb.jpg")
	if err := generateThumbnail(smallPNG, outPath); err != nil {
		t.Fatalf("generateThumbnail failed: %v", err)
	}
	if _, err := os.Stat(outPath); os.IsNotExist(err) {
		t.Error("thumbnail file not created")
	}

	// Invalid data
	err := generateThumbnail([]byte("not an image"), filepath.Join(dir, "bad.jpg"))
	if err == nil {
		t.Error("expected error for invalid image data")
	}

	// Large image — scale down
	largeImg := image.NewRGBA(image.Rect(0, 0, 600, 400))
	for y := 0; y < 400; y++ {
		for x := 0; x < 600; x++ {
			largeImg.Set(x, y, color.RGBA{R: uint8(x % 256), G: uint8(y % 256), B: 128, A: 255})
		}
	}
	buf := new(bytesWriter)
	if err := png.Encode(buf, largeImg); err != nil {
		t.Fatalf("failed to encode large PNG: %v", err)
	}
	largePath := filepath.Join(dir, "thumb_large.jpg")
	if err := generateThumbnail(buf.data, largePath); err != nil {
		t.Fatalf("generateThumbnail for large image failed: %v", err)
	}
	largeFile, err := os.Open(largePath)
	if err != nil {
		t.Fatalf("cannot open thumbnail: %v", err)
	}
	defer largeFile.Close()
	cfg, _, err := image.DecodeConfig(largeFile)
	if err != nil {
		t.Fatalf("cannot decode thumbnail: %v", err)
	}
	if cfg.Width > thumbMaxWidth {
		t.Errorf("thumbnail width %d exceeds max %d", cfg.Width, thumbMaxWidth)
	}
}

func TestSaveImage(t *testing.T) {
	dir := t.TempDir()

	// Build a valid PNG data URI
	smallPNG := makeTestPNG(t)
	rawBase64 := "data:image/png;base64," + base64.StdEncoding.EncodeToString(smallPNG)

	filePath, thumbPath, err := SaveImage(dir, "2026-07-19", "test-uuid-001", rawBase64)
	if err != nil {
		t.Fatalf("SaveImage failed: %v", err)
	}

	// Check that files exist
	origFull := filepath.Join(dir, "data", "assets", filePath)
	if _, err := os.Stat(origFull); os.IsNotExist(err) {
		t.Errorf("original image not created at %s", origFull)
	}
	thumbFull := filepath.Join(dir, "data", "assets", thumbPath)
	if _, err := os.Stat(thumbFull); os.IsNotExist(err) {
		t.Errorf("thumbnail not created at %s", thumbFull)
	}

	// Check relative paths use forward slashes
	if filepath.IsAbs(filePath) {
		t.Error("filePath should be relative")
	}
	if filepath.IsAbs(thumbPath) {
		t.Error("thumbPath should be relative")
	}

	// Invalid base64
	_, _, err = SaveImage(dir, "2026-07-19", "bad-id", "not-a-data-uri")
	if err == nil {
		t.Error("expected error for invalid data URI")
	}
}
