(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HlsImportCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const MAX_BYTES = 1024 * 1024;
  function inspect(text) {
    if (typeof text !== "string" || text.length > MAX_BYTES)
      throw new Error("清单过大（最多 1 MB）。");
    const lines = text
      .replace(/^\uFEFF/, "")
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim());
    if (lines[0] !== "#EXTM3U")
      throw new Error(
        "不是 M3U8 清单；请保存网络请求的响应正文，不能使用错误 JSON 或网页。",
      );
    if (
      lines.some(
        (line) =>
          line.startsWith("#EXT-X-STREAM-INF:") ||
          line.startsWith("#EXT-X-MEDIA:"),
      )
    ) {
      return {
        kind: "master",
        duration: 0,
        segments: 0,
        complete: false,
        lines,
      };
    }
    let duration = 0,
      segments = 0,
      pending = null;
    for (const line of lines) {
      if (line.startsWith("#EXTINF:")) {
        if (pending !== null) throw new Error("清单缺少视频分片地址。");
        const value = Number(line.slice(8).split(",")[0]);
        if (!Number.isFinite(value) || value <= 0)
          throw new Error("清单包含无效的分片时长。");
        pending = value;
      } else if (line && !line.startsWith("#")) {
        if (pending === null) throw new Error("清单包含没有时长的视频分片。");
        duration += pending;
        segments++;
        pending = null;
      }
    }
    if (pending !== null || !segments) throw new Error("清单缺少视频分片。");
    return {
      kind: "media",
      duration,
      segments,
      complete: lines.includes("#EXT-X-ENDLIST"),
      lines,
    };
  }
  function normalize(text, base = "") {
    const info = inspect(text);
    if (info.kind !== "media")
      throw new Error("这是清晰度目录。请选择它引用的、含 EXTINF 的媒体清单。");
    if (!info.complete)
      throw new Error(
        "这是未结束的动态清单，不能作为完整点播导入；请保存带 EXT-X-ENDLIST 的媒体清单。",
      );
    if (
      info.lines.some(
        (line) => line.startsWith("#EXT-X-DEFINE:") || line.includes("{$"),
      )
    )
      throw new Error("暂不支持使用变量的清单。");
    function resolve(value) {
      let url;
      try {
        url = base ? new URL(value, base) : new URL(value);
      } catch {
        throw new Error(
          "清单含相对地址，请填写这份清单原来的 HTTPS 请求地址。",
        );
      }
      if (url.protocol !== "https:" || url.username || url.password)
        throw new Error("视频分片和密钥必须使用不含账号密码的 HTTPS 地址。");
      return url.href;
    }
    if (base) resolve(base);
    const body =
      info.lines
        .map((line) => {
          if (line && !line.startsWith("#")) return resolve(line);
          // Preserve byte ranges, keys, maps and discontinuities; only resolve URI attributes.
          return line.replace(
            /([:,])URI="([^"]*)"/g,
            (_, prefix, uri) => prefix + 'URI="' + resolve(uri) + '"',
          );
        })
        .join("\n") + "\n";
    return { body, duration: info.duration, segments: info.segments };
  }
  return { MAX_BYTES, inspect, normalize };
});
