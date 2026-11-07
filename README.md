# NOEMA · Infinite Canvas Mosaic

独立开发的沉浸式海报墙静态演示，参考 [Folia Major 的 PosterWall](https://github.com/chthollyphile/folia-major/blob/main/src/components/app/lattice/PosterWall.tsx) 的视觉方向，而非复制其源代码。

## 运行

本仓库版本可直接在现代浏览器打开 `index.html` 或通过 GitHub Pages 访问，无需构建或后端。为适配 GitHub 代码仓库的文本写入接口，在线版本的示例图片来自 `picsum.photos` 响应式地址（需要联网）。如需离线使用、保留原始 32 张本地 WebP 演示图片，请使用原始的完整项目 ZIP，并将 `photo()` 还原为本地路径。

## 功能

- 12 × 8 固定几何模板平铺，并在二维方向无限重复；约 6 世界像素的直角缝隙。
- 原生 Pointer Events：鼠标拖动、触摸拖动、双指捏合、滚轮绕指针锚点缩放；支持放大、缩小、重置快捷按钮。
- 视口裁剪与超扫：只创建视口附近磁贴，最多 220 个实例；`IntersectionObserver` 延迟发起缩略图资源请求。
- 缩略图与原图分离：未展开时请求 `thumb-NN.webp`，展开时才请求 `poster-NN.webp`，新资源解码完成后渐显，避免全黑闪屏。
- 原位扩展与阻尼弹簧：邻近磁贴根据选中作品的目标包围盒计算位移，图像矩形与镜头的状态可随时打断并重定向。
- 背景磁贴暗化、固定悬浮圆形控件、无圆角无粗边框、中文辅助说明和响应式控制布局。
- 键盘：`Tab` 遍历可见磁贴，`Enter`/`Space` 展开，`Esc` 收起，方向键平移，`+`/`-` 缩放，`0` 重置，`?` 操作说明。
- 支持 `prefers-reduced-motion`，在减少动态效果偏好下直接切换到目标状态。

## 项目结构

```text
index.html            # 完整原生 HTML / CSS / JS，零依赖
README.md             # 设计与使用说明
.github/workflows/pages.yml # 静态页面部署
```

## 替换图片

修改 `index.html` 里的 `artworks` 列表和 `photo(id, width)` 函数。正式项目可将缩略图替换为 CDN 自动生成的 WebP/AVIF 小图，将原图映射为独立原始尺寸 URL；推荐响应式 `srcset`、合理 HTTP `Cache-Control` 和单独的图片缓存策略。

本仓库通过 Picsum Photos 提供在线演示图片，非 Folia Major 的媒体资产；原始下载包包含单独生成的本地示例图片。

## 关于参考项目的许可证

Folia Major 仓库声明使用 **AGPL-3.0**。这里采用了原创的代码、结构与示例素材，没有移植 Folia 的 TSX、hooks 或布局算法。如果未来复制或修改其 AGPL 代码再提供网络服务或重新发布，需按相应许可证检查源代码提供、版权声明及其他义务；仅借鉴抽象设计理念与自行实现不同。

## 当前范围

这是没有服务端的 UI 演示，不包含图片管理、搜索、账户或持久化自定义收藏。在线图片需要网络，图片加载使用浏览器原生缓存，不包含 Service Worker 离线缓存。扩展重排是针对视觉效果的局部推挤，并不是约束求解器级别的全局零重叠排布。