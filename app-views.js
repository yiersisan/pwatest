(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;
  else root.AppViews = factory(root.AppCore);
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const icon = (name) =>
    `<svg class="icon" aria-hidden="true" focusable="false"><use href="./assets/parent/icons/sprite.svg#${esc(name)}"/></svg>`;
  // Shared HTML renderer: native attributes and delegated events stay on the root.
  function AppButton({
    label,
    variant = "primary",
    disabled = false,
    loading = false,
    leadingIcon,
    block = false,
    href,
    as,
    className = "",
    attrs = {},
  }) {
    if (!["primary", "secondary", "danger"].includes(variant))
      variant = "primary";
    // Non-interactive previews can reuse the presentation without nesting buttons.
    const tag = href !== undefined ? "a" : as === "span" ? "span" : "button";
    const attributes = {
      ...attrs,
      class:
        `app-button app-button--${variant}${block ? " app-button--block" : ""} ${className}`.trim(),
      ...(tag === "a"
        ? { href }
        : tag === "button"
          ? { type: attrs.type || "button" }
          : {}),
      ...(disabled || loading
        ? tag === "button"
          ? { disabled: true }
          : { "aria-disabled": "true", tabindex: -1 }
        : {}),
      ...(loading ? { "aria-busy": "true" } : {}),
    };
    return `<${tag} ${Object.entries(attributes)
      .filter(
        ([key, value]) => !/^on/i.test(key) && value !== false && value != null,
      )
      .map(([key, value]) => `${key}="${esc(value === true ? "" : value)}"`)
      .join(
        " ",
      )}><span class="app-button__content">${leadingIcon ? icon(leadingIcon) : ""}<span class="app-button__label">${esc(label)}</span></span></${tag}>`;
  }
  const busyButtons = new WeakMap();
  function setButtonLoading(button, loading) {
    if (loading) {
      if (
        button.disabled ||
        button.getAttribute("aria-busy") === "true" ||
        button.getAttribute("aria-disabled") === "true"
      )
        return false;
      busyButtons.set(button, {
        disabled: button.disabled,
        tabindex: button.getAttribute("tabindex"),
      });
      button.setAttribute("aria-busy", "true");
      if (button.tagName === "BUTTON") button.disabled = true;
      else {
        button.setAttribute("aria-disabled", "true");
        button.setAttribute("tabindex", "-1");
      }
    } else {
      const previous = busyButtons.get(button);
      if (!previous) return false;
      button.removeAttribute("aria-busy");
      if (button.tagName === "BUTTON") button.disabled = previous.disabled;
      else {
        button.removeAttribute("aria-disabled");
        if (previous.tabindex === null) button.removeAttribute("tabindex");
        else button.setAttribute("tabindex", previous.tabindex);
      }
      busyButtons.delete(button);
    }
    return true;
  }
  function createButton(props) {
    const template = document.createElement("template");
    template.innerHTML = AppButton(props);
    const button = template.content.firstElementChild;
    if (props.loading)
      busyButtons.set(button, {
        disabled: !!props.disabled,
        tabindex: props.attrs?.tabindex ?? null,
      });
    button.addEventListener("click", (event) => {
      if (
        button.disabled ||
        button.getAttribute("aria-disabled") === "true" ||
        button.getAttribute("aria-busy") === "true"
      ) {
        event.preventDefault();
        return;
      }
      props.onClick?.(event);
    });
    return button;
  }
  function TaskEmptyState({
    icon: illustration = "task-list",
    title,
    description,
    hasCustomizeAction = false,
    customizeRoute = "courses",
  }) {
    return `<div class="task-empty-state"><span class="task-empty-state__art" aria-hidden="true">${icon(illustration)}</span><div class="task-empty-state__body"><h3>${esc(title)}</h3><p>${esc(description)}</p>${hasCustomizeAction ? "" : AppButton({ label: "去定制", leadingIcon: "lock", attrs: { "data-parent-route": customizeRoute } })}</div></div>`;
  }
  const link = (route, label, cls = "") =>
    `<a class="${cls}" href="#/${route}">${label}</a>`;
  function BackButton(route = "content", label = "返回上一页") {
    return `<a class="app-back" href="#/${esc(route)}" aria-label="${esc(label)}">${icon("back")}</a>`;
  }
  function PageHeader({
    title,
    subtitle,
    trailing = "",
    backRoute = "content",
  }) {
    return `<header class="page-header"><div class="page-heading">${BackButton(backRoute)}<div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div></div>${trailing}</header>`;
  }
  const duration = (n) =>
    `${String(Math.floor((n || 0) / 60)).padStart(2, "0")}:${String(Math.floor((n || 0) % 60)).padStart(2, "0")}`;
  function cover(index) {
    const asset = core.coverAsset(index);
    if (!asset) return '<div class="thumb"></div>';
    return `<div class="thumb"><span class="tile homepage-cover" data-cover-index="${index}" style="background-image:url('${asset.path}');--x:${(asset.column / 3) * 100}%;--y:${asset.row * 100}%"></span></div>`;
  }
  function options(state, id, all = false) {
    return (
      `<option value="">${all ? "全部课程" : "请选择课程"}</option>` +
      state.courses
        .map(
          (c) =>
            `<option value="${c.id}" ${c.id === id ? "selected" : ""}>${esc(c.tag)}　${esc(c.title)}</option>`,
        )
        .join("")
    );
  }
  function nav(page) {
    return `<nav class="nav" aria-label="家长管理">${link("courses", "课程与视频", page === "courses" ? "active" : "")}${link("configure", "首页配置", page === "configure" ? "active" : "")}${link("data", "数据与备份", page === "data" ? "active" : "")}${AppButton({ label: "导入视频", leadingIcon: "plus", href: "#/import" })}</nav>`;
  }
  function parent(page, title, subtitle, body, actions = "") {
    return `<div class="parent-view"><div class="app"><header class="head">${BackButton("content", "返回内容中心")}<div class="head-main"><h1>${title}</h1><p>${subtitle}</p></div>${actions || '<span class="badge">' + icon("lock") + "家长模式</span>"}</header>${nav(page)}${body}</div></div>`;
  }
  function homeCard(v, state) {
    return `<article class="task-card">${taskArtwork(v, state)}<div class="details">${taskAction(v, state)}</div></article>`;
  }
  function taskArtwork(v, state) {
    const course = state.courses.find((c) => c.id === v.courseId),
      seconds = v.source.duration || state.progress[v.id]?.duration;
    return `<div class="cover task-artwork">${cover(v.coverIndex)}<span class="task-subject" style="--subject:${course?.color || "#187958"}" aria-label="科目：${esc(course?.title)}" title="${esc(course?.title)}">${esc(course?.tag)}</span>${seconds > 0 ? `<span class="task-duration" aria-label="视频时长 ${duration(seconds)}">${duration(seconds)}</span>` : ""}</div>`;
  }
  function taskAction(v, state) {
    const label = state.receipts[v.id] ? "再次学习" : "开始学习";
    return `<div class="status-line">${AppButton({ label, leadingIcon: "play", attrs: { "data-play": v.id, "aria-label": `${label}：${v.title}` } })}</div>`;
  }
  function home(state) {
    const todayIds = core.todayVideoIds(state);
    const section = (title, subtitle, ids, today = false) => {
      const videos = ids
        .map((id) => state.videos.find((v) => v.id === id))
        .filter(Boolean);
      let content;
      if (videos.length) {
        content = `<div class="rail" tabindex="0" aria-label="${esc(title)}视频列表">${videos.map((v) => homeCard(v, state)).join("")}</div>`;
      } else if (ids.length === 0) {
        content = `<div class="task-empty-region">${TaskEmptyState({
          icon: today ? "task-list" : "task-calendar",
          title: today
            ? "今天的学习任务还没安排"
            : title === "本周任务"
              ? "本周的学习计划还没安排"
              : `${title}的学习内容还没安排`,
          description: today
            ? "请家长点击「定制」，安排今天的小任务。"
            : title === "本周任务"
              ? "请家长点击「定制」，添加本周的学习内容。"
              : "请家长点击「定制」，添加这里的学习内容。",
          hasCustomizeAction: false,
        })}</div>`;
      } else {
        content =
          '<p class="home-message" role="alert">任务内容暂时无法显示，请家长在「定制」中检查配置。</p>';
      }
      return `<section class="home-section ${today ? "today" : "weekly"}"><div class="section-head"><h${today ? "1" : "2"}>${esc(title)}</h${today ? "1" : "2"}><p>${today ? `已完成 ${videos.filter((v) => state.receipts[v.id]).length} / ${videos.length}` : esc(subtitle)}</p></div>${content}</section>`;
    };
    return `<div class="learning-home"><header class="home-header"><button class="profile" data-profile><span class="avatar artwork"><span class="art-tile" style="--col:0;--row:0"><img src="./assets/images/covers/illustration-atlas.webp" alt="" draggable="false"></span></span><span class="profile-copy"><span class="profile-name">${esc(state.settings.profileName)}</span><span class="greeting">每天进步一点点</span></span></button><nav class="home-nav">${AppButton({ label: "内容中心", variant: "secondary", href: "#/content" })}${AppButton({ label: "定制", leadingIcon: "lock", attrs: { "data-parent-route": "courses" } })}</nav></header><main>${section("今日任务", "", todayIds, true)}${state.home.sections.map((s) => section(s.title, s.subtitle, s.videoIds)).join("")}</main><footer class="home-footer"><p>左右滑动，发现更多学习内容</p><div class="home-meta"><span id="pwa-status">本机课程与学习记录</span><button data-install>添加到主屏幕</button><span>v5.0</span></div></footer></div>`;
  }
  function content(state) {
    return `<div class="content-center"><header class="center-header"><div class="center-heading">${BackButton("home", "返回学习首页")}<div><h1>内容中心</h1><p>完成学习，点亮你的英雄</p></div></div><div class="center-profile"><span class="profile-text">${esc(state.settings.profileName)}</span></div></header><p class="reward-rule"><img src="./assets/content-center/star-lit.png" width="28" height="28" alt="">每完成5个不同视频，点亮一个奖励</p><main><section class="course-grid">${
      state.courses
        .filter((c) => state.videos.some((v) => v.courseId === c.id))
        .map((c) => {
          const r = core.reward(state, c.id),
            hi = Number(c.heroId.slice(-2)) - 1,
            items = state.videos.filter((v) => v.courseId === c.id),
            nextVideo = core.courseStartVideo(state, c.id);
          return `<article class="course-card" data-course-card="${c.id}"><h2 class="course-title"><span class="subject-tag" style="--subject:${c.color}">${esc(c.tag)}</span><a class="course-title-text" href="#/history/${c.id}" aria-label="查看${esc(c.title)}的学习记录">${esc(c.title)}</a></h2><div class="course-rewards"><div class="hero-badge ${r.heroUnlocked ? "is-unlocked" : "is-locked"}"><span class="hero-sprite" style="background-image:url('./assets/content-center/hero-atlas.png');background-position:${(hi % 3) * 50}% ${Math.floor(hi / 3) * 100}%"></span>${r.heroUnlocked && !r.allCollected ? `<span class="hero-target"><span class="medal"><span class="medal-art" style="--mx:${r.medalCount * 25}%;--my:100%"></span></span></span>` : ""}</div><div class="progress-panel"><p class="reward-progress">${r.allCollected ? "奖励已集齐" : `<strong>${r.stars}</strong> / 5`}</p><ol class="energy-progress">${Array.from({ length: 5 }, (_, i) => `<li><img src="./assets/content-center/star-${i < r.stars ? "lit" : "locked"}.png" alt="${i < r.stars ? "已点亮" : "未点亮"}"></li>`).join("")}</ol></div></div><div class="course-actions">${r.heroUnlocked ? `<ol class="medals" aria-label="已获得${r.medalCount}枚勋章">${core.MEDALS.map((_, i) => `<li class="medal-slot ${r.heroUnlocked && i === r.medalCount && !r.allCollected ? "is-current" : ""}"><span class="medal"><span class="medal-art" style="--mx:${i * 25}%;--my:${i < r.medalCount ? 0 : 100}%"></span></span></li>`).join("")}</ol>` : '<p class="medals-prompt">更多勋章，等你来点亮！</p>'}${AppButton({ label: "开始学习", leadingIcon: "play", disabled: !nextVideo, className: "learn-button", attrs: nextVideo ? { "data-play": nextVideo.id, "aria-label": `开始学习：${c.title}` } : { title: "这门课程还没有视频", "aria-label": `开始学习：${c.title}（暂无视频）` } })}</div><p class="course-real-count">${items.length} 个视频 · 已完成 ${items.filter((v) => state.receipts[v.id]).length} 个</p></article>`;
        })
        .join("") ||
      '<p class="empty">还没有学习内容，请家长在首页「定制」中导入视频。</p>'
    }</section></main><footer class="center-footer">学习进度与已获得的奖励保存在本机。</footer></div>`;
  }
  function course(state, id, media) {
    const c = state.courses.find((c) => c.id === id);
    if (!c) return '<p class="boot-message">课程不存在</p>';
    const items = state.videos.filter((v) => v.courseId === id);
    return `<div class="parent-view"><div class="app"><header class="head">${BackButton("content", "返回内容中心")}<div class="head-main"><h1>${esc(c.title)}</h1><p>${items.length} 个视频 · 选择一个开始学习</p></div>${AppButton({ label: "家长管理", leadingIcon: "lock", attrs: { "data-parent-route": "courses" } })}</header><main class="panel"><div class="lesson-grid">${items.map((v) => `<article class="lesson-item">${cover(v.coverIndex)}<h2>${esc(v.title)}</h2><p>${duration(state.progress[v.id]?.position)} / ${duration(v.source.duration || state.progress[v.id]?.duration)} · ${state.receipts[v.id] ? "已完成" : "待学习"}</p>${AppButton({ label: v.source.kind === "local" && !media.has(v.id) ? "选择原视频继续学习" : state.progress[v.id]?.position ? "继续播放" : "开始播放", leadingIcon: "play", attrs: { "data-play": v.id } })}</article>`).join("") || '<div class="empty">课程还没有视频，请家长在“定制”中导入。</div>'}</div></main></div></div>`;
  }
  function manager(state, active, search, media) {
    const c = state.courses.find((c) => c.id === active) || state.courses[0],
      all = state.videos.filter((v) => v.courseId === c?.id),
      items = all.filter((v) =>
        v.title.toLowerCase().includes(search.toLowerCase()),
      );
    const missing = state.videos.filter(
      (v) => v.source.kind === "local" && !media.has(v.id),
    ).length;
    return parent(
      "courses",
      "课程与视频",
      "管理课程，编辑视频与播放顺序",
      `<main class="manager"><aside class="panel sidebar"><h2>全部课程</h2><div id="course-list">${state.courses.map((c) => `<button class="course-choice ${c.id === active ? "selected" : ""}" data-course-select="${c.id}"><span class="tag" style="--tag:${c.color}">${esc(c.tag)}</span><span>${esc(c.title)}</span><span class="count">${state.videos.filter((v) => v.courseId === c.id).length}</span></button>`).join("")}</div>${AppButton({ label: `新建课程`, variant: "secondary", attrs: { "data-course-new": true } })}</aside><section class="panel"><div class="list-head"><h2>${esc(c?.title || "课程")}</h2><span class="count-chip">${all.length} 个视频</span><div class="actions">${AppButton({ label: `编辑课程`, variant: "secondary", attrs: { "data-course-edit": `${c?.id}` } })}<input id="video-search" type="search" value="${esc(search)}" placeholder="搜索视频标题" aria-label="搜索视频标题"></div></div><div class="helper actions">${AppButton({ label: `重新关联本机视频${missing ? " · " + missing : ""}`, variant: "secondary", attrs: { "data-relink": true } })}<span>拖动手柄或点击箭头调整顺序</span></div><div id="video-list">${items.map((v) => `<article class="video-row" data-video-id="${v.id}"><button class="grip" data-grip="${v.id}" ${search ? "disabled" : ""} aria-label="调整${esc(v.title)}顺序">${icon("grip")}</button><span class="order">${all.indexOf(v) + 1}</span>${cover(v.coverIndex)}<div class="video-title"><h3>${esc(v.title)}</h3><p>${duration(v.source.duration)} · ${v.source.kind === "local" ? (media.has(v.id) ? "本次可播放" : "待重新关联") : "链接视频"}</p></div><div class="actions"><button class="text-action" data-play="${v.id}">播放</button><button class="text-action" data-title-edit="${v.id}">改标题</button><button class="text-action" data-move-course="${v.id}">换课程</button><button class="text-action" data-order="${v.id}" data-delta="-1" ${search ? "disabled" : ""} aria-label="上移${esc(v.title)}">↑</button><button class="text-action" data-order="${v.id}" data-delta="1" ${search ? "disabled" : ""} aria-label="下移${esc(v.title)}">↓</button></div></article>`).join("") || '<div class="empty">' + (search ? "没有找到视频" : "课程还没有视频，点击右上角“导入视频”") + "</div>"}</div><footer class="list-foot">共 ${all.length} 个视频</footer></section></main>`,
    );
  }
  function imports(state, errors, media) {
    return parent(
      "import",
      "导入视频",
      "为每个视频填写标题并选择课程",
      `<main class="panel"><div class="dropzone"><div>${icon("upload")}<h2><button data-pick-import>点击选择视频</button></h2><p class="muted">支持多选；选中后点系统右上角对勾或“添加”完成选择</p></div>${AppButton({ label: `继续添加`, variant: "secondary", attrs: { "data-pick-import": true } })}</div><div class="import-extra"><button class="text-action" data-import-url>从链接导入</button><button class="text-action" data-pick-playlist>导入 M3U8 清单</button><span class="muted">也可选择 M3U8 清单；视频分片仍需联网</span></div><p id="import-work" role="status"></p><h2 class="queue-title">待导入视频 · ${state.drafts.length}</h2><div id="upload-queue">${state.drafts.map((q) => `<article class="upload-item" data-draft="${q.id}"><div>${cover(q.coverIndex)}<p class="source-name">${esc(q.source.name || q.source.url)}</p></div><div><div class="field-grid"><label class="field-line">视频标题<div class="input-count"><input data-draft-title="${q.id}" value="${esc(q.title)}"><span class="counter">${core.count(q.title)} / 30</span></div></label><div class="field-line"><label for="draft-course-${q.id}">所属课程</label><div class="select-line"><select id="draft-course-${q.id}" data-draft-course="${q.id}">${options(state, q.courseId)}</select><button class="text-action" data-course-new="${q.id}">新建课程</button></div></div></div><p class="upload-status ${errors[q.id] ? "error" : "muted"}">${esc(errors[q.id] || (q.source.kind === "local" && !media.has(q.id) ? "文件需重新关联；标题、课程和封面已保留" : "等待导入"))}</p></div><button class="text-action delete-queue" data-draft-remove="${q.id}" aria-label="移除${esc(q.title)}">${icon("close")}</button></article>`).join("") || '<div class="empty">还没有选择视频</div>'}</div><footer class="bottom-bar"><p class="muted">只保存课程信息，不保存视频副本</p><div class="actions">${AppButton({ label: `重新关联文件`, variant: "secondary", attrs: { "data-relink": true } })}${AppButton({ label: `导入 ${state.drafts.length} 个视频`, leadingIcon: "upload", disabled: !state.drafts.length, attrs: { id: "import-submit" } })}</div></footer></main>`,
    );
  }
  function configure(state, draft, dirty) {
    const card = (id, key, i, editable = true) => {
      const v = state.videos.find((v) => v.id === id);
      if (!v) return "";
      return `<article class="home-card">${taskArtwork(v, state)}<div class="details"><h3 class="lesson-title">${esc(v.title)}</h3>${taskAction(v, state)}</div>${editable ? `<div class="config-tools"><button data-config-order="${esc(key)}" data-index="${i}" data-delta="-1" aria-label="前移${esc(v.title)}">←</button><button data-config-order="${esc(key)}" data-index="${i}" data-delta="1" aria-label="后移${esc(v.title)}">→</button><button data-config-remove="${esc(key)}" data-index="${i}">移除</button></div>` : ""}</article>`;
    };
    const rail = (ids, key, editable = true) =>
      `<div class="config-rail">${ids.map((id, i) => card(id, key, i, editable)).join("")}${editable ? `<button class="add-video" data-config-add="${esc(key)}">＋ 添加视频</button>` : ids.length ? "" : '<p class="empty">当前还没有课程视频，导入后会自动安排。</p>'}</div>`;
    const automatic = draft.todayMode === "auto";
    return parent(
      "configure",
      "首页配置",
      "调整孩子首页展示的视频与栏目",
      `<main id="home-editor"><section class="config-section"><div class="section-heading"><h2>今日任务</h2><label class="today-mode">安排方式<select id="today-mode"><option value="auto" ${automatic ? "selected" : ""}>自动安排</option><option value="manual" ${automatic ? "" : "selected"}>手动选择</option></select></label></div><p class="muted">自动安排时，每门课程按顺序显示下一条未完成的视频；全部学完后随机安排本课程的视频复习，看完后继续安排。</p>${rail(core.todayVideoIds(state, draft), "today", !automatic)}</section>${draft.sections.map((s, i) => `<section class="config-section"><div class="section-heading"><label class="editable-title">栏目标题<input data-section-title="${s.id}" value="${esc(s.title)}"></label><label class="editable-subtitle">副标题<input data-section-subtitle="${s.id}" value="${esc(s.subtitle)}"></label><button class="text-action" data-section-order="${i}" data-delta="-1">↑</button><button class="text-action" data-section-order="${i}" data-delta="1">↓</button><button class="text-action danger" data-section-delete="${s.id}">删除栏目</button></div>${rail(s.videoIds, s.id)}</section>`).join("")}</main><button class="section-add" id="add-section">＋ 添加内容栏目</button><p class="footnote" id="save-status">${dirty ? "有未保存的修改" : "配置已保存"} · 移除首页展示不会删除课程视频</p>`,
      `<div class="actions">${AppButton({ label: "保存配置", leadingIcon: "save", attrs: { id: "save-home" } })}</div>`,
    );
  }
  function data(state) {
    return parent(
      "data",
      "数据与备份",
      "导出学习情况与页面配置",
      `<main class="panel data-panel"><h2>本机数据</h2><p>${state.courses.length} 门课程 · ${state.videos.length} 个视频 · ${Object.keys(state.receipts).length} 个完成记录</p><p>备份只包含业务数据，不含视频文件。恢复后需重新关联本机视频。</p><div class="data-actions">${AppButton({ label: "导出全部数据 JSON", attrs: { "data-export": "all" } })}${AppButton({ label: `导出学习情况 JSON`, variant: "secondary", attrs: { "data-export": `learning` } })}${AppButton({ label: `导出学习报表 CSV`, variant: "secondary", attrs: { "data-export": `csv` } })}${AppButton({ label: `导出页面配置 JSON`, variant: "secondary", attrs: { "data-export": `configuration` } })}${AppButton({ label: `从 JSON 恢复`, variant: "secondary", attrs: { id: `restore-backup` } })}</div><p class="muted">学习备份附带对应课程与视频目录，可独立恢复；页面配置备份不含学习进度与完成记录。恢复将替换本机业务数据，界面会先展示文件内容供确认。</p></main>`,
    );
  }
  return {
    AppButton,
    BackButton,
    PageHeader,
    createButton,
    setButtonLoading,
    TaskEmptyState,
    esc,
    icon,
    link,
    duration,
    cover,
    options,
    parent,
    home,
    content,
    course,
    manager,
    imports,
    configure,
    data,
  };
});
