# 小小学习岛 PWA

原生 HTML/CSS/JavaScript 的幼儿学习首页，沿用已有视频链接播放器，无框架、构建步骤或远程 CDN 依赖。

- 首页：`index.html`，今日任务与本周任务独立横滑。
- 内容中心：`content-center.html`，展示已保存的课程奖励；学习按钮暂直达全屏占位播放；实现与验收见 [内容中心文档](docs/06-content-center.md)。
- 定制：`report.html`，真实视频导入、播放记录与断点续播；原来的存储键和播放方式保留。
- 首页课程、资料、点评与周末活动均为明确标注的演示，不接入真实课程后台。
- 当前首页 v4.2.0、内容中心 v4.3.0，播放器逻辑 v3.5，Service Worker 缓存 v20-content-horizontal-2。

## 实现文档

从 [docs 文档索引](docs/README.md) 查找实现方式；视频方案见[完整清单与一键导入](docs/07-local-hls-import.md)，界面改动见[全屏播放与长按保护](docs/08-direct-watch-and-interaction.md)，内容中心基础见[内容中心实现与验收](docs/06-content-center.md)，首页基础见[学习首页实现与验收](docs/05-learning-home.md)。后续新增文档时同步更新索引。

## 本机运行

Node.js 18+，在项目根目录执行：

```sh
node scripts/serve.cjs
```

打开 <http://127.0.0.1:8080/pwatest/>。内容中心验收工具位于 <http://127.0.0.1:8080/pwatest/scripts/content-check.html>。首页六种视口检查工具位于 <http://127.0.0.1:8080/pwatest/scripts/visual-check.html>。

开发服务器仅监听本机；iPad 安装、回弹与离线验收请使用 HTTPS 部署站点。`file://` 或局域网 HTTP 不代表 PWA 能正常安装。

## 测试

```sh
node --test tests/*.test.cjs
```

包括旧播放器回归、演示数据隔离、每日必修统计、静态资源引用、图集参数、离线资源、缓存更新与清理。媒体测试使用模拟事件，不代替 iPad 视频解码与续播验收。

## 部署与更新

既有 GitHub Pages 仓库为 `yiersisan/pwatest`，发布源 `main` / 根目录。上传全部运行文件，包括 `assets` 目录以及 `report.html`；保留 `.nojekyll`。

首页和定制页通过 `pwa.js` 共用一套 SW。完整预缓存后支持离线首页及定制界面；当前版本缓存优先，新版本等待用户点击更新，避免自动切换打断操作。修改运行资源时递增 `sw.js` 缓存版本，不能只改 CSS 而漏改版本。

## 范围与限制

- 横屏布局优先，Manifest 指定 `landscape`；Safari 是否接受方向偏好由系统决定，竖屏显示旋转提示并保留可访问布局。
- 首页根背景及 Manifest 主题色为 `#12AD65`，内容区为薄荷绿；真实 Safari 回弹、安全区、工具栏和独立 PWA 模式仍需真机测试。
- 用户视频仍由原生 `<video>` 播放，没有加入 HLS.js、代理、分享页解析、签名刷新或离线视频下载。
- 网盘临时链接能否播放取决于源站响应、权限、有效期和设备解码能力。默认完整测试清单为 08:57 / 54 个分片，用户已允许公开部署；配置在 default-video.js，文件为 assets/video/default.m3u8。文档不复制签名参数。
- 课程奖励使用 IndexedDB `pwatest-course-rewards-v1`；视频记录保存在 `pwatest-video-history-v1`，演示状态使用独立的 `pwatest-learning-demo-v1`，不跨设备同步。旧备忘录数据没有删除。
- 包内插画使用共享 atlas；SVG 图标内联。保留用户之前指定的 PWA 安装图标。未将设计参考图用作页面背景。
