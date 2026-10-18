(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AppCore = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  // Append new atlases only: these positions are persisted in backups.
  const COVER_ATLASES = Object.freeze(
    [
      "illustration-atlas",
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
    ].map((name) => `./assets/images/covers/${name}.webp`),
  );
  const COVER_INDEXES = Object.freeze(
    Array.from({ length: COVER_ATLASES.length * 8 }, (_, i) => i),
  );
  const COVER_POOL_VERSION = 1;
  function coverAsset(index) {
    if (!COVER_INDEXES.includes(index)) return null;
    const cell = index % 8;
    return {
      path: COVER_ATLASES[Math.floor(index / 8)],
      column: cell % 4,
      row: Math.floor(cell / 4),
    };
  }
  function randomCover(random = Math.random) {
    return COVER_INDEXES[Math.floor(random() * COVER_INDEXES.length)];
  }
  function upgradeCoverPool(state, random = Math.random) {
    if (state.coverPoolVersion === COVER_POOL_VERSION) return false;
    for (const video of [...state.videos, ...state.drafts])
      video.coverIndex = randomCover(random);
    state.coverPoolVersion = COVER_POOL_VERSION;
    return true;
  }
  const HEROES = Object.freeze([
    "hero-01",
    "hero-02",
    "hero-03",
    "hero-04",
    "hero-05",
    "hero-06",
  ]);
  const MEDALS = Object.freeze(["star", "shield", "wings", "gem", "crown"]);
  const count = (text) =>
    typeof Intl.Segmenter === "function"
      ? [...new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(text)]
          .length
      : Array.from(text).length;
  const idOK = (id) =>
    typeof id === "string" &&
    /^[a-zA-Z0-9_-]{1,100}$/.test(id) &&
    !["__proto__", "constructor", "prototype"].includes(id);
  const number = (value, max = Number.MAX_SAFE_INTEGER) =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= max;
  function title(value, max = 30, empty = false) {
    const text = String(value ?? "").trim();
    if ((!text && !empty) || count(text) > max)
      throw Error(`请填写${empty ? "0" : "1"}–${max}个字符`);
    return text;
  }
  function courseFields(input, courses, id) {
    const tag = title(input.tag, 1),
      name = title(input.title, 6);
    if (!/^\p{Script=Han}$/u.test(tag) || !/^\p{Script=Han}{2,6}$/u.test(name))
      throw Error("标签为1个汉字，课程名称为2–6个汉字");
    if (courses.some((c) => c.id !== id && c.title === name))
      throw Error("该课程名称已存在");
    return { tag, title: name };
  }
  function defaults(date, sequence, random = Math.random) {
    const pad = (n) => String(n).padStart(2, "0");
    return {
      title: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${sequence}`,
      coverIndex: randomCover(random),
    };
  }
  function initial() {
    return {
      schemaVersion: 1,
      coverPoolVersion: COVER_POOL_VERSION,
      dailyTasks: null,
      revision: 0,
      courses: [
        ["english", "英", "趣味英语", "#159fea", "hero-04"],
        ["thinking", "思", "思维训练", "#ff746a", "hero-02"],
        ["pinyin", "语", "语文", "#ffb72e", "hero-03"],
        ["math", "数", "数学启蒙", "#9964ec", "hero-06"],
        ["reading", "阅", "趣味阅读", "#e967a2", "hero-05"],
      ].map(([id, tag, title, color, heroId]) => ({
        id,
        tag,
        title,
        color,
        heroId,
      })),
      videos: [],
      drafts: [],
      home: {
        todayMode: "auto",
        todayVideoIds: [],
        sections: [
          { id: "week", title: "本周任务", subtitle: "", videoIds: [] },
        ],
      },
      progress: {},
      receipts: {},
      settings: { profileName: "小小奥特曼" },
    };
  }
  function secureURL(value) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw Error("请填写完整的 HTTPS 视频链接");
    }
    if (url.protocol !== "https:" || url.username || url.password)
      throw Error("视频链接必须为不含账号密码的 HTTPS 地址");
    return url.href;
  }
  function source(input, draft = false) {
    if (!input || typeof input !== "object") throw Error("视频来源不正确");
    const kind = input.kind;
    if (kind === "url") return { kind, url: secureURL(input.url) };
    if (!["local", "playlist"].includes(kind)) throw Error("不支持的视频来源");
    if (
      typeof input.name !== "string" ||
      input.name.length > 1000 ||
      !number(input.size) ||
      !number(input.lastModified) ||
      !number(input.duration, 1e8)
    )
      throw Error("视频文件信息不正确");
    if (!/^[a-f0-9]{64}$/.test(input.sha256 || "") && !draft)
      throw Error("缺少视频内容指纹");
    const clean = {
      kind,
      name: input.name,
      size: input.size,
      type: String(input.type || "").slice(0, 200),
      lastModified: input.lastModified,
      duration: input.duration,
      sha256: input.sha256 || "",
    };
    if (kind === "playlist") {
      if (
        typeof input.body !== "string" ||
        input.body.length > 1024 * 1024 ||
        !input.body.startsWith("#EXTM3U")
      )
        throw Error("视频清单格式不正确");
      clean.body = input.body;
    }
    return clean;
  }
  function videoFields(input, state, draft = false) {
    if (!idOK(input.id)) throw Error("视频标识不正确");
    const name = title(input.title, 30, draft);
    if (!COVER_INDEXES.includes(input.coverIndex))
      throw Error("封面索引不正确");
    if (
      typeof input.courseId !== "string" ||
      (input.courseId && !idOK(input.courseId))
    )
      throw Error("课程标识不正确");
    if (!draft && !state.courses.some((c) => c.id === input.courseId))
      throw Error("请选择所属课程");
    return {
      id: input.id,
      title: name,
      coverIndex: input.coverIndex,
      courseId: input.courseId || "",
      source: source(input.source, draft),
      createdAt: number(input.createdAt) ? input.createdAt : Date.now(),
    };
  }
  function homeFields(input, videos) {
    if (!input || !Array.isArray(input.sections) || input.sections.length > 50)
      throw Error("首页栏目不正确");
    const known = new Set(videos.map((v) => v.id));
    const list = (ids) => {
      if (
        !Array.isArray(ids) ||
        ids.length > 5000 ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !known.has(id))
      )
        throw Error("首页视频引用不完整或重复");
      return [...ids];
    };
    const seen = new Set();
    const todayMode =
      input.todayMode ?? (input.todayVideoIds?.length ? "manual" : "auto");
    if (!["auto", "manual"].includes(todayMode))
      throw Error("今日任务安排方式不正确");
    return {
      todayMode,
      todayVideoIds: list(input.todayVideoIds),
      sections: input.sections.map((s) => {
        if (!idOK(s.id) || seen.has(s.id)) throw Error("栏目标识重复或不正确");
        seen.add(s.id);
        return {
          id: s.id,
          title: title(s.title, 12),
          subtitle: title(s.subtitle, 40, true),
          videoIds: list(s.videoIds),
        };
      }),
    };
  }
  function validate(input) {
    if (
      !input ||
      input.schemaVersion !== 1 ||
      !Array.isArray(input.courses) ||
      !Array.isArray(input.videos) ||
      !Array.isArray(input.drafts) ||
      !input.progress ||
      !input.receipts
    )
      throw Error("数据格式或版本不正确");
    if (
      input.courses.length > 200 ||
      input.videos.length > 10000 ||
      input.drafts.length > 1000
    )
      throw Error("数据条目过多");
    const state = initial();
    if (
      input.coverPoolVersion !== undefined &&
      ![0, COVER_POOL_VERSION].includes(input.coverPoolVersion)
    )
      throw Error("封面素材版本不正确");
    // Legacy snapshots remain marked until the store migrates them atomically.
    state.coverPoolVersion = input.coverPoolVersion ?? 0;
    state.revision =
      Number.isSafeInteger(input.revision) && input.revision >= 0
        ? input.revision
        : 0;
    const ids = new Set();
    state.courses = input.courses.map((c) => {
      if (
        !idOK(c.id) ||
        ids.has(c.id) ||
        !HEROES.includes(c.heroId) ||
        !/^#[a-fA-F0-9]{6}$/.test(c.color || "")
      )
        throw Error("课程数据不正确");
      ids.add(c.id);
      return {
        id: c.id,
        ...courseFields(c, [], c.id),
        heroId: c.heroId,
        color: c.color,
      };
    });
    if (
      new Set(state.courses.map((c) => c.title)).size !== state.courses.length
    )
      throw Error("课程名称重复");
    ids.clear();
    const hashes = new Set();
    state.videos = input.videos.map((v) => {
      if (ids.has(v.id)) throw Error("视频标识重复");
      ids.add(v.id);
      const item = videoFields(v, state);
      const identity = contentIdentity(item.source);
      if (hashes.has(identity)) throw Error("视频来源重复");
      hashes.add(identity);
      return item;
    });
    state.drafts = input.drafts.map((v) => {
      if (ids.has(v.id)) throw Error("草稿标识重复");
      ids.add(v.id);
      return videoFields(v, state, true);
    });
    state.home = homeFields(input.home, state.videos);
    state.progress = {};
    state.receipts = {};
    for (const [id, p] of Object.entries(input.progress)) {
      if (
        !state.videos.some((v) => v.id === id) ||
        !number(p.position, 1e8) ||
        !number(p.duration, 1e8) ||
        !number(p.updatedAt)
      )
        throw Error("播放进度不正确");
      state.progress[id] = {
        position: p.position,
        duration: p.duration,
        updatedAt: p.updatedAt,
      };
    }
    for (const [id, r] of Object.entries(input.receipts)) {
      if (
        !state.videos.some((v) => v.id === id) ||
        !state.courses.some((c) => c.id === r.courseId) ||
        !number(r.completedAt)
      )
        throw Error("完成凭证不正确");
      state.receipts[id] = {
        videoId: id,
        courseId: r.courseId,
        completedAt: r.completedAt,
      };
    }
    if (input.dailyTasks != null) {
      const daily = input.dailyTasks;
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(daily.date || "") ||
        !Array.isArray(daily.videoIds) ||
        daily.videoIds.length > 200 ||
        new Set(daily.videoIds).size !== daily.videoIds.length ||
        daily.videoIds.some((id) => !idOK(id))
      )
        throw Error("今日任务记录不正确");
      state.dailyTasks = {
        date: daily.date,
        videoIds: daily.videoIds.filter((id) =>
          state.videos.some((v) => v.id === id),
        ),
      };
    }
    state.settings = {
      profileName: title(input.settings?.profileName || "小小奥特曼", 20),
    };
    return state;
  }
  function contentIdentity(s) {
    return s.kind === "url" ? s.url : s.sha256;
  }
  function commitImports(state, items) {
    if (!items.length) throw Error("请先选择视频");
    const known = new Set(state.videos.map((v) => contentIdentity(v.source)));
    const added = [];
    for (const raw of items) {
      const item = videoFields(raw, state);
      if (state.videos.some((v) => v.id === item.id)) continue;
      const key = contentIdentity(item.source);
      if (known.has(key))
        throw Error(`「${item.title}」已在视频库中，请使用重新关联`);
      known.add(key);
      state.videos.push(item);
      added.push(item.id);
    }
    state.drafts = state.drafts.filter((v) => !added.includes(v.id));
    return added;
  }
  function mutate(state, action, payload) {
    if (action === "course") {
      const fields = courseFields(payload, state.courses, payload.id);
      if (payload.id) {
        const c = state.courses.find((c) => c.id === payload.id);
        if (!c) throw Error("课程不存在");
        Object.assign(c, fields);
      } else {
        if (!idOK(payload.newId) || !HEROES.includes(payload.heroId))
          throw Error("课程标识不正确");
        state.courses.push({
          id: payload.newId,
          ...fields,
          heroId: payload.heroId,
          color: "#12b67b",
        });
      }
    } else if (action === "title") {
      const v = state.videos.find((v) => v.id === payload.id);
      if (!v) throw Error("视频不存在");
      v.title = title(payload.title);
    } else if (action === "move") {
      if (!state.courses.some((c) => c.id === payload.courseId))
        throw Error("课程不存在");
      const v = state.videos.find((v) => v.id === payload.id);
      if (!v) throw Error("视频不存在");
      v.courseId = payload.courseId;
      state.videos = state.videos.filter((x) => x.id !== v.id).concat(v);
    } else if (action === "order") {
      const items = state.videos.filter((v) => v.courseId === payload.courseId);
      if (
        !Array.isArray(payload.ids) ||
        payload.ids.length !== items.length ||
        new Set(payload.ids).size !== items.length ||
        payload.ids.some((id) => !items.some((v) => v.id === id))
      )
        throw Error("排序列表不完整");
      let i = 0;
      const ordered = payload.ids.map((id) => items.find((v) => v.id === id));
      state.videos = state.videos.map((v) =>
        v.courseId === payload.courseId ? ordered[i++] : v,
      );
    } else throw Error("不支持的操作");
    return state;
  }
  function saveProgress(state, id, position, duration, at = Date.now()) {
    if (
      !state.videos.some((v) => v.id === id) ||
      !number(position, 1e8) ||
      !number(duration, 1e8) ||
      !number(at)
    )
      throw Error("播放进度不正确");
    const old = state.progress[id];
    if (old && old.updatedAt > at) return;
    state.progress[id] = {
      position: Math.min(position, duration || position),
      duration,
      updatedAt: at,
    };
  }
  function complete(state, id, at = Date.now()) {
    const v = state.videos.find((v) => v.id === id);
    if (!v || state.receipts[id]) return false;
    state.receipts[id] = { videoId: id, courseId: v.courseId, completedAt: at };
    return true;
  }
  function courseStartVideo(state, courseId) {
    const videos = state.videos.filter((video) => video.courseId === courseId);
    return (
      videos.find((video) => !state.receipts[video.id]) || videos[0] || null
    );
  }
  const localDay = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  // Persist only the day's selection; progress and rewards remain authoritative.
  function automaticTodayIds(state, date = new Date()) {
    const retained =
      state.dailyTasks?.date === localDay(date)
        ? state.dailyTasks.videoIds
        : [];
    const byId = new Map(state.videos.map((video) => [video.id, video]));
    const selected = new Map();
    for (const id of retained) {
      const video = byId.get(id);
      if (video && !selected.has(video.courseId))
        selected.set(video.courseId, video.id);
    }
    for (const video of state.videos) {
      if (
        !selected.has(video.courseId) &&
        !state.receipts[video.id] &&
        !(state.progress[video.id]?.position > 0)
      )
        selected.set(video.courseId, video.id);
    }
    return state.courses.flatMap((course) => {
      const id = selected.get(course.id);
      return id ? [id] : [];
    });
  }

  function syncTodayTasks(state, date = new Date()) {
    const next = {
      date: localDay(date),
      videoIds: automaticTodayIds(state, date),
    };
    if (JSON.stringify(state.dailyTasks) === JSON.stringify(next)) return false;
    state.dailyTasks = next;
    return true;
  }
  function todayVideoIds(state, home = state.home, date = new Date()) {
    if (
      (home.todayMode ?? (home.todayVideoIds.length ? "manual" : "auto")) ===
      "manual"
    )
      return [...home.todayVideoIds];
    return automaticTodayIds(state, date);
  }
  // Read-only projection of the authoritative snapshot, never a reward write.
  function courseHistory(state, courseId) {
    const time = (value) =>
      Number.isFinite(value) && value > 0 && value <= 8640000000000000
        ? value
        : null;
    return state.videos
      .filter((video) => video.courseId === courseId)
      .flatMap((video) => {
        const progress = state.progress[video.id],
          receipt = state.receipts[video.id];
        const position =
          Number.isFinite(progress?.position) && progress.position > 0
            ? progress.position
            : null;
        if (!receipt && position === null) return [];
        const watchedAt =
          Math.max(
            time(position === null ? null : progress?.updatedAt) || 0,
            time(receipt?.completedAt) || 0,
          ) || null;
        const duration =
          [progress?.duration, video.source?.duration].find(
            (value) => Number.isFinite(value) && value > 0,
          ) || null;
        const available =
          video.source?.kind === "local" ||
          video.source?.kind === "playlist" ||
          (video.source?.kind === "url" &&
            /^https:\/\//.test(video.source.url || ""));
        return [
          {
            video,
            watchedAt,
            position:
              position === null
                ? null
                : Math.min(position, duration || position),
            duration,
            done: !!receipt,
            available,
          },
        ];
      })
      .sort(
        (a, b) =>
          (b.watchedAt || 0) - (a.watchedAt || 0) ||
          a.video.id.localeCompare(b.video.id),
      );
  }
  function reward(state, courseId) {
    const total = Object.values(state.receipts).filter(
      (r) => r.courseId === courseId,
    ).length;
    const medalCount = Math.min(5, Math.max(0, Math.floor(total / 5) - 1));
    return {
      total,
      heroUnlocked: total >= 5,
      medalCount,
      stars: total >= 30 ? 5 : total % 5,
      allCollected: total >= 30,
    };
  }
  function planMatches(videos, files) {
    return files.map((file, index) => {
      const s = file.source;
      let candidates = videos.filter(
        (v) =>
          v.source.kind === s.kind && s.sha256 && v.source.sha256 === s.sha256,
      );
      if (candidates.length === 1)
        return {
          index,
          status: "matched",
          videoId: candidates[0].id,
          candidates: candidates.map((v) => v.id),
        };
      if (!candidates.length)
        candidates = videos.filter(
          (v) =>
            v.source.kind === "local" &&
            s.kind === "local" &&
            (v.source.size === s.size || v.source.name === s.name),
        );
      return {
        index,
        status: candidates.length ? "confirm" : "unmatched",
        videoId: "",
        candidates: candidates.map((v) => v.id),
      };
    });
  }
  function backup(state, kind = "all") {
    const clean = validate(state);
    if (!["all", "learning", "configuration"].includes(kind))
      throw Error("导出类型不正确");
    const data = { ...clean, drafts: [] };
    if (kind === "configuration") {
      data.progress = {};
      data.receipts = {};
    }
    return {
      format: "pwatest-backup",
      schemaVersion: 1,
      kind,
      exportedAt: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      includesMedia: false,
      data,
    };
  }
  function parseBackup(value) {
    if (
      !value ||
      value.format !== "pwatest-backup" ||
      value.schemaVersion !== 1 ||
      value.includesMedia !== false ||
      !["all", "learning", "configuration"].includes(value.kind)
    )
      throw Error("不是受支持的学习岛备份");
    return validate(value.data);
  }
  function csv(state) {
    const cell = (value) => {
      let s = String(value ?? "");
      if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const rows = [
      [
        "课程",
        "视频标题",
        "视频ID",
        "播放位置（秒）",
        "时长（秒）",
        "完成时间",
        "最近学习时间",
      ],
    ];
    for (const v of state.videos) {
      const p = state.progress[v.id],
        r = state.receipts[v.id];
      rows.push([
        state.courses.find((c) => c.id === v.courseId)?.title,
        v.title,
        v.id,
        p?.position || 0,
        p?.duration || v.source.duration || 0,
        r ? new Date(r.completedAt).toISOString() : "",
        p ? new Date(p.updatedAt).toISOString() : "",
      ]);
    }
    return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
  }
  function reorder(items, from, to) {
    const next = [...items];
    if (from >= 0 && to >= 0 && from < items.length && to < items.length)
      next.splice(to, 0, next.splice(from, 1)[0]);
    return next;
  }
  return {
    COVER_INDEXES,
    COVER_ATLASES,
    COVER_POOL_VERSION,
    coverAsset,
    randomCover,
    upgradeCoverPool,
    HEROES,
    MEDALS,
    count,
    title,
    courseFields,
    defaults,
    initial,
    validate,
    source,
    homeFields,
    videoFields,
    secureURL,
    contentIdentity,
    commitImports,
    mutate,
    saveProgress,
    complete,
    courseStartVideo,
    todayVideoIds,
    syncTodayTasks,
    courseHistory,
    reward,
    planMatches,
    backup,
    parseBackup,
    csv,
    reorder,
  };
});
