# 家长定制四界面实现与验收

2026-10-17。沿用原生 HTML/CSS/JavaScript、原有播放器和 PWA，未引入框架或构建依赖，未部署。

## 入口与运行

运行 `node scripts/serve.cjs`，访问 `http://127.0.0.1:8080/pwatest/`。

- `index.html` 和 `content-center.html` 的“定制”打开同一个家长验证弹窗。
- `parent-courses.html`：课程与视频；右上角打开 `parent-upload.html`，保持当前课程。
- `parent-home.html`：首页配置，今日任务固定在上方。
- `report.html`：保留原有链接 / M3U8 导入、本地视频测试、断点续播、奖励桥接。管理页和服务不可用页都保留此入口。
- 视觉演示：`parent-courses.html?demo=1`，可切换全部三个管理界面。此参数只选择公开演示数据，不授予任何家长权限。演示持久化键为 `pwatest-parent-visual-demo-v1`，不读写现有视频历史或奖励库。
- 演示首页：`index.html?demo=1`，读取演示已保存的配置。正式首页不会读取演示配置。

## 源材料与取舍

完整阅读资源包 CODEX_PROMPT、三份 docs、assets/manifest、四个 demo HTML、共用 CSS 与 JS，并逐张打开四张参考图。资源包位于 `/Users/summer/Downloads/家长定制四界面_Codex实现资源包.zip`，解压阅读目录 `/private/tmp/pwatest-parent-resource/parent-customization`。

以用户最后要求为准，集中验证 **iPad 横屏 1180×820**，补查 1024×768 弹窗与布局，不扩展竖屏/分屏矩阵。资源包中“保留双指缩放/文字可选”与项目 AGENTS 及本次提供的项目指令冲突，采用项目全局禁选、禁图片拖拽、禁缩放要求，表单仍允许输入编辑和单指滚动。

插图和图标来自包内 assets，以 `assets/parent/` 命名隔离。四张参考 PNG 没有参与运行时渲染；所有文案、按钮、输入、列表及卡片均为独立 DOM。插画图集是资源包提供的近似素材，并非参考图原图裁片；没有擅自重画原有内容中心。

## 已实现与接口缺口

| 能力 | 当前状态 |
| --- | --- |
| 内容中心/首页 → 验证弹窗 | 已连接真实页面入口；六槽/单一密码输入、自定义数字键盘、退格、禁用提交、异步防重、关闭清空及焦点恢复 |
| 家长身份确认/找回/会话 | 工程中不存在后端。默认拒绝进入；没有默认密码、前端密码比较或本地会话授权 |
| 课程 CRUD / 标题 / 换课 / 排序 | 界面和统一适配调用已实现；独立演示可验证。正式读写等待后台。排序不改首页顺序，换课保留 ID 并追加目标末尾 |
| 上传队列 | 文件多选、逐条标题/课程、关联行内建课、移除、真实回调状态、失败重试、幂等键和服务端 ready 校验；演示明确失败，不模拟成功 |
| 首页配置 | 视频选择器搜索/课程过滤/多选去重；移除/排序；栏目增删排序；草稿/预览/保存分离；版本冲突保留草稿；应用内离开提示与 beforeunload |
| 儿童自定义首页 | `ParentView.published` 同时用于预览和儿童首页；仅在已发布配置可读取时替换原有示例栏目，无服务时原首页保持可用 |
| 视频播放 | 已发布视频通过 `parent-playback.js` 接入原 `pwatest:import-source` 事件，复用原播放器和续播。真实发布目录与播放地址尚待后台联调 |
| 全局交互与离线 | 共享 interaction.css/js 覆盖全部入口，viewport 禁缩放；SW v24-parent-customization 缓存新资源，更新前保护未保存草稿和上传队列 |

**当前没有真实验证、云端上传、转码或正式保存接口可连接。** 不能把本机演示的可用性当成这些服务已经上线。原有工具是本地视频/链接播放，不是持久化文件上传，不把它包装成正式上传。

## 后端适配契约

在 `parent-backend.js` 提供 `window.ParentBackend`，沿用未来/外部现有服务的账号上下文、Cookie/令牌、CSRF 和接口路径，不在 UI 硬编码虚构的 REST URL。所有返回值为 Promise；每个读写服务必须在服务端校验所属账号及家长权限。

```js
window.ParentBackend = {
  session(),                    // => { verified: boolean }
  verify(pin),                  // => { verified: true }，失败抛 INVALID_PIN / RATE_LIMITED 等
  recover(),                    // 启动已有家长身份确认流程，不能直接重置 PIN
  logout(),                     // 撤销家长会话
  catalog(),                    // => { version, courses, videos, home }
  mutate(action, payload, expectedVersion), // => 完整新 catalog
  saveHome(draft, expectedVersion),         // => 已确认的新 HomeConfig
  upload(item, onStatus),        // => 服务端确认可用的 Video（id + status:'ready'）
  published()                   // 儿童可读账号范围目录 { courses, videos, home }，无配置返回 null
};
```

- Course：`{ id, tag, title, color }`。Video：`{ id, courseId, title, durationSeconds, thumbnailUrl, playbackUrl, status }`。`videos` 的相对顺序是课程顺序。
- HomeConfig：`{ version, todayVideoIds, sections: [{ id, title, subtitle, videoIds }] }`，只保存 ID 引用。
- `mutate` 的 action/payload：`course:{id?,tag,title}`、`title:{id,title}`、`move:{id,courseId}`、`order:{courseId,ids}`。换课和排序必须原子写入，`expectedVersion` 过期抛 `CONFLICT`；不可静默覆盖。
- `upload` 的 item：`{file,title,courseId,idempotencyKey,serverVideoId?}`。复用该键重试；服务端保证不重复建视频。`onStatus({status:'uploading'|'processing',progress?:0..100,serverVideoId?})` 仅用真实上传/处理反馈。服务端确认 ready 才 resolve；处理中应等待/轮询原任务，不把浏览器传输完成当作可用。
- 文件大小/格式/解码/转码能力由真实服务判断并返回用户可读错误；当前选择器限制 video 类型只是文件选择提示。
- 目录接口需提供稳定 videoId、最新标题、归属与封面；原播放器历史的身份仍沿用 PlayerCore 的 URL/source identity。正式签名 URL 刷新、服务端 videoId 与历史 source identity 的映射、跨课程奖励关联需后台联调，不能靠改标题生成新视频。
- `UNAUTHORIZED` 应拒绝每个请求；前端会提示回到验证。服务不可用 `UNAVAILABLE`，版本冲突 `CONFLICT`，其他错误携带可读 message。
- 接口数据不进入 Service Worker 静态资源缓存。

## 实际截图与逐图对照

所有截图来自本机工程实际 DOM，截图时浏览器视口 **1180×820**；后三张为完整滚动页面，长页面高度大于视口，不使用整页缩放。

| 对照图 | 实际截图 | 检查结论/差异 |
| --- | --- | --- |
| 01-parent-gate | [实际弹窗](evidence/parent-customization/01-parent-gate.png) | 白色圆角弹窗、青色遮罩、锁头、六槽、3×4键盘与空位、底部提交结构一致；横屏弹窗宽500，高约692，按钮在可见区内。新增必要的服务未配置提示。背景使用已有内容中心 |
| 02-course-videos | [实际课程管理](evidence/parent-customization/02-course-videos.png) | 顶部双页签、左课程右视频双列、封面/序号/标题/操作分离；横屏已调整为150px封面、横排操作。计数根据实际演示数据为4/0，不抄图中8/6等示意计数。增加旧播放器入口 |
| 03-upload-videos | [实际上传页](evidence/parent-customization/03-upload-videos.png) | 横向虚线选择区、两条独立视频表单、第二条的浅绿建课表单和底部提交；字段/字符计数真实，未预填虚构文件到正式模式。长队列自然纵向滚动 |
| 04-home-config | [实际首页配置](evidence/parent-customization/04-home-config.png) | 今日任务固定；第二栏目标题/副标题输入；各栏目横向单行卡片、移除、排序和末尾添加卡，底部新增栏目。字体为系统中文字体，图集插画/山丘装饰与参考原图细节不同 |

未承诺像素级一致。布局比例、控件状态和独立交互优先；使用资源包已有插画，而非参考图中不存在的独立封面文件。

## 验证记录

- `node --test tests/*.test.cjs`：83/83 通过，包含原播放器、奖励、HLS、离线缓存回归及新增 7 项家长规则/适配器测试及带查询参数页面的离线回归。
- 浏览器实际操作：课程排序前后移动与恢复；首页移除后预览，离开出现三选项并可放弃；上传第二行选择同名课程只影响该行；点击上传后逐行显示未接入提示，不增加视频；PWA 更新提示及手动更新成功。
- 弹窗：0/2/6位输入、提交禁用/启用、服务未接入拒绝、关闭清空、焦点返回“定制”；1024×768 下底部验证按钮约635px，弹窗底部约730px，没有遮挡。
- 页面布局：1180×820 课程页及 1024×768 课程/首页配置页无全页横向溢出。表单正常输入；图集和 SVG 使用正常。
- 实际点击保存后，`index.html?demo=1` 读取已保存演示配置；正式直接访问管理 URL 显示“家长功能暂未开放”。最终版本浏览器没有捕获到控制台错误。
- 全局样式读取确认标题 user-select 为 none、body touch-action 为 pan-x pan-y、viewport 包含 maximum-scale=1 / user-scalable=no。真实 iPad 浏览器是否覆盖该限制仍需真机验证。
- 新增业务测试涵盖：生产无服务拒绝访问、无 PIN 本地存储、适配委托、换课保留 ID 与首页引用、完整排序与版本校验、草稿与保存隔离、同行去重/跨行允许、失效视频拒绝、演示上传不伪装成功。

## 待验证

- 真正的家长服务、错误次数限制、首次设密/身份找回、会话到期与服务端权限绕过测试。
- 真实多文件上传的进度、部分成功、断网/重试幂等、转码、视频 ready 和服务器封面。
- 正式配置保存/版本冲突、跨设备刷新、正式视频播放地址与原有历史/奖励关联。
- iPad Safari 与主屏幕 PWA 的触摸拖动、横滑、系统键盘、缩放限制、回弹、安全区和视频解码。桌面横屏尺寸截图不等于 iPad 真机验收。
- 未进行额外竖屏/分屏适配验收，按本次最后要求控制范围。

## 主要改动文件

- 新增页面：`parent-courses.html`、`parent-upload.html`、`parent-home.html`。
- 新增组件与数据层：`parent-gate.js/css`、`parent-app.js`、`parent.css`、`parent-core.js`、`parent-service.js`、`parent-backend.js`、`parent-view.js`。
- 儿童端接入：`parent-public.js/css`、`parent-playback.js`；修改 `index.html`、`home.js`、`content-center.html`、`report.html` 的脚本/入口。原 `app.js` 播放流程保持原状。
- 全局与缓存：`interaction.css/js`、`sw.js`、`pwa.js`；资源在 `assets/parent/`。
- 测试：`tests/parent.test.cjs`、`tests/sw.test.cjs`；完整结果在 [tests.txt](evidence/parent-customization/tests.txt)。
- 文档：本文件、`README.md`、`docs/README.md`；实际截图在 `docs/evidence/parent-customization/`。
