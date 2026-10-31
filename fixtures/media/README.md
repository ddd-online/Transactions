# 媒体测试夹具（合成，非真实素材）

`live-motion.mp4` 是「实况照片的动态部分」的替身：1.4 秒、320×180、H.264（avc1），
画面是纯色背景上一个移动的方块 + 秒数。

生成方式（本机没有 ffmpeg）：Electron 里用 canvas 的 `captureStream()` 喂给
`MediaRecorder('video/mp4;codecs=avc1')` 录 1.4 秒，把 blob 原样写出。
所以它只有合成像素，不含任何第三方素材。

HEIC 静态图不在这里，见 `../heic/`（同一套「只放合成数据」的纪律）。
