import base from './playwright.config'

/**
 * 打包产物冒烟专用配置：只跑 packaged.spec.ts，固定单 worker。
 *
 * 它要和开发构建的实例彻底分开 —— 一个是 output/win-unpacked 里的真产物，一个是 output/out
 * 里的构建目录，混在一起跑既会抢安装目录，也让「打包本身坏了」和「页面逻辑坏了」分不开。
 * timeout / expect / reporter / outputDir 全部沿用 base，只有收集范围与并发数不同。
 */
export default {
  ...base,
  testIgnore: [],
  testMatch: ['**/packaged.spec.ts'],
  workers: 1,
}
