package util

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/gif"
	_ "image/png"
	"os"
	"path/filepath"
	"strings"

	_ "golang.org/x/image/webp"
	"golang.org/x/image/draw"
)

const (
	assetsDir     = "data/assets"
	thumbMaxWidth = 300
	thumbQuality  = 75
)

// SaveImage decodes the given base64 data URI, writes the original image and a
// thumbnail to the workspace assets directory, and returns relative paths.
func SaveImage(workspaceDir, eventDate, imageId, rawBase64 string) (filePath, thumbPath string, err error) {
	mime, bin, err := decodeBase64Data(rawBase64)
	if err != nil {
		return "", "", fmt.Errorf("decode base64: %w", err)
	}

	ext := mimeToExt(mime)
	if ext == "" {
		ext = ".jpg"
	}

	dir := filepath.Join(workspaceDir, assetsDir, "key_events", eventDate)
	if err := os.MkdirAll(dir, 0750); err != nil {
		return "", "", fmt.Errorf("create dir %s: %w", dir, err)
	}

	relBase := filepath.Join("key_events", eventDate)
	origName := imageId + ext
	thumbName := "thumb_" + imageId + ".jpg"

	origPath := filepath.Join(dir, origName)
	if err := os.WriteFile(origPath, bin, 0640); err != nil {
		return "", "", fmt.Errorf("write original: %w", err)
	}

	thumbPathAbs := filepath.Join(dir, thumbName)
	if err := generateThumbnail(bin, thumbPathAbs); err != nil {
		os.Remove(origPath)
		return "", "", fmt.Errorf("generate thumbnail: %w", err)
	}

	return filepath.ToSlash(filepath.Join(relBase, origName)),
		filepath.ToSlash(filepath.Join(relBase, thumbName)), nil
}

func decodeBase64Data(raw string) (mime string, data []byte, err error) {
	idx := strings.Index(raw, ",")
	if idx < 0 {
		return "", nil, fmt.Errorf("invalid data URI: no comma separator")
	}
	header := raw[:idx]
	payload := raw[idx+1:]

	if i := strings.Index(header, ":"); i >= 0 {
		mime = header[i+1:]
	}
	if i := strings.Index(mime, ";"); i >= 0 {
		mime = mime[:i]
	}

	b, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		return "", nil, fmt.Errorf("base64 decode: %w", err)
	}
	return mime, b, nil
}

func mimeToExt(mime string) string {
	switch mime {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	default:
		return ".jpg"
	}
}

func generateThumbnail(data []byte, outPath string) error {
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("decode image: %w", err)
	}

	bounds := src.Bounds()
	w := bounds.Dx()
	h := bounds.Dy()

	newW := w
	newH := h
	if w > thumbMaxWidth {
		newW = thumbMaxWidth
		newH = int(float64(h) * float64(thumbMaxWidth) / float64(w))
		if newH < 1 {
			newH = 1
		}
	}

	dst := image.NewRGBA(image.Rect(0, 0, newW, newH))
	draw.CatmullRom.Scale(dst, dst.Rect, src, bounds, draw.Over, nil)

	f, err := os.Create(outPath)
	if err != nil {
		return fmt.Errorf("create thumbnail file: %w", err)
	}
	defer f.Close()

	if err := jpeg.Encode(f, dst, &jpeg.Options{Quality: thumbQuality}); err != nil {
		return fmt.Errorf("encode thumbnail: %w", err)
	}
	return nil
}
