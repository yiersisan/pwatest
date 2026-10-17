(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;
  else root.AppMedia = factory(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function (env) {
  "use strict";
  const files = new Map();
  const CHUNK = 1024 * 1024;
  async function fingerprint(file, onProgress = () => {}, signal) {
    const chunks = Math.ceil(file.size / CHUNK),
      head = new TextEncoder().encode(
        `pwatest-chunk-sha256-v1:${CHUNK}:${file.size}:`,
      ),
      parts = new Uint8Array(head.length + chunks * 32);
    parts.set(head);
    for (let i = 0; i < chunks; i++) {
      signal?.throwIfAborted();
      const bytes = await file.slice(i * CHUNK, (i + 1) * CHUNK).arrayBuffer();
      const digest = await env.crypto.subtle.digest("SHA-256", bytes);
      parts.set(new Uint8Array(digest), head.length + i * 32);
      onProgress((i + 1) / chunks);
    }
    signal?.throwIfAborted();
    return Array.from(
      new Uint8Array(await env.crypto.subtle.digest("SHA-256", parts)),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
  }
  function duration(file, signal) {
    return new Promise((resolve, reject) => {
      const video = env.document.createElement("video"),
        url = env.URL.createObjectURL(file);
      let timer;
      const finish = (error, value) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        video.removeAttribute("src");
        video.load();
        env.URL.revokeObjectURL(url);
        error ? reject(error) : resolve(value);
      };
      const abort = () => finish(Error("已取消"));
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = () => {
        video.onloadedmetadata = video.onerror = null;
        const n = video.duration;
        finish(
          Number.isFinite(n) && n > 0 ? null : Error("无法读取视频时长"),
          n,
        );
      };
      video.onerror = () => {
        video.onloadedmetadata = video.onerror = null;
        finish(Error("无法读取视频，请确认文件已下载到本机且编码受支持"));
      };
      signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => {
        video.onloadedmetadata = video.onerror = null;
        finish(Error("读取视频超时，请确认文件已下载到本机"));
      }, 20000);
      video.src = url;
      video.load();
    });
  }
  async function inspect(file, onProgress, signal) {
    if (!file.size) throw Error("不能导入空文件");
    if (
      !file.type?.startsWith("video/") &&
      !/\.(mp4|mov|m4v|webm)$/i.test(file.name)
    )
      throw Error("请选择视频文件，推荐 MP4（H.264 / AAC）");
    const n = await duration(file, signal);
    const sha256 = await fingerprint(file, onProgress, signal);
    return {
      kind: "local",
      name: file.name,
      size: file.size,
      type: file.type || "",
      lastModified: file.lastModified || 0,
      duration: n,
      sha256,
    };
  }
  return {
    CHUNK,
    fingerprint,
    inspect,
    attach: (id, file) => files.set(id, file),
    get: (id) => files.get(id),
    has: (id) => files.has(id),
    remove: (id) => files.delete(id),
    clear: () => files.clear(),
    count: () => files.size,
  };
});
