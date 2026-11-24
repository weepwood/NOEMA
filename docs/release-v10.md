# V10 发布候选验收

## 已验证基线 3f5e4d6
- 静态 60/60；Chromium、Firefox、WebKit 全通过。
- 20,000 个文件目录项、1,800 帧、16 个重复编码源：P95 25 ms；22 帧 >33.4 ms；峰值 34 个挂载磁贴，页面异常 0。
- 最新桌面及聚焦截图确认首屏图片就绪、精确聚焦稳定。
- Firefox P95 41 ms；WebKit P95 80 ms、311/640 慢帧。Linux Playwright WebKit 不是 macOS Safari 实机性能。
- 产物见 https://github.com/weepwood/NOEMA/actions/runs/45414935524 。

## 发布门禁（最新提交，未完成）
- 最新静态测试、三浏览器检查和 30 分钟实际时间耐久 job 成功；审查截图、JSON、CDP 堆/DOM采样和资源归零。
- PR #11 审查通过后合并；验证 main CI、Pages 部署 SHA 与生产 URL。
- Tag v10.0.0 和 Release 指向经验证的 main SHA；发布静态文件压缩包和 SHA256。尚未创建标签或发布。
- 继续保留零构建、file:// 降级与本地图片隐私边界。实际 GPU 内存和真机性能不作为已测结论。

## 本版本变更
- 修复原图查看器重复选择、多指衔接、异步任务竞态。
- 分级缩略图及降档、缓存和离屏任务治理。
- 独立 Inspector、手势和图片管线模块。
- 实际时间弹簧与惯性；保持 PosterWall 12×8 几何和 6×6 聚焦。
- 跨浏览器截图、资源诊断、耐久测试、部署门禁。
