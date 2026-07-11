import type { KeyEventImage, TransactionRecord } from '@/types/billadm'
import { createImageUrls, revokeImageUrls, type ImageUrls } from '@/backend/imageOptimizer'

/**
 * KeyEventCache — deep module for key-event data caching.
 *
 * Interface (5 methods): { getImages, setImages, getImageUrls, getTransactions, setTransactions, invalidate }
 * Implementation (~80 lines): Map-based caches + blob URL lifecycle management.
 */
export class KeyEventCache {
  // Public for component access (e.g., imageUrlCache as prop, trCache for direct read)
  readonly imageUrlCache = new Map<string, ImageUrls>()
  readonly trCache = new Map<string, TransactionRecord[]>()
  private imageCache = new Map<string, KeyEventImage[]>()

  /** Get cached images for a date. Returns undefined if not cached. */
  getImages(date: string): KeyEventImage[] | undefined {
    return this.imageCache.get(date)
  }

  /** Cache images for a date and start async blob URL generation. */
  setImages(date: string, images: KeyEventImage[]): void {
    this.imageCache.set(date, images)
    // Async blob URL generation — non-blocking
    for (const img of images) {
      if (!this.imageUrlCache.has(img.id)) {
        createImageUrls(img.data)
          .then(urls => this.imageUrlCache.set(img.id, urls))
          .catch(() => { /* ignore */ })
      }
    }
  }

  /** Get cached blob URLs for an image by ID. */
  getImageUrls(imageId: string): ImageUrls | undefined {
    return this.imageUrlCache.get(imageId)
  }

  /** Cache linked transactions for a date. */
  setTransactions(date: string, trs: TransactionRecord[]): void {
    this.trCache.set(date, trs)
  }

  /** Get cached transactions for a date. */
  getTransactions(date: string): TransactionRecord[] | undefined {
    return this.trCache.get(date)
  }

  /** Invalidate all caches for a date (e.g. on event delete). */
  invalidate(date: string): void {
    const imgs = this.imageCache.get(date)
    if (imgs) {
      for (const img of imgs) {
        const urls = this.imageUrlCache.get(img.id)
        if (urls) {
          revokeImageUrls(urls)
          this.imageUrlCache.delete(img.id)
        }
      }
    }
    this.imageCache.delete(date)
    this.trCache.delete(date)
  }

  /** Revoke all blob URLs and clear all caches. */
  destroy(): void {
    for (const urls of this.imageUrlCache.values()) {
      revokeImageUrls(urls)
    }
    this.imageUrlCache.clear()
    this.imageCache.clear()
    this.trCache.clear()
  }
}
