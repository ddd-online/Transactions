import type { KeyEventImage, TransactionRecord } from '@/types/billadm'

export class KeyEventCache {
  readonly trCache = new Map<string, TransactionRecord[]>()
  private imageCache = new Map<string, KeyEventImage[]>()

  getImages(date: string): KeyEventImage[] | undefined {
    return this.imageCache.get(date)
  }

  setImages(date: string, images: KeyEventImage[]): void {
    this.imageCache.set(date, images)
  }

  setTransactions(date: string, trs: TransactionRecord[]): void {
    this.trCache.set(date, trs)
  }

  getTransactions(date: string): TransactionRecord[] | undefined {
    return this.trCache.get(date)
  }

  invalidate(date: string): void {
    this.imageCache.delete(date)
    this.trCache.delete(date)
  }

  destroy(): void {
    this.imageCache.clear()
    this.trCache.clear()
  }
}
