# 卡片直达全屏播放与长按保护

本地版本 v4.2.0，原播放器 v3.4，Service Worker v18-default-hls-1。随本次完整清单版本发布。入口行为以本文为准，替代文档05、06中的课程弹窗说明；奖励算法和历史数据保持原样。

## 入口

- 首页今日任务中的点评、周末活动、学习卡片，以及本周课程，点击后直接进入 `report.html#watch=1&placeholder=1&from=home&title=…`，不打开课程详情或完成确认弹窗。
- 内容中心所有“开始学习 / 继续学习 / 继续收集”按钮直接进入同一全屏播放器，参数包含课程ID和返回来源。演示页面的学习按钮也播放占位视频，不再用按钮点击模拟加分。
- 首页的个人资料与安装说明仍是原有辅助弹窗，不属于课程播放入口。
- 占位视频使用 `default-video.js` 指向的 08:57 完整清单，替代旧的 100 秒 streaming 链接；详见文档 07，不在路由或本文重复签名参数。
- 播放页移除上下工具栏、标题、说明及返回/重试/定制按钮，仅保留左侧中央锁图标。使用浏览器返回操作回到来源页面；首页与内容中心仍记录滚动位置。

## 播放方式

没有另外实现一套播放器。`watch-player.js` 根据 hash 参数启用 `.watch-mode`，`watch-player.css` 将原有 report 页面切换成占满可视区域的播放页，隐藏导入表单、历史列表和诊断区。视频、续播、加载/错误处理和M3U8清单导入核心仍使用 `app.js`、`player-core.js` 及现有 HLS 模块。正常打开 `report.html` 仍是原定制界面。

进入页面立即调用原播放器的 play()，并设置 autoplay 与 playsinline。若有声自动播放被 NotAllowedError 拒绝，尝试静音播放；如果静音也被拒绝，需使用解锁状态下的原生播放按钮。网页不能保证绕过 Safari 自动播放策略。

播放画面铺满网页视口，不主动调用系统原生视频全屏，以便左侧锁图标始终处于同一页面层。默认解锁，保留原生暂停、进度和音量控件；点击锁图标后关闭 controls、覆盖透明交互层并阻止播放/跳转快捷键，锁图标本身仍可点击解锁。锁定只改变页面操作，不修改播放位置、奖励和记录，也不强制重新播放已暂停或已结束的视频。系统媒体控制、系统手势和 Safari 浏览器工具栏不属于网页锁定范围。

占位视频复用原播放记录的数据格式和续播代码，但使用独立键 `pwatest-preview-history-v1`。因此不会覆盖用户真实视频的地址、标题、进度，也不会把同一占位视频自动绑定到五个课程。占位模式不加载 CoursePlayer 奖励桥接；历史课程累计、英雄和去重凭证不变。将来换成真实课程源时，应明确课程关联再取消 placeholder，不能把占位观看自动补发成课程完成。

## 长按保护

所有三个应用页面共用 `interaction.css` 和 `interaction.js`：

- 展示文字使用 `user-select:none`、`-webkit-user-select:none`。
- 图片和链接关闭 `-webkit-touch-callout`；图片关闭拖动与命中，点击继续由其外层卡片接收，避免长按暴露整张插画图集。
- 非编辑区阻止 contextmenu、selectstart、copy、cut 和 dragstart。
- 视频原生控制器仍可操作；不拦截 touchstart、touchmove 或全局指针按下，保留原生滚动、横滑与双指缩放。
- 导入框、输入框和可编辑区域保留选择、修改、粘贴菜单，避免“定制”无法粘贴视频链接。

这是应用界面的交互限制。iPad系统菜单与原生视频控件的实际长按行为仍需真机检查。

## 文件

新增 `watch-player.js`、`watch-player.css`、`interaction.js`、`interaction.css`、`tests/watch.test.cjs`、`scripts/watch-check.html`。

更新 `index.html`、`home.js`、`content-center.html`、`content-center.js`、`content-center.css`、`content-config.js`、`report.html`、`app.js`、`course-player.js`、`sw.js`、播放器回归测试及文档索引。保留工程中已有的 HLS 清单导入改动。

## 验证

`node --test tests/*.test.cjs`：60项通过，包括播放器/HLS/奖励原有回归，以及占位记录隔离、禁用奖励桥接、正常定制页面不受全屏模式影响、进入自动播放、静音重试、锁控开关、画面点击与键盘进度拦截和编辑区域例外。

浏览器验收工具 `scripts/watch-check.html`：

2026-10-17 本次执行五种视口与锁定/解锁检查，均通过；首页学习卡片手动点击直达，锁定后原生控制条消失。下列原有入口与长按验收记录保留：

- 1024×768、1180×820、1366×1024、768×1024、507×820：页面宽高匹配视口，无横向/纵向溢出，视频区域与视口等宽等高、锁图标垂直居中、上下工具栏隐藏。
- 首页点评、周末卡片、本周课程和内容中心英语按钮：直接到全屏模式，0个打开的dialog，并可返回对应来源。
- 三个页面展示文字的 computed user-select 为 none，模拟 contextmenu/copy 均被阻止，图片 pointer-events 为 none；定制textarea仍为text选择且允许编辑菜单。
- 当前桌面浏览器未能成功加载百度占位视频；本次只确认地址接入、页面跳转和播放器反馈，不宣称真实画面/声音已验证。

本次证据：`docs/evidence/watch-lock-layout-check.txt`、`watch-lock-interaction-check.txt`、`watch-lock-preview.png`（桌面视频加载失败时的锁定界面）。此前证据：`docs/evidence/watch-layout-check.txt`、`watch-routes-check.txt`、`watch-interaction-check.txt`、`watch-preview.png`。大视口指标来自真实尺寸iframe，截图来自桌面内置浏览器当前窄面板。

待 iPad Safari 验收：长按文字/头像/卡片图片是否仍出现系统菜单，输入框粘贴、双指缩放与任务横滑，实际视频加载、有声自动播放和静音回退、锁定后连续点击/双击/拖动不能暂停或跳进度、解锁恢复控件，以及主屏幕PWA的安全区和浏览器返回行为。
