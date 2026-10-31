/**
 * `libheif-js` 的 wasm 版本把 libheif 编成单个 JS（wasm 以 base64 内嵌），
 * 只导出 JS 包装层的 `HeifDecoder` / `HeifImage`，没有随包的 .d.ts 覆盖这层。
 */
declare module 'libheif-js/wasm-bundle' {
  export interface HeifImage {
    get_width(): number
    get_height(): number
    has_alpha_channel(): boolean
    display(
      options: { data: Uint8ClampedArray; width: number; height: number },
      callback: (result: { data: Uint8ClampedArray } | null) => void,
    ): void
    free(): void
  }

  export class HeifDecoder {
    decode(data: Uint8Array | Buffer): HeifImage[]
  }

  const libheif: { HeifDecoder: typeof HeifDecoder }
  export default libheif
}
