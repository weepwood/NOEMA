# V10 发布候选验收

## 已验证基线 3f5e4d6
- 静态 60/60；Chromium、Firefox、WebKit 全通过。
- 20,000 个文件目录项、1,800 帧、16 个重复编码源：P95 25 ms；22 帧 >33.4 ms；峰值 34 个挂载磁贴，页面异常 0。
- 最新桌面及聚焦截图确认首屏图片就绪、精确聚焦稳定。
- Firefox P95 41 ms；WebKit P95 80 ms、311/640 慢帧。Linux Playwright WebKit 不是 macOS Safari 实机性能。
- 产物见 https://github.com/weepwood/NOEMA/actions/runs/45414935524 。

## 发布门禁
- 最新静态测试、三浏览器检查和 30 分钟实际时间耐久 job 成功；审查截图、JSON、CDP 堆/DOM采样和资源归零。
- PR #11 已审查合并；待当前 main CI、Pages 部署 SHA 与生产 URL 验证。
- Tag v10.0.0 和 Release 指向经验证的 main SHA；发布静态文件压缩包和 SHA256。尚未创建标签或发布。
- 继续保留零构建、file:// 降级与本地图片隐私边界。实际 GPU 内存和真机性能不作为已测结论。

## 本版本变更
- 修复原图查看器重复选择、多指衔接、异步任务竞态。
- 分级缩略图及降档、缓存和离屏任务治理。
- 独立 Inspector、手势和图片管线模块。
- 实际时间弹簧与惯性；保持 PosterWall 12×8 几何和 6×6 聚焦。
- 跨浏览器截图、资源诊断、耐久测试、部署门禁。

## V10 正式合并验收（2026-11-24）
PR #11 eff7989 五项 CI 全通过：https://github.com/weepwood/NOEMA/actions/runs/45416070156 。合并 SHA d82e3e5ab75f3e5c5d1af4df26fe12f431876fa8。静态61/61，Chromium 20000文件/1800帧 P95 25.3ms、15慢帧；Firefox 31ms、19/640慢帧；WebKit 79ms、307/640慢帧。三引擎真实截图已复审。耐久产物14933834465：1801.710秒、923交互、95采样，页面异常0，峰值227缓存、127.69MiB保守像素估算，重置后缓存/队列归零。
独立诊断 https://github.com/weepwood/NOEMA/actions/runs/45423500484 （产物14934768031）：生产文件与 eff7989 一致；12固定目标，24轮预热+96轮测量，额外12轮重导入，耗时296795ms。预热后JS堆7.84→6.86MiB；固定集实际元素949、磁贴36、Detached DOM树0；重置1/2后JS堆2.96/3.01MiB，Embedder 7.14/8.00MiB，Detached BUTTON树1/2（保留节点ID2/4），缓存与任务归零。固定集后段JS堆与Embedder及CDP节点仍略增，不认定零泄漏；未发现当前发布阻塞级泄漏证据，少量残留列入后续维护观察。20k为16编码源重复文件目录项；Linux无头WebKit非Safari真机，不宣称GPU内存已测或60fps达标。
功能冻结。正式发布需当前main的Verify与Pages成功、线上文件校验，再创建v10.0.0与静态ZIP/SHA256。不得把旧工作流或Tag当作当前部署证明。
