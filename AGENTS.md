# NOEMA 工程协作规范

- 保持本地隐私、PosterWall 12×8 精确覆盖、6×6 聚焦、直角、6 世界像素间距，示例可重复，本地图唯一。
- 原生静态 HTML/CSS/JS，支持 file:// 降级；不引入生产构建。仅开发期浏览器测试依赖。
- Folia Major 为视觉参考，不复制 AGPL 源码；优先评估成熟组件的许可证、体积、维护和交互兼容性。
- 图片不上传；目录授权由用户触发；缓存可清理；压缩 Blob 不等于解码内存。
- 中文 Git commit；独立 PR；日常 Node 检查，高风险画布/缓存/交互需浏览器专项，正式发布需三浏览器与长时压力验证。失败不合并。
- 交接见 [docs/handoff.md](docs/handoff.md)。

- 浏览器证据必须检查实际截图和 JSON；CI 使用固定 Ubuntu 24.04 与 Chromium/Firefox/WebKit。手动 endurance 专项用于 20000 个真实编码文件目录项/1800 帧，明确重复素材限制。部署只发布通过检查的最新 main SHA，避免旧工作流覆盖。
