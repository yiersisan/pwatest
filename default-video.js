// 用户授权公开的临时测试清单；分片签名会过期，替换时须重新验证。
window.DefaultVideo = Object.freeze({
  url: new URL('./assets/video/default.m3u8', location.href).href,
  title: '百度完整视频（8分57秒）',
  duration: 537,
  segments: 54
});
