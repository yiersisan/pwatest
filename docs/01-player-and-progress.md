# 播放器、记录与断点续播

## v3.6 本地视频测试

定制页 `report.html` 的导入区增加“上传本地视频（测试）”。点击打开单文件选择器，`app.js` 将 File 转为临时 Object URL，复用现有原生 video、播放诊断和从头播放按钮。没有上传请求、服务器存储、视频转码或本机副本；不将文件完整读入 JS 内存。

- 选择后尝试自动播放，策略拒绝时提示点击原生播放按钮。
- 本地测试不写入播放历史、不绑定课程、不触发奖励。切换前照常保存原链接视频进度。
- 切换视频后释放旧 Object URL；非 bfcache 离开时释放，Safari 后退缓存保留时不提前释放。刷新后需重新选择。
- 取消选择、空文件及非视频文件不打断当前视频。文件选择器过滤是提示，最终编码支持以真实解码为准。
- 本机已下载的视频可在页面打开后离线播放；iCloud 文件需先下载。推荐 H.264 / AAC 的 MP4。此功能不代表网盘视频已离线缓存。

验证：75 项自动化测试通过，包括历史隔离、奖励隔离、资源释放、取消/无效选择、离线/编码错误提示。在桌面内置浏览器中经真实文件选择器选择 12 秒 H.264 / AAC 测试视频，观察到 640×360、readyState=4、currentTime=12、ended=true、无媒体错误。截图见 `evidence/local-video-upload.png`。

待真机：iPad Safari 与主屏幕 PWA 的“文件”/照片选择器、自动播放策略、实际视频的声音/拖动/大文件读取、离线选择及后台返回。本功能纳入 v3.6 发布。

当前默认来源和完整清单导入以[文档 07](07-local-hls-import.md)为准。

> v3.2 历史基线。当前首页已迁到学习界面，播放器位于 report.html；缓存策略与注册方式已更新，见[学习首页实现与验收](05-learning-home.md)。

适用版本：v3.2。更新日期：2026-10-17。[返回文档索引](README.md)

## 文件分工

| 文件 | 职责 |
| --- | --- |
| [index.html](../index.html) | 播放器、导入表单、历史列表、诊断面板及静态入口 |
| [styles.css](../styles.css) | 深色、粉色主题及响应式布局 |
| [player-core.js](../player-core.js) | URL 校验、记录身份、读取清洗、更新记录、恢复位置和时间格式化 |
| [app.js](../app.js) | DOM 交互、原生媒体事件、持久化、续播和诊断 |
| [tests/player.test.cjs](../tests/player.test.cjs) | 核心逻辑及模拟 DOM/媒体事件测试 |

纯静态 HTML/CSS/JavaScript，无构建步骤、后端或运行时第三方播放器依赖。`player-core.js` 在浏览器中暴露 `window.PlayerCore`，在 Node.js 中通过 `module.exports` 供测试使用；HTML 使用 `defer` 按顺序加载它和 `app.js`。

## 导入到播放的流程

1. `default-video.js` 的完整清单地址填入表单；预填不会自动创建记录或开始播放。
2. 提交表单时先保存旧视频进度，再通过 `Core.upsert()` 校验并新增或更新记录。
3. `select()` 暂停旧视频，设置当前记录和待恢复位置，更新界面及历史顺序。
4. 把链接赋给 `video.src`，调用 `video.load()`；在用户点击触发的流程中直接调用 `video.play()`，尽量保留用户手势。
5. `loadedmetadata` 到达后读取时长并尝试恢复位置。若自动播放被浏览器拒绝，提示用户点击原生播放按钮。

`<video controls playsinline preload="metadata">` 使用浏览器原生 HLS/MP4 能力。未设置 `crossorigin`，也不通过 JavaScript `fetch` 读取第三方播放清单。页面声明 `no-referrer`；诊断中的直接打开链接使用 `noreferrer` 和 `referrerpolicy="no-referrer"`。

当前没有 HLS.js 兼容层。原生能力、源站响应及实际视频编码共同决定能否播放；仅凭 `canPlayType()` 返回 `maybe` 不能确认成功。

## 记录存储

存储位置：当前浏览器的 `localStorage`，键名为 `pwatest-video-history-v1`，最多保留 50 条记录。

| 字段 | 含义 |
| --- | --- |
| `id` | 根据链接计算的稳定身份 |
| `url` | 最近一次导入的完整 HTTPS 视频链接 |
| `title` | 视频名称，最多 100 字符 |
| `position` | 已保存的播放秒数 |
| `duration` | 已知总时长（秒） |
| `completed` | 是否已播放结束 |
| `updatedAt` | 最近一次更新的毫秒时间戳 |

`decode()` 校验存储内容、清理无效记录及异常数值、去重，并按更新时间降序排列。JSON 损坏或存储读写被拒绝时显示提示，当前页面仍可操作。标题通过 `textContent` 渲染，不作为 HTML 执行。

记录不上传 GitHub，也不自动同步到其他设备、浏览器或主屏幕安装实例。项目未删除旧备忘录的存储键。清除网站数据可能使播放记录丢失。

## 链接身份与替换

- 只接受 HTTPS，拒绝包含 URL 用户名/密码的地址。
- 对 `pan.baidu.com/share/streaming`，存在 `uk` 和 `fid` 时以 `['baidu', uk, fid, shareid]` 的 JSON 字符串作为身份；`sign`、`timestamp` 等临时参数变化不会创建重复记录。
- 其他地址以规范化后的完整 URL 作为身份。
- “替换链接”通过 `replaceId` 明确关联旧记录，保留进度、时长和完成状态；应当用于替换同一视频的有效地址。

项目不会自动刷新百度签名，也不会把普通网盘分享页面解析成视频地址。

## 进度保存与恢复

`saveProgress()` 在 `timeupdate` 触发且距离上次保存至少 5 秒时执行，也在暂停、切换、页面隐藏及 `pagehide` 时执行；这不是独立的定时器。异常退出仍可能丢失最近尚未保存的进度。

保存前必须同时满足：当前记录存在、媒体已读到元数据、待恢复位置已处理完成、`readyState >= 1`，且 `currentSrc` 与当前记录的 URL 一致。这样避免新视频刚加载时把历史进度覆盖成 0，或把旧视频的状态写入新记录。

恢复逻辑由 `pendingResume` 保留目标，在 `loadedmetadata`、`canplay`、`durationchange`、`seeked`、`playing` 和 `timeupdate` 中尝试推进：

- 已看完的视频从 0 开始；“从头播放”也会清除完成状态和原位置。
- 已知时长时，目标不超过 `duration - 0.5` 秒，并保证非负。
- 距离目标小于 0.75 秒时视为恢复成功，允许后续保存。
- 尚不可定位或正在定位时等待后续事件重试。
- `playGeneration` 用于忽略切换视频后旧 `play()` Promise 的拒绝结果。

## 验证与扩展注意事项

现有测试覆盖导入、去重、替换、存储失败、自动播放被拒绝、切换、完成、续播和诊断文本。模拟事件不能证明真实媒体传输或解码正常，真机验证步骤见[部署与验证](03-deployment-and-validation.md)。

当前保持原生 video 与真实来源 URL 校验；未引入 HLS.js/MSE 或 Blob 播放通道。
