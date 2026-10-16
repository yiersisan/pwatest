# 幼儿学习首页：实现与验收

更新日期：2026-10-17。首页 v4.0.1 / 原播放器 v3.2 / SW 缓存 v8。[返回索引](README.md)

## 需求来源与处理

已读取用户实现包中的 `CODEX_PROMPT.md`、`IMPLEMENTATION.md`、`assets/asset-manifest.json`，并查看 `reference/ui-reference.png` 与插画 atlas。项目沿用原生 HTML/CSS/JavaScript，不引入框架、构建器或第三方 CDN。

用户明确要求横屏，优先于包内“不强制 landscape”的建议：Manifest 使用 `landscape`，以 iPad 横屏校准布局。Safari 不保证强制旋转设备，因此竖屏显示旋转提示，仍能访问两个入口和任务；没有 CSS 旋转/缩放整页或阻断分屏访问。参考：[Manifest orientation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/orientation)。

## 文件与入口

| 文件 | 实现 |
| --- | --- |
| [index.html](../index.html) | 新学习首页、两个顶部入口、两条任务轨道、原生 dialog、内联图标 |
| [home.css](../home.css) | `learning-page` / `learning-home` 专用样式、安全区、绿色根背景、横滑及响应式 |
| [home.js](../home.js) | 读取演示数据、渲染、弹窗、轨道提示、键盘控制、图片降级与交互 |
| [learning-data.json](../learning-data.json) | 本地演示课程、每日必修 ID、初始示例完成状态 |
| [learning-core.js](../learning-core.js) | 数据校验、演示进度读取、每日必修统计和周末日期判断 |
| [report.html](../report.html) | 原首页移到“定制”；增加返回首页和更新提示 |
| [app.js](../app.js)、[player-core.js](../player-core.js)、[styles.css](../styles.css) | 保留真实播放器；SW 注册抽到共享文件，更新前保存进度；定制页单独加载旧样式 |
| [pwa.js](../pwa.js)、[sw.js](../sw.js)、[manifest.json](../manifest.json) | 共享 PWA 注册、用户确认更新、完整离线界面、横屏偏好与主题色 |
| [asset-manifest.json](../assets/asset-manifest.json) | 运行时 atlas 映射和原包资源说明 |

首页入口、页面标题与相关提示现统一命名为“定制”；为兼容现有链接，文件路径仍保留 `report.html`，图标 symbol 名称仍为 `report`。

“定制”直接链接 `./report.html`，不是演示定制弹窗。真实视频的原存储键、链接替换去重、原生播放、断点续播均保留，没有把演示课程映射到用户的百度视频。

## 演示范围

内容中心、个人资料、老师点评、周末活动、课程详情都明确标注演示。点评的“10 条”和初始完成的 Yummy Fruits 是设计示例，不代表真实老师留言或用户学习结果。

必修集合为 `fruits/yummy/cake`，由 `requiredIds` 明确定义；今日的点评、活动、小课堂、故事推荐不是必修统计来源。打开课程不改变状态，只有明确的“演示：标记已完成”操作会保存示例进度。

演示存储键 `pwatest-learning-demo-v1` 与真实播放器完全分开。存取失败时显示提示；课程结构错误显示失败提示，重试按钮会重新请求本地 JSON 并校验。空课程集合显示空态。周末开放提示使用本机日期，不冒充服务端时间判断。

## 视觉与素材

采用白色圆角卡片、薄荷绿内容区、主绿色底层和按钮；字体使用系统中文字体。所有文字、卡片、按钮、状态均为独立 DOM。没有使用参考图作背景或切片。

原包 8 个插画 SVG 都内嵌同一张 PNG，合计约 21.6 MB。实现复用包内 **1774×887、4×2、每格 443.5×443.5** 的 atlas（约 2 MB）：先按行列裁出正方形，再由封面容器按比例裁切，不拉伸人物。图像加载失败时保留卡片、文字和交互，显示统一浅绿占位。

图标来自包内原生 SVG，使用 `currentColor`。首次本地停服测试发现外链 `<use href="sprite.svg#…">` 未可靠离线显示，因此改为将 symbol 内联进首页，使用片段引用；原 SVG 素材仍保留以便维护。安装图标继续沿用用户之前指定的图案。

## 滚动、横屏与安全区

- 今日卡宽 `clamp(278px,29.5vw,430px)`，周卡宽 `clamp(218px,22vw,318px)`；窄屏分别为 82vw 和 65vw。
- 两条轨道独立 `overflow-x:auto`、原生惯性滚动、proximity 吸附和横向 overscroll contain；无自动轮播，无全局 touchmove 拦截。
- 页面自然纵向滚动，不创建全屏纵向嵌套滚动层；从卡片区域上下滚仍能移动页面。
- 轨道本身聚焦时支持左右方向键、Home/End，不拦截子按钮的方向键。超过 10px 的指针移动后抑制同次点击，真机横滑误触仍需验证。
- 右缘渐隐只在右侧存在未显示内容时出现，到末端消失。
- 根 html/body 纯绿色 `#12AD65`，内容层 `#D9FFF0`。顶部/底部和左右安全区各加一次，min-height 采用 vh/svh，保留缩放及自然回弹。
- 弹窗用原生 `showModal()`，背景不可操作；仅弹窗期间锁定 body，关闭恢复原滚动位置与触发按钮焦点。Escape 可关闭。
- 不承诺 CSS 可以控制 Safari 系统工具栏或所有 iPadOS 回弹区域。[WebKit 安全区参考](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)。

## 缓存更新变化

本次从旧版“网络优先 + 自动 skipWaiting”改为“当前版本缓存优先 + 等待用户更新”。原因是首页、脚本、数据及插画必须配套，避免活跃页面途中自动换版。

安装时完整预缓存首页、定制页、运行脚本、样式、数据、Manifest、安装图标及图集。注册使用 `updateViaCache: none`。等待中的 SW 只在收到 `ACTIVATE_UPDATE` 消息后激活；定制页先保存视频进度，再重新加载。缓存清理仍仅针对当前 scope 的项目缓存。

根 URL 和 `index.html` 均缓存；缺失时网络成功响应更新两者。视频、其他域名、文档及测试页面不纳入预缓存。离线能力需先成功完成一次安装，不等于下载课程媒体。

## 自动及浏览器验证

运行：`node --test tests/*.test.cjs`；本次 **26/26 通过**。包含原视频播放器回归、必修计数、演示隔离、坏数据/空集合、周末日期、静态引用、atlas 尺寸及 SW 更新/离线/缓存隔离。

使用 `node scripts/serve.cjs` 启动后，通过本机浏览器实际渲染；[视口检查页](../scripts/visual-check.html) 使用指定尺寸的真实 iframe，不缩放被测页面。所得指标：

| CSS 视口 | 页面 clientWidth / scrollWidth | 今日轨道 scrollWidth | 本周轨道 scrollWidth | 图像失败 |
| --- | --- | --- | --- | --- |
| 1024×768 | 1024 / 1024 | 1332 | 1266 | 0 |
| 1180×820 | 1180 / 1180 | 1535 | 1458 | 0 |
| 1194×834 | 1194 / 1194 | 1553 | 1476 | 0 |
| 1366×1024 | 1366 / 1366 | 1777 | 1688 | 0 |
| 768×1024 | 768 / 768 | 1212 | 1204 | 0 |
| 507×820 | 507 / 507 | 1745 | 1744 | 0 |

507px 分屏下两个导航入口各约 229px，在头像下方并排；未遮挡昵称。浏览器验证了课程打开不改变 1/3 完成数、Escape 关闭并返回触发按钮焦点、“定制”进入原播放器。

独立轨道实测：周轨道滚到 `1236.5` 时今日仍为 `0`；今日随后滚到 `1238` 时周轨道保持原位；末端 `hasMore=false`。今日返回起点后周轨道仍保持末端。

离线复测：停止本机 HTTP 服务器后，重新加载已缓存首页，任务数据、插画及内联 SVG 图标正常显示；见 [home-offline.png](evidence/home-offline.png)。等待更新提示出现后，点击更新按钮完成激活并自动重新加载；此为本机浏览器测试，不替代 iPad 飞行模式验收。

截图见 [evidence](evidence/README.md)。由于可用浏览器面板宽高有限，视口检查截图仅记录可见部分，**不是六种设备的整页截图，也不等于 iPad 真机截图**；宽页面的右侧和完整纵向内容仍需目标设备对照。

## 待 iPad 真机验收

- [ ] Safari 标签页与主屏幕 PWA 均检查横屏启动、方向锁定实际支持情况、横竖切换及 507px 左右分屏。
- [ ] 顶部下拉、底部上拉确认网页露底绿色；记录系统工具栏/原生区域是否仍有其他颜色。
- [ ] 工具栏收起与展开、四周安全区、页面底部可达，不裁掉任务或按钮。
- [ ] 两轨道触摸惯性、从卡片上纵向滚动、横滑不误点、双指缩放。
- [ ] 主屏幕安装图标、启动名称及独立窗口；设备断网后的首页/图标/插画/定制页刷新。
- [ ] 更新提示点击前后行为、视频播放中的更新前保存、关闭重开后的续播。
- [ ] 真实设备的图片加载失败、存储不可用、VoiceOver 与外接键盘。
- [ ] 目标尺寸完整截图对比参考，尤其宽屏右缘、周任务整行和封面主体裁切。

发布目标为 GitHub 仓库 `yiersisan/pwatest` 的 `main` 分支，站点 https://yiersisan.github.io/pwatest/ 。以上为发布前的本地代码和本机浏览器验证记录；线上部署结果以 GitHub Pages 对应提交的运行状态为准。
