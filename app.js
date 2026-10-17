(async () => {
  "use strict";
  const C = AppCore,
    V = AppViews,
    H = AppHistory,
    S = AppStore,
    M = AppMedia,
    $ = (s) => document.querySelector(s),
    $$ = (s) => [...document.querySelectorAll(s)];
  const view = $("#app-view"),
    watch = $("#watch-view"),
    dialog = $("#dialog");
  let state,
    drafts = [],
    errors = {},
    active = "english",
    search = "",
    route = "",
    homeDraft = null,
    homeRevision = 0,
    dirty = false,
    unlocked = false,
    lastFocus = null,
    operation = null,
    pending = Promise.resolve(),
    pendingWrites = 0,
    writeFailed = false,
    pendingPlay = null;
  const routeScroll = new Map();
  const historyFilters = new Map(),
    historyOrigins = new Map();
  let historyStatus = "ready",
    historyError = "",
    historyTicket = 0,
    watchReturn = null,
    playRequest = null;
  async function loadHistory(target = route) {
    const ticket = ++historyTicket;
    historyStatus = "loading";
    historyError = "";
    render();
    try {
      const fresh = await S.read();
      if (route !== target || ticket !== historyTicket) return;
      state = fresh;
      drafts = structuredClone(fresh.drafts);
      historyStatus = "ready";
    } catch (error) {
      if (route !== target || ticket !== historyTicket) return;
      historyStatus = "error";
      historyError = error.message;
    }
    render();
    window.scrollTo(0, routeScroll.get(target) || 0);
  }
  function toast(text) {
    $("#toast").textContent = text;
    $("#toast").hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => ($("#toast").hidden = true), 5000);
  }
  function message(text) {
    const el = $("#activity-text");
    if (el) el.textContent = text;
  }
  const activity = document.createElement("div");
  activity.id = "activity";
  activity.className = "activity";
  activity.hidden = true;
  activity.innerHTML =
    '<span id="activity-text" role="status"></span>' +
    V.AppButton({
      label: "取消",
      variant: "secondary",
      attrs: { id: "cancel-work" },
    });
  document.body.append(activity);
  $("#cancel-work").onclick = () => operation?.abort();
  async function work(label, run) {
    if (operation) {
      toast("正在处理文件，请稍候或取消");
      return;
    }
    const control = new AbortController();
    operation = control;
    activity.hidden = false;
    message(label);
    try {
      return await run(control.signal);
    } catch (e) {
      if (e.name === "AbortError" || control.signal.aborted)
        toast("已取消；已经完成的项目会保留");
      else toast(e.message || "操作失败");
    } finally {
      operation = null;
      activity.hidden = true;
      render();
    }
  }
  function write(edit, expected) {
    pendingWrites++;
    pending = pending
      .catch(() => {})
      .then(() => S.update(edit, expected))
      .then((result) => {
        state = result.state;
        writeFailed = false;
        return result;
      })
      .catch((e) => {
        writeFailed = true;
        toast("保存失败：" + e.message);
        throw e;
      })
      .finally(() => pendingWrites--);
    pending.catch(() => {});
    return pending;
  }
  function saveDrafts() {
    const snapshot = structuredClone(drafts);
    return write((s) => {
      s.drafts = snapshot.filter((d) => !s.videos.some((v) => v.id === d.id));
    });
  }
  function close() {
    if (dialog.querySelector(".match-list")) {
      relinkFiles = [];
      relinkRows = [];
    }
    dialog.close();
  }
  function modal(title, body, actions = []) {
    if (dialog.open) dialog.close();
    lastFocus = document.activeElement;
    dialog.innerHTML = `<div class="dialog-title"><h2 id="modal-title">${V.esc(title)}</h2><button id="close-modal" aria-label="关闭">${V.icon("close")}</button></div><div class="dialog-fields">${body}<p class="error" id="modal-error" role="alert"></p></div><div class="dialog-actions"></div>`;
    $("#close-modal").onclick = close;
    for (const action of actions) {
      const button = V.createButton({
        label: action.text,
        variant: action.variant || (action.primary ? "primary" : "secondary"),
        leadingIcon: action.primary ? "check" : undefined,
      });
      button.onclick = async () => {
        if (!V.setButtonLoading(button, true)) return;
        try {
          await action.run();
        } catch (e) {
          $("#modal-error").textContent = e.message;
        } finally {
          if (button.isConnected) V.setButtonLoading(button, false);
        }
      };
      $(".dialog-actions").append(button);
    }
    dialog.showModal();
  }
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener(
    "close",
    () => lastFocus?.isConnected && lastFocus.focus(),
  );
  function parentAccess(target, callback) {
    if (unlocked) {
      if (callback) callback();
      else go(target);
      return;
    }
    const a = 5 + Math.floor(Math.random() * 5),
      b = 4 + Math.floor(Math.random() * 6);
    modal(
      "家长验证",
      `<p>请家长完成计算后进入定制</p><label>${a} + ${b} =<input id="parent-answer" inputmode="numeric" autocomplete="off" aria-label="计算结果"></label>`,
      [
        { text: "取消", run: close },
        {
          text: "进入家长模式",
          primary: true,
          run: () => {
            if (Number($("#parent-answer").value) !== a + b)
              throw Error("答案不正确，请再试一次");
            unlocked = true;
            close();
            if (callback) callback();
            else go(target);
          },
        },
      ],
    );
    $("#parent-answer").focus();
  }
  const isParent = (r) =>
    ["courses", "import", "configure", "data"].includes(r.split("/")[0]);
  async function go(next) {
    if (operation) {
      toast("请先完成或取消当前操作");
      return;
    }
    if (dirty && next !== "configure") {
      modal(
        "还有未保存的首页配置",
        "<p>请选择保存后离开，或放弃本次修改。</p>",
        [
          { text: "继续编辑", run: close },
          {
            text: "放弃修改",
            run: () => {
              dirty = false;
              homeDraft = null;
              close();
              go(next);
            },
          },
          {
            text: "保存后离开",
            primary: true,
            run: async () => {
              await saveHome();
              close();
              go(next);
            },
          },
        ],
      );
      return;
    }
    if (isParent(next) && !unlocked) {
      parentAccess(next);
      return;
    }
    try {
      await pending;
    } catch {
      toast("请先重试保存本页修改");
      return;
    }
    if (writeFailed) return;
    if (location.hash === "#/" + next) await show(next);
    else location.hash = "/" + next;
  }
  async function show(next, alreadyRead = false) {
    if (!state) return;
    if (isParent(next) && !unlocked) {
      history.replaceState(null, "", "#/" + (route || "home"));
      parentAccess(next);
      return;
    }
    if (route) routeScroll.set(route, scrollY);
    if (route.startsWith("watch/") && route !== next) await player.pause();
    // Parent pages share authorization; returning to a child page locks it again.
    if (!isParent(next) && (isParent(route) || next === "home"))
      unlocked = false;
    if (dialog.open) close();
    if (
      next.startsWith("history/") &&
      route !== next &&
      !route.startsWith("watch/")
    )
      historyOrigins.set(next, route || "content");
    if (next.startsWith("watch/") && !route.startsWith("watch/"))
      watchReturn = route.startsWith("history/") ? route : null;
    if (!next.startsWith("watch/")) playRequest = null;
    route = next;
    document.documentElement?.classList?.toggle(
      "history-context",
      next.startsWith("history/"),
    );
    view.hidden = next.startsWith("watch/");
    watch.hidden = !view.hidden;
    if (next === "configure" && !dirty) {
      homeDraft = structuredClone(state.home);
      homeRevision = state.revision;
    }
    if (next.startsWith("history/") && !alreadyRead) {
      await loadHistory(next);
      return;
    }
    if (next.startsWith("history/")) historyStatus = "ready";
    render();
    window.scrollTo(0, routeScroll.get(next) || 0);
    if (next.startsWith("watch/")) await launch(next.split("/")[1]);
  }
  window.addEventListener("hashchange", () => {
    const next = location.hash.slice(2) || "home";
    if (operation || (dirty && next !== "configure")) {
      history.replaceState(null, "", "#/" + route);
      go(next);
      return;
    }
    show(next).catch((e) => toast(e.message));
  });
  function render() {
    if (!state && !route.startsWith("history/")) return;
    document.title =
      ({
        home: "学习首页",
        content: "内容中心",
        course: "课程学习",
        courses: "课程与视频",
        import: "导入视频",
        configure: "首页配置",
        data: "数据与备份",
        history: "学习记录",
      }[route.split("/")[0]] || "视频播放") + " · 小小学习岛";
    if (route.startsWith("watch/")) return;
    const display = { ...state, drafts };
    if (route.startsWith("history/"))
      view.innerHTML = H.page(state, route.split("/")[1], {
        filter: historyFilters.get(route) || "all",
        status: historyStatus,
        error: historyError,
        backRoute: historyOrigins.get(route) || "content",
      });
    else if (route === "home") view.innerHTML = V.home(state);
    else if (route === "content") view.innerHTML = V.content(state);
    else if (route.startsWith("course/"))
      view.innerHTML = V.course(state, route.split("/")[1], M);
    else if (route === "courses") {
      active = state.courses.some((c) => c.id === active)
        ? active
        : state.courses[0]?.id;
      view.innerHTML = V.manager(state, active, search, M);
    } else if (route === "import")
      view.innerHTML = V.imports(display, errors, M);
    else if (route === "configure")
      view.innerHTML = V.configure(state, homeDraft, dirty);
    else if (route === "data") view.innerHTML = V.data(state);
    else {
      view.innerHTML =
        '<p class="boot-message">页面不存在。<a href="#/home">返回首页</a></p>';
    }
    if (route === "courses") setupDrag();
  }
  function randomHero() {
    const bytes = new Uint8Array(1);
    do {
      crypto.getRandomValues(bytes);
    } while (bytes[0] >= 252);
    return C.HEROES[bytes[0] % 6];
  }
  function courseDialog(id, draftId) {
    const c = state.courses.find((c) => c.id === id) || { tag: "", title: "" };
    modal(
      id ? "编辑课程" : "新建课程",
      `<label>标签<input id="course-tag" value="${V.esc(c.tag)}" placeholder="1个汉字"></label><label>课程名称<input id="course-title" value="${V.esc(c.title)}" placeholder="2–6个汉字"></label>`,
      [
        { text: "取消", run: close },
        {
          text: "保存",
          primary: true,
          run: async () => {
            const fields = C.courseFields(
                {
                  tag: $("#course-tag").value,
                  title: $("#course-title").value,
                },
                state.courses,
                id,
              ),
              newId = crypto.randomUUID();
            await write((s) =>
              C.mutate(s, "course", {
                ...fields,
                id,
                newId,
                heroId: randomHero(),
              }),
            );
            if (draftId) {
              drafts.find((d) => d.id === draftId).courseId = id || newId;
              await saveDrafts();
            } else active = id || newId;
            close();
            render();
          },
        },
      ],
    );
  }
  function titleDialog(id) {
    const item = state.videos.find((v) => v.id === id);
    modal(
      "修改视频标题",
      `<label>视频标题<input id="new-title" value="${V.esc(item.title)}"></label>`,
      [
        { text: "取消", run: close },
        {
          text: "保存",
          primary: true,
          run: async () => {
            const title = C.title($("#new-title").value);
            await write((s) => C.mutate(s, "title", { id, title }));
            close();
            render();
          },
        },
      ],
    );
  }
  function moveDialog(id) {
    const item = state.videos.find((v) => v.id === id);
    modal(
      "更换所属课程",
      `<label>所属课程<select id="target-course">${V.options(state, item.courseId)}</select></label><p>保持视频标识、封面与学习记录，移动到目标课程末尾。</p>`,
      [
        { text: "取消", run: close },
        {
          text: "确认更换",
          primary: true,
          run: async () => {
            const courseId = $("#target-course").value;
            await write((s) => C.mutate(s, "move", { id, courseId }));
            close();
            render();
          },
        },
      ],
    );
  }
  async function orderVideo(id, delta, targetIndex) {
    const ids = state.videos
        .filter((v) => v.courseId === active)
        .map((v) => v.id),
      from = ids.indexOf(id),
      to = targetIndex ?? from + delta;
    if (to < 0 || to >= ids.length) return;
    await write((s) =>
      C.mutate(s, "order", { courseId: active, ids: C.reorder(ids, from, to) }),
    );
    render();
  }
  function setupDrag() {
    for (const handle of $$("[data-grip]")) {
      let start = null,
        to = -1,
        moved = false;
      handle.onpointerdown = (e) => {
        if (handle.disabled) return;
        start = { x: e.clientX, y: e.clientY };
        handle.setPointerCapture(e.pointerId);
      };
      handle.onpointermove = (e) => {
        if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) < 8)
          return;
        moved = true;
        const rows = $$("#video-list [data-video-id]");
        let best = Infinity;
        rows.forEach((row, i) => {
          const r = row.getBoundingClientRect(),
            d = Math.abs(e.clientY - (r.top + r.height / 2));
          if (d < best) {
            best = d;
            to = i;
          }
          row.classList.remove("drop-target");
        });
        rows[to]?.classList.add("drop-target");
        if (e.clientY > innerHeight - 70) scrollBy(0, 12);
        else if (e.clientY < 80) scrollBy(0, -12);
      };
      handle.onpointerup = () => {
        start = null;
        $$(".drop-target").forEach((e) => e.classList.remove("drop-target"));
        if (moved && to >= 0)
          orderVideo(handle.dataset.grip, 0, to).catch((e) => toast(e.message));
        moved = false;
      };
      handle.onpointercancel = () => {
        start = null;
        moved = false;
        $$(".drop-target").forEach((e) => e.classList.remove("drop-target"));
      };
    }
  }
  async function addFiles(files) {
    if (!files.length) return;
    await work("正在读取视频…", async (signal) => {
      const batch = new Date();
      for (const [i, file] of files.entries()) {
        signal.throwIfAborted();
        const item = {
          id: crypto.randomUUID(),
          ...C.defaults(batch, i + 1),
          courseId: active || "",
          createdAt: Date.now(),
          source: {
            kind: "local",
            name: file.name,
            size: file.size,
            type: file.type || "",
            lastModified: file.lastModified || 0,
            duration: 0,
            sha256: "",
          },
        };
        drafts.push(item);
        M.attach(item.id, file);
        render();
        try {
          if (/\.m3u8$/i.test(file.name)) {
            if (file.size > HlsImportCore.MAX_BYTES)
              throw Error("M3U8 清单最多 1 MB");
            const parsed = HlsImportCore.normalize(await file.text());
            item.source = {
              ...item.source,
              kind: "playlist",
              body: parsed.body,
              duration: parsed.duration,
              sha256: await M.fingerprint(file, undefined, signal),
            };
            M.remove(item.id);
          } else
            item.source = await M.inspect(
              file,
              (p) =>
                message(
                  `正在读取 ${i + 1} / ${files.length} · ${Math.round(p * 100)}%`,
                ),
              signal,
            );
          if (
            state.videos.some(
              (v) =>
                C.contentIdentity(v.source) === C.contentIdentity(item.source),
            )
          )
            errors[item.id] = "此视频已在课程库中，请移除此条并使用重新关联";
          else delete errors[item.id];
        } catch (e) {
          errors[item.id] = signal.aborted
            ? "文件处理已取消，请移除后重新选择"
            : e.message;
          if (signal.aborted) throw e;
        } finally {
          await saveDrafts();
          render();
        }
      }
      toast(`已选择 ${files.length} 个文件，请确认标题与课程`);
    });
  }
  $("#pick-import").onchange = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    addFiles(files);
  };
  $("#pick-playlist").onchange = $("#pick-import").onchange;
  function importURL() {
    modal(
      "从链接导入",
      `<label>HTTPS 视频地址<input id="url-source" type="url" placeholder="https://…/video.mp4 或 playlist.m3u8"></label><label>视频标题<input id="url-title" value="${V.esc(C.defaults(new Date(), 1).title)}"></label><label>所属课程<select id="url-course">${V.options(state, active)}</select></label><p>链接视频需要源站可访问，M3U8 使用浏览器原生播放。</p>`,
      [
        { text: "取消", run: close },
        {
          text: "加入待导入列表",
          primary: true,
          run: async () => {
            const source = {
                kind: "url",
                url: C.secureURL($("#url-source").value),
              },
              title = C.title($("#url-title").value),
              courseId = $("#url-course").value;
            drafts.push({
              id: crypto.randomUUID(),
              ...C.defaults(new Date(), 1),
              title,
              courseId,
              source,
              createdAt: Date.now(),
            });
            await saveDrafts();
            close();
            render();
          },
        },
      ],
    );
  }
  async function importDrafts() {
    if (operation) return;
    await pending.catch(() => {});
    const valid = [],
      known = new Set(state.videos.map((v) => C.contentIdentity(v.source)));
    errors = {};
    for (const q of drafts) {
      try {
        const item = C.videoFields(q, state);
        if (item.source.kind === "local" && !M.has(item.id))
          throw Error("请先重新关联原视频");
        const key = C.contentIdentity(item.source);
        if (known.has(key)) throw Error("重复视频，请使用重新关联");
        known.add(key);
        valid.push(item);
      } catch (e) {
        errors[q.id] = e.message;
      }
    }
    if (!valid.length) {
      render();
      toast("请检查每条视频的提示");
      return;
    }
    try {
      await write((s) => C.commitImports(s, valid));
      const ids = new Set(valid.map((v) => v.id));
      drafts = drafts.filter((v) => !ids.has(v.id));
      active = valid[0].courseId;
      toast(`已导入 ${valid.length} 个视频`);
      if (drafts.length) render();
      else await go("courses");
    } catch (e) {
      toast(e.message);
    }
  }
  let relinkFiles = [],
    relinkRows = [];
  async function prepareRelink(files) {
    if (!files.length) return;
    await work("正在匹配本机视频…", async (signal) => {
      relinkFiles = [];
      for (const [i, file] of files.entries()) {
        signal.throwIfAborted();
        try {
          const source = await M.inspect(
            file,
            (p) =>
              message(
                `正在匹配 ${i + 1} / ${files.length} · ${Math.round(p * 100)}%`,
              ),
            signal,
          );
          relinkFiles.push({ file, source });
        } catch (e) {
          if (signal.aborted) throw e;
          relinkFiles.push({
            file,
            error: e.message,
            source: {
              kind: "local",
              name: file.name,
              size: file.size,
              sha256: "",
            },
          });
        }
      }
      const records = [...state.videos, ...drafts];
      relinkRows = C.planMatches(records, relinkFiles);
      showRelink();
    });
  }
  function showRelink() {
    const records = [...state.videos, ...drafts];
    modal(
      "确认重新关联",
      `<p>只恢复文件访问；保留原标题、所属课程、封面和学习进度。</p><div class="match-list">${relinkRows
        .map((row) => {
          const entry = relinkFiles[row.index];
          return `<label class="match-item"><strong>${V.esc(entry.file.name)}</strong><span>${V.esc(entry.error || { matched: "匹配成功", confirm: "需要确认", unmatched: "未找到对应记录" }[row.status])}</span>${
            entry.error
              ? ""
              : `<select data-match="${row.index}" aria-label="${V.esc(entry.file.name)}对应记录"><option value="">跳过</option>${records
                  .filter((v) => v.source.kind === "local")
                  .map(
                    (v) =>
                      `<option value="${v.id}" ${row.status === "matched" && row.videoId === v.id ? "selected" : ""}>${V.esc(v.title)} · ${V.esc(state.courses.find((c) => c.id === v.courseId)?.title || "未选课程")}</option>`,
                  )
                  .join("")}</select>`
          }</label>`;
        })
        .join(
          "",
        )}</div><p class="muted">无法自动识别的文件可手选对应记录。没有对应记录的文件默认跳过，导入新视频请使用“导入视频”。</p>`,
      [
        {
          text: "取消",
          run: () => {
            relinkFiles = [];
            relinkRows = [];
            close();
          },
        },
        {
          text: "确认关联",
          primary: true,
          run: async () => {
            const chosen = $$("[data-match]")
              .map((el) => ({
                id: el.value,
                entry: relinkFiles[Number(el.dataset.match)],
              }))
              .filter((x) => x.id);
            if (!chosen.length) throw Error("请至少选择一个对应记录");
            if (new Set(chosen.map((x) => x.id)).size !== chosen.length)
              throw Error("同一条记录不能关联多个文件");
            for (const { id } of chosen) {
              if (!records.some((v) => v.id === id))
                throw Error("视频记录已改变，请重新匹配");
            }
            await write((s) => {
              for (const { id, entry } of chosen) {
                const item =
                  s.videos.find((v) => v.id === id) ||
                  s.drafts.find((v) => v.id === id);
                if (!item) throw Error("视频记录不存在");
                const duplicate = s.videos.find(
                  (v) =>
                    v.id !== id &&
                    v.source.kind === "local" &&
                    v.source.sha256 === entry.source.sha256,
                );
                if (duplicate)
                  throw Error("所选文件已属于其他视频：" + duplicate.title);
                item.source = entry.source;
              }
            });
            for (const { id, entry } of chosen) {
              if (player.current()?.id === id) player.dispose();
              M.attach(id, entry.file);
              const draft = drafts.find((v) => v.id === id);
              if (draft) draft.source = entry.source;
              delete errors[id];
            }
            close();
            relinkFiles = [];
            relinkRows = [];
            toast(`已关联 ${chosen.length} 个视频`);
            render();
            if (pendingPlay) {
              const id = pendingPlay;
              pendingPlay = null;
              if (M.has(id)) go("watch/" + id);
            }
          },
        },
      ],
    );
  }
  $("#pick-relink").onchange = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    prepareRelink(files);
  };
  function pickRelink(id) {
    pendingPlay = id || null;
    parentAccess(null, () => $("#pick-relink").click());
  }
  function idsFor(key) {
    return key === "today"
      ? homeDraft.todayVideoIds
      : homeDraft.sections.find((s) => s.id === key).videoIds;
  }
  function setConfigIds(key, ids) {
    if (key === "today") homeDraft.todayVideoIds = ids;
    else homeDraft.sections.find((s) => s.id === key).videoIds = ids;
    dirty = true;
    render();
  }
  function configPicker(key) {
    const current = idsFor(key),
      selected = new Set();
    modal(
      "选择首页视频",
      `<div class="picker-filters"><input id="picker-search" type="search" placeholder="搜索视频标题"><select id="picker-course" aria-label="筛选课程">${V.options(state, "", true)}</select></div><div id="picker-list"></div>`,
      [
        { text: "取消", run: close },
        {
          text: "添加所选视频",
          primary: true,
          run: () => {
            setConfigIds(key, [...current, ...selected]);
            close();
          },
        },
      ],
    );
    const draw = () => {
      const query = $("#picker-search").value.toLowerCase(),
        course = $("#picker-course").value;
      $("#picker-list").innerHTML =
        state.videos
          .filter(
            (v) =>
              (!course || v.courseId === course) &&
              v.title.toLowerCase().includes(query),
          )
          .map(
            (v) =>
              `<label class="picker-item"><input type="checkbox" data-picker-video="${v.id}" ${current.includes(v.id) ? "checked disabled" : selected.has(v.id) ? "checked" : ""}><span>${V.esc(v.title)} · ${V.esc(state.courses.find((c) => c.id === v.courseId)?.title)}</span></label>`,
          )
          .join("") || '<p class="empty">没有可添加的视频，请先导入</p>';
      $$("[data-picker-video]").forEach(
        (el) =>
          (el.onchange = () =>
            el.checked
              ? selected.add(el.dataset.pickerVideo)
              : selected.delete(el.dataset.pickerVideo)),
      );
    };
    $("#picker-search").oninput = draw;
    $("#picker-course").onchange = draw;
    draw();
  }
  async function saveHome() {
    const home = C.homeFields(homeDraft, state.videos);
    await write((s) => {
      s.home = home;
    }, homeRevision);
    homeDraft = structuredClone(home);
    homeRevision = state.revision;
    dirty = false;
    toast("首页配置已保存");
    render();
  }
  function download(name, body, type) {
    const url = URL.createObjectURL(new Blob([body], { type })),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  async function exportData(kind) {
    await pending;
    await player.flush().catch(() => {});
    state = await S.read();
    const date = new Date().toISOString().replace(/[:.]/g, "-");
    if (kind === "csv")
      download(`学习情况-${date}.csv`, C.csv(state), "text/csv;charset=utf-8");
    else
      download(
        `学习岛-${kind}-${date}.json`,
        JSON.stringify(C.backup(state, kind), null, 2),
        "application/json",
      );
    toast("已生成导出文件，请在下载或“文件”中查看");
  }
  $("#pick-backup").onchange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      if (file.size > 30 * 1024 * 1024) throw Error("备份文件最多 30 MB");
      const wrapper = JSON.parse(await file.text()),
        restored = C.parseBackup(wrapper);
      modal(
        "确认恢复数据",
        `<p>文件包含 ${restored.courses.length} 门课程、${restored.videos.length} 个视频、${Object.keys(restored.receipts).length} 个完成记录。</p><p>将替换当前学习岛数据，不含视频文件，恢复后需要重新关联本机视频。</p>`,
        [
          { text: "取消", run: close },
          {
            text: "确认恢复",
            primary: true,
            run: async () => {
              await player.pause();
              await pending;
              const result = await S.replace(restored, state.revision);
              state = result.state;
              drafts = [];
              homeDraft = null;
              dirty = false;
              M.clear();
              player.dispose();
              close();
              await go("content");
              toast("数据已恢复，请重新关联本机视频");
            },
          },
        ],
      );
    } catch (e) {
      toast("备份未导入：" + e.message);
    }
  };
  const player = createAppPlayer({
    video: $("#video"),
    media: M,
    store: S,
    core: C,
    status: (text) => ($("#watch-status").textContent = text),
    onChange: (s) => {
      state = s;
    },
    onReward: (s, id) => {
      const r = s.receipts[id],
        progress = r ? C.reward(s, r.courseId) : null;
      if (progress?.total && progress.total % 5 === 0)
        toast(
          progress.total === 5
            ? "英雄已点亮！"
            : progress.total <= 30
              ? "获得一枚新勋章！"
              : "学习完成！",
        );
      updateWatchActions();
    },
  });
  async function launch(id) {
    const item = state.videos.find((v) => v.id === id);
    if (!item) {
      $("#watch-title").textContent = "视频不存在";
      return;
    }
    $("#watch-title").textContent = item.title;
    $("#watch-back").setAttribute(
      "aria-label",
      watchReturn ? "返回学习记录" : "返回课程",
    );
    $("#watch-lock").textContent = "锁定操作";
    $("#watch-shield").hidden = true;
    updateWatchActions();
    if (item.source.kind === "local" && !M.has(id)) {
      player.dispose();
      $("#video").hidden = true;
      $("#watch-empty").hidden = false;
      $("#watch-status").textContent =
        "请家长重新选择原视频，标题与学习进度已保留";
      return;
    }
    $("#video").hidden = false;
    $("#watch-empty").hidden = true;
    const replay = playRequest?.id === id && playRequest.replay;
    playRequest = null;
    if (!replay && player.current()?.id === id && $("#video").src) {
      player.resume();
      if ($("#video").ended) $("#video").currentTime = 0;
      $("#video")
        .play()
        .catch(() => {});
      return;
    }
    await player.select(
      item,
      replay || state.receipts[id] ? null : state.progress[id],
    );
  }
  function updateWatchActions() {
    const id = route.split("/")[1],
      item = state.videos.find((v) => v.id === id);
    if (!item) return;
    const items = state.videos.filter((v) => v.courseId === item.courseId),
      next = items[items.indexOf(item) + 1];
    $("#watch-actions").innerHTML =
      `${V.AppButton({ label: "从头播放", variant: "secondary", attrs: { "data-restart": true } })}${item.source.kind === "local" ? V.AppButton({ label: "重新关联本机视频", variant: "secondary", attrs: { "data-relink": id } }) : ""}${next ? V.AppButton({ label: "下一个视频", leadingIcon: "play", attrs: { "data-play": next.id } }) : ""}<span>${state.receipts[id] ? "已完成此视频" : "观看完成后记录学习情况"}</span>`;
  }
  $("#watch-back").onclick = () => {
    const v = state.videos.find((v) => v.id === route.split("/")[1]);
    go(watchReturn || (v ? "course/" + v.courseId : "content"));
  };
  $("#watch-lock").onclick = () => {
    const locked = player.lock();
    $("#watch-shield").hidden = !locked;
    $("#watch-lock").textContent = locked ? "解锁操作" : "锁定操作";
  };
  $("#watch-fullscreen").onclick = async () => {
    const video = $("#video");
    if (player.isLocked()) {
      toast("请先解锁，再进入系统全屏");
      return;
    }
    try {
      if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
      else if ($("#watch-stage").requestFullscreen)
        await $("#watch-stage").requestFullscreen();
      else toast("请使用播放器的全屏按钮");
    } catch {
      toast("请点击播放器的全屏按钮");
    }
  };
  document.addEventListener("keydown", (e) => {
    if (
      route.startsWith("watch/") &&
      player.isLocked() &&
      [" ", "k", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
        e.key,
      ) &&
      !e.target.closest("button,input,select")
    )
      e.preventDefault();
  });
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("button,a");
    if (!b) return;
    if (
      b.disabled ||
      b.getAttribute("aria-disabled") === "true" ||
      b.getAttribute("aria-busy") === "true"
    ) {
      e.preventDefault();
      return;
    }
    const busyAction =
      b.matches(".app-button") &&
      (b.id === "save-home" ||
        b.id === "import-submit" ||
        b.hasAttribute("data-export"));
    if (busyAction && !V.setButtonLoading(b, true)) return;
    try {
      if (b.id === "retry-load") {
        location.reload();
        return;
      }
      if (b.hasAttribute("data-history-retry")) {
        await loadHistory();
        return;
      }
      if (b.dataset.historyFilter && route.startsWith("history/")) {
        const y = scrollY;
        historyFilters.set(
          route,
          b.dataset.historyFilter === "completed" ? "completed" : "all",
        );
        render();
        $(`[data-history-filter="${historyFilters.get(route)}"]`)?.focus?.({
          preventScroll: true,
        });
        window.scrollTo(0, y);
        return;
      }
      if (b.dataset.historyPlay) {
        if (!state.videos.some((video) => video.id === b.dataset.historyPlay)) {
          toast("视频暂不可用");
          return;
        }
        playRequest = {
          id: b.dataset.historyPlay,
          replay: b.hasAttribute("data-replay"),
        };
        await go("watch/" + b.dataset.historyPlay);
        return;
      }
      if (b.matches('a[href^="#/"]')) {
        e.preventDefault();
        await go(b.getAttribute("href").slice(2));
        return;
      }
      if (b.dataset.parentRoute !== undefined) {
        parentAccess(b.dataset.parentRoute);
        return;
      }
      if (b.dataset.play) {
        await go("watch/" + b.dataset.play);
        return;
      }
      if (b.hasAttribute("data-pick-import")) {
        if (!operation) $("#pick-import").click();
        return;
      }
      if (b.hasAttribute("data-pick-playlist")) {
        if (!operation) $("#pick-playlist").click();
        return;
      }
      if (b.hasAttribute("data-import-url")) {
        importURL();
        return;
      }
      if (b.hasAttribute("data-relink")) {
        pickRelink(b.dataset.relink);
        return;
      }
      if (b.hasAttribute("data-course-new")) {
        courseDialog(null, b.dataset.courseNew || null);
        return;
      }
      if (b.dataset.courseEdit) {
        courseDialog(b.dataset.courseEdit);
        return;
      }
      if (b.dataset.courseSelect) {
        active = b.dataset.courseSelect;
        search = "";
        render();
        return;
      }
      if (b.dataset.titleEdit) {
        titleDialog(b.dataset.titleEdit);
        return;
      }
      if (b.dataset.moveCourse) {
        moveDialog(b.dataset.moveCourse);
        return;
      }
      if (b.dataset.order) {
        await orderVideo(b.dataset.order, Number(b.dataset.delta));
        return;
      }
      if (b.dataset.draftRemove) {
        M.remove(b.dataset.draftRemove);
        drafts = drafts.filter((v) => v.id !== b.dataset.draftRemove);
        delete errors[b.dataset.draftRemove];
        await saveDrafts();
        render();
        return;
      }
      if (b.id === "import-submit") {
        await importDrafts();
        return;
      }
      if (b.dataset.configAdd) {
        configPicker(b.dataset.configAdd);
        return;
      }
      if (b.dataset.configRemove) {
        const ids = [...idsFor(b.dataset.configRemove)];
        ids.splice(Number(b.dataset.index), 1);
        setConfigIds(b.dataset.configRemove, ids);
        return;
      }
      if (b.dataset.configOrder) {
        const ids = idsFor(b.dataset.configOrder);
        setConfigIds(
          b.dataset.configOrder,
          C.reorder(
            ids,
            Number(b.dataset.index),
            Number(b.dataset.index) + Number(b.dataset.delta),
          ),
        );
        return;
      }
      if (b.dataset.sectionOrder !== undefined) {
        const i = Number(b.dataset.sectionOrder);
        homeDraft.sections = C.reorder(
          homeDraft.sections,
          i,
          i + Number(b.dataset.delta),
        );
        dirty = true;
        render();
        return;
      }
      if (b.dataset.sectionDelete) {
        modal("删除首页栏目", "<p>课程视频与学习记录会保留。</p>", [
          { text: "取消", run: close },
          {
            text: "删除栏目",
            variant: "danger",
            run: () => {
              homeDraft.sections = homeDraft.sections.filter(
                (s) => s.id !== b.dataset.sectionDelete,
              );
              dirty = true;
              close();
              render();
            },
          },
        ]);
        return;
      }
      if (b.id === "add-section") {
        homeDraft.sections.push({
          id: crypto.randomUUID(),
          title: "新内容栏目",
          subtitle: "",
          videoIds: [],
        });
        dirty = true;
        render();
        return;
      }
      if (b.id === "save-home") {
        await saveHome();
        await go("home");
        return;
      }
      if (b.dataset.export) {
        await exportData(b.dataset.export);
        return;
      }
      if (b.id === "restore-backup") {
        $("#pick-backup").click();
        return;
      }
      if (b.hasAttribute("data-restart")) {
        $("#video").currentTime = 0;
        player.resume();
        $("#video")
          .play()
          .catch(() => {});
        return;
      }
      if (b.hasAttribute("data-profile")) {
        modal(
          "学习资料",
          `<label>昵称<input id="profile-name" value="${V.esc(state.settings.profileName)}"></label>`,
          [
            { text: "取消", run: close },
            {
              text: "保存",
              primary: true,
              run: async () => {
                const name = C.title($("#profile-name").value, 20);
                await write((s) => {
                  s.settings.profileName = name;
                });
                close();
                render();
              },
            },
          ],
        );
        return;
      }
      if (b.hasAttribute("data-install")) {
        modal(
          "添加到主屏幕",
          "<p>在 iPad Safari 中点击分享，再选择“添加到主屏幕”。本机视频仍需在新会话重新关联。</p>",
          [{ text: "知道了", run: close }],
        );
        return;
      }
    } catch (error) {
      toast(error.message);
    } finally {
      if (busyAction && b.isConnected) V.setButtonLoading(b, false);
    }
  });
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.draftTitle) {
      const q = drafts.find((v) => v.id === t.dataset.draftTitle);
      q.title = t.value;
      t.nextElementSibling.textContent = C.count(t.value) + " / 30";
      saveDrafts().catch(() => {});
    } else if (t.id === "video-search") {
      search = t.value;
      const pos = t.selectionStart;
      render();
      $("#video-search").focus();
      $("#video-search").setSelectionRange(pos, pos);
    } else if (t.dataset.sectionTitle || t.dataset.sectionSubtitle) {
      const id = t.dataset.sectionTitle || t.dataset.sectionSubtitle;
      homeDraft.sections.find((s) => s.id === id)[
        t.dataset.sectionTitle ? "title" : "subtitle"
      ] = t.value;
      dirty = true;
      $("#save-status").textContent = "有未保存的修改";
    }
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "today-mode") {
      if (t.value === "manual" && homeDraft.todayMode !== "manual")
        homeDraft.todayVideoIds = C.todayVideoIds(state, homeDraft);
      homeDraft.todayMode = t.value;
      dirty = true;
      render();
    } else if (t.dataset.draftCourse) {
      drafts.find((v) => v.id === t.dataset.draftCourse).courseId = t.value;
      saveDrafts().catch(() => {});
    }
  });
  window.addEventListener("beforeunload", (e) => {
    if (dirty || pendingWrites || M.count() || operation) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  window.addEventListener("pwatest:before-update", (e) => {
    if (dirty || pendingWrites || operation || route.startsWith("watch/")) {
      e.preventDefault();
      toast("请先保存修改并退出播放，再更新应用");
      return;
    }
    if (M.count()) {
      e.preventDefault();
      modal(
        "更新学习岛",
        "<p>更新会重新加载应用，之后需要重新关联本机视频。课程、标题与学习记录会保留。</p>",
        [
          { text: "稍后更新", run: close },
          {
            text: "更新并重新加载",
            primary: true,
            run: () => {
              M.clear();
              player.dispose();
              close();
              $("#pwa-apply").click();
            },
          },
        ],
      );
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) player.flush().catch(() => {});
  });
  const initialRoute = location.hash.startsWith("#/")
    ? location.hash.slice(2)
    : "home";
  if (initialRoute.startsWith("history/")) {
    route = initialRoute;
    historyStatus = "loading";
    document.documentElement?.classList?.add("history-context");
    render();
  }
  try {
    state = await S.read();
    drafts = structuredClone(state.drafts);
    route = location.hash.startsWith("#/") ? location.hash.slice(2) : "home";
    if (!location.hash) history.replaceState(null, "", "#/home");
    if (isParent(route)) {
      const target = route;
      route = "home";
      history.replaceState(null, "", "#/home");
      render();
      parentAccess(target);
    } else await show(route, true);
  } catch (e) {
    if (route.startsWith("history/")) {
      historyStatus = "error";
      historyError = e.message;
      render();
      return;
    }
    view.innerHTML = `<div class="boot-message" role="alert"><h1>本机数据暂时无法打开</h1><p>${V.esc(e.message)}</p>${V.AppButton({ label: "重试", attrs: { id: "retry-load" } })}</div>`;
  }
})();
