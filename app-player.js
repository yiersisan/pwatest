"use strict";
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;
  else root.createAppPlayer = factory;
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function ({
    video,
    media,
    store,
    core,
    status,
    onChange,
    onReward,
    scope = new URL("./", location.href).href,
    URLClass = URL,
    now = Date.now,
  }) {
    let current = null,
      objectURL = null,
      generation = 0,
      ready = false,
      lastSave = 0,
      suspended = true,
      saveChain = Promise.resolve(),
      pendingResume = 0,
      locked = false;
    function enqueue(edit) {
      saveChain = saveChain
        .catch(() => {})
        .then(() => store.update(edit))
        .then(({ state, result }) => {
          onChange(state);
          return { state, result };
        })
        .catch((error) => {
          status("学习记录未保存：" + error.message);
          throw error;
        });
      saveChain.catch(() => {});
      return saveChain;
    }
    function persist(force = false) {
      if (
        !current ||
        !ready ||
        suspended ||
        video.readyState < 1 ||
        pendingResume !== null
      )
        return saveChain;
      if (!force && now() - lastSave < 5000) return saveChain;
      const id = current.id,
        pos = Number(video.currentTime),
        duration = Number(video.duration),
        at = now();
      if (
        !Number.isFinite(pos) ||
        pos <= 0 ||
        !Number.isFinite(duration) ||
        duration <= 0
      )
        return saveChain;
      lastSave = at;
      return enqueue((state) =>
        core.saveProgress(state, id, pos, duration, at),
      );
    }
    function release() {
      ready = false;
      video.pause();
      video.removeAttribute("src");
      video.load();
      if (objectURL) {
        URLClass.revokeObjectURL(objectURL);
        objectURL = null;
      }
    }
    async function select(item, progress) {
      await persist(true).catch(() => {});
      generation++;
      suspended = true;
      release();
      current = item;
      locked = false;
      video.controls = true;
      pendingResume = progress?.position || 0;
      suspended = false;
      const ticket = generation;
      let url;
      if (item.source.kind === "local") {
        const file = media.get(item.id);
        if (!file) {
          status("请先重新关联这个本机视频");
          return false;
        }
        url = URLClass.createObjectURL(file);
        objectURL = url;
      } else if (item.source.kind === "playlist")
        url = new URL("__playlist__/" + item.id + ".m3u8", scope).href;
      else url = item.source.url;
      video.src = url;
      video.load();
      status("正在加载视频…");
      try {
        await video.play();
      } catch {
        if (ticket === generation) status("请点击播放器开始播放");
      }
      return true;
    }
    function metadata() {
      if (
        !current ||
        suspended ||
        !Number.isFinite(video.duration) ||
        video.duration <= 0
      )
        return;
      ready = true;
      const target = Math.min(
        pendingResume || 0,
        Math.max(0, video.duration - 0.5),
      );
      pendingResume = null;
      if (target > 0) video.currentTime = target;
      status("播放进度自动保存");
    }
    video.addEventListener("loadedmetadata", metadata);
    video.addEventListener("timeupdate", () => persist());
    video.addEventListener("pause", () => persist(true));
    video.addEventListener("ended", () => {
      if (
        !current ||
        suspended ||
        !ready ||
        !video.ended ||
        video.currentSrc !== video.src
      )
        return;
      const id = current.id,
        duration = video.duration,
        at = now();
      enqueue((state) => {
        core.saveProgress(state, id, duration, duration, at);
        const awarded = core.complete(state, id, at);
        return awarded;
      })
        .then(({ state, result }) => {
          status("已完成，学习记录已保存");
          if (result) onReward(state, id);
        })
        .catch(() => {});
    });
    video.addEventListener("error", () => {
      if (current && !suspended)
        status("视频未能播放，请检查编码或链接；本机视频可以重新关联后再试");
    });
    return {
      select,
      pause: async () => {
        await persist(true).catch(() => {});
        suspended = true;
        video.pause();
      },
      resume: () => {
        suspended = false;
      },
      flush: () => persist(true),
      current: () => current,
      lock: () => {
        locked = !locked;
        video.controls = !locked;
        return locked;
      },
      isLocked: () => locked,
      dispose: () => {
        suspended = true;
        current = null;
        release();
      },
    };
  },
);
