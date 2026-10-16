# PWA、图标与缓存

> v3.2 历史基线。当前首页已迁到学习界面，播放器位于 report.html；缓存策略与注册方式已更新，见[学习首页实现与验收](05-learning-home.md)。

适用版本：v3.2 / 缓存 v5。更新日期：2026-10-17。[返回文档索引](README.md)

## 主屏幕入口与图标

[manifest.json](../manifest.json) 使用相对路径 `start_url: ./index.html` 和 `scope: ./`，适配 GitHub Pages 的 `/pwatest/` 子目录。`display: standalone` 提供独立窗口体验，`orientation: any` 不限制横竖屏。

[index.html](../index.html) 声明 Apple 主屏幕名称、图标和相关 meta。用户可以在 iPad Safari 打开网站，通过分享菜单选择“添加到主屏幕”；页面本身不自动替用户安装。

各入口统一使用用户提供的 `blibli.webp` 图案，项目已生成以下 PNG 资源：

| 文件 | 尺寸 | 入口 |
| --- | --- | --- |
| [favicon.png](../favicon.png) | 32 × 32 | 浏览器标签图标 |
| [apple-touch-icon.png](../apple-touch-icon.png) | 180 × 180 | Apple 主屏幕图标 |
| [icon-192.png](../icon-192.png) | 192 × 192 | Manifest 图标和页面品牌图标 |
| [icon-512.png](../icon-512.png) | 512 × 512 | Manifest 大图标 |

## 两处缓存完善

### 1. 根页面与启动页面的离线一致性

用户从 `/pwatest/` 打开网页，而 Manifest 从 `/pwatest/index.html` 启动，两者都要能够离线使用。

[sw.js](../sw.js) 将 `./` 和 `./index.html` 一并预缓存。任一入口联网取得成功响应后，同时刷新这两个缓存项，避免一个入口更新、另一个仍显示旧页面。

### 2. 新版本更新与旧缓存清理

- 缓存名称为 `pwatest-${self.registration.scope}-v5`，部署路径参与命名，避免清理同域其他应用的缓存。
- 安装时用 `Request(..., { cache: 'reload' })` 加载静态资源，完成后调用 `skipWaiting()`。
- 激活时只删除相同前缀下的旧版本缓存，随后 `clients.claim()`。
- 页面注册使用 `updateViaCache: 'none'`，减少 Service Worker 脚本更新受 HTTP 缓存影响。
- 页面资源请求采用网络优先，并使用 `cache: 'no-cache'`；网络异常或 HTTP 非成功响应时优先回退已有缓存。
- 缓存写入失败时仍把已取得的正常网络响应交给页面。

`skipWaiting()` 和 `clients.claim()` 不会自动替换已运行在页面内存中的脚本。发布后仍应重新加载页面，并检查页脚及诊断中的版本。

## 缓存边界

只处理静态资源清单中精确匹配的 GET 地址：根入口、HTML、两个 JS 文件、CSS、Manifest 和图标。带额外查询参数的地址不在这个精确匹配集合中。

以下内容不被 Service Worker 拦截或下载：

- 百度等第三方域名的播放清单及视频分片。
- 不在静态清单中的同域视频和其他文件。
- 非 GET 请求。
- `docs` 文档。

因此“页面已可离线打开”只代表应用界面可用，不代表视频离线可看。播放历史在 localStorage 中，属于另一套存储；保存进度不等于保存媒体。浏览器临时缓冲也不是项目实现的视频离线下载。

## 维护入口

- 更换图标：替换上述 PNG，保留尺寸和引用一致性，并在发布应用资源时更新缓存版本。
- 增加页面依赖：检查是否需要加入 `ASSETS`。
- 调整缓存逻辑：运行 [tests/sw.test.cjs](../tests/sw.test.cjs)，重点检查根入口、HTTP 错误回退、写入失败及其他应用缓存是否保留。
- 只修改实现文档：无需为此修改播放器版本或 Service Worker 缓存版本。
