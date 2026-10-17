# 首页浏览器验证截图

`local-video-upload.png`：v3.6 定制页本地文件播放测试截图，真实文件选择器选择生成的 12 秒 MP4，浏览器解码并播放完毕；不是 iPad 真机截图。见[播放器说明](../01-player-and-progress.md#v36-本地视频测试)。

2026-10-17，本机浏览器渲染。`home-1024.png`、`home-1180.png`、`home-1194.png`、`home-1366.png`、`home-768.png`、`home-507.png` 为视口检查工具中的可见截图：iframe 使用对应 CSS 宽高，外层浏览器面板较窄，所以截图并未完整包含被测页面。不能当作对应 iPad 的完整截图或真机验收。

`home-preview.png` 为当前本机首页可见预览。完整指标及待真机项见[学习首页实现与验收](../05-learning-home.md)。

`home-offline.png`：内联图标修复后，停掉本机 HTTP 服务再刷新，任务数据与图标仍显示的可见截图。

入口现已从“报告”更名为“定制”（首页 v4.0.1）；本目录已有截图为更名前的布局验收记录，界面当前文字以源码为准。


## 内容中心 v4.1.0

详见 [内容中心实现与验收](../06-content-center.md)。`content-layout-check.txt` 为五种真实 CSS iframe 视口布局指标；`content-idb-check.txt` 为隔离测试数据库的事务验收；`content-navigation-check.txt` 为首页滚动恢复；`content-edge-check.txt` 为异常和合成状态；`content-offline-check.txt` / `content-center-offline.png` 为停止本地服务器后的页面重开证据。图片是桌面内置浏览器窄面板截图，不是iPad真机照片。

## 内容中心左右布局 v4.3.0

`content-horizontal-*` 是本次布局、奖励持久化、异常、首页返回和截图证据。截图为真实CSS尺寸的桌面浏览器iframe（无缩放），不是iPad真机；使用明确标注的内存演示数据，不覆盖真实学习记录。图集原图有金色背景，页面使用CSS圆形裁切。当前实现说明见[内容中心文档](../06-content-center.md)。
