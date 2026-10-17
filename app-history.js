(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;
  else root.AppHistory = factory(root.AppCore, root.AppViews);
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function (core, views) {
    "use strict";
    const { esc, icon, AppButton, PageHeader } = views;
    const pad = (n) => String(n).padStart(2, "0");
    const dayKey = (date) =>
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    function dateLabel(timestamp, now = new Date()) {
      if (
        !Number.isFinite(timestamp) ||
        timestamp <= 0 ||
        !Number.isFinite(new Date(timestamp).getTime())
      )
        return { key: "unknown", title: "日期未知", detail: "", clock: "" };
      const date = new Date(timestamp),
        yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const key = dayKey(date),
        monthDay = `${date.getMonth() + 1}月${date.getDate()}日`;
      return {
        key,
        title:
          key === dayKey(now)
            ? "今天"
            : key === dayKey(yesterday)
              ? "昨天"
              : date.getFullYear() === now.getFullYear()
                ? monthDay
                : `${date.getFullYear()}年${monthDay}`,
        detail:
          key === dayKey(now) || key === dayKey(yesterday)
            ? (date.getFullYear() !== now.getFullYear()
                ? `${date.getFullYear()}年`
                : "") + monthDay
            : "",
        clock: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
      };
    }
    function HeroPortrait(course) {
      const index = Math.max(0, core.HEROES.indexOf(course.heroId));
      return `<span class="history-hero" role="img" aria-label="${esc(course.title)}的学习英雄" data-hero-id="${esc(course.heroId)}"><span style="background-position:${(index % 3) * 50}% ${Math.floor(index / 3) * 100}%"></span></span>`;
    }
    function CourseHistorySummary(course, rows, now) {
      const recent = rows[0]?.watchedAt,
        date = dateLabel(recent, now);
      const recentTitle =
        recent &&
        new Date(recent).getFullYear() !== now.getFullYear() &&
        date.detail
          ? `${date.title} ${date.detail}`
          : date.title;
      return `<section class="history-summary" aria-label="课程学习概览">${HeroPortrait(course)}<div class="history-summary-copy"><h2>${esc(course.title)}</h2><p>已学过 <strong>${rows.length}</strong> 个视频</p></div><p class="history-recent">${icon("clock")}<span>最近学习：${recent ? esc(`${recentTitle} ${date.clock}`) : rows.length ? "时间未知" : "暂无记录"}</span></p></section>`;
    }
    function SegmentedControl(filter) {
      return `<div class="history-segments" role="group" aria-label="筛选学习记录">${[
        ["all", "全部看过"],
        ["completed", "已看完"],
      ]
        .map(
          ([value, label]) =>
            `<button type="button" data-history-filter="${value}" aria-pressed="${filter === value}">${label}</button>`,
        )
        .join("")}</div>`;
    }
    function EmptyState({ title, description, action = "", error = false }) {
      return `<div class="history-empty" ${error ? 'role="alert"' : ""}><span class="history-empty-icon" aria-hidden="true">${icon(error ? "info" : "task-list")}</span><h2>${esc(title)}</h2><p>${esc(description)}</p>${action}</div>`;
    }
    function VideoHistoryItem(row, now) {
      const { video, position, duration, done, available } = row,
        date = dateLabel(row.watchedAt, now);
      const action = done ? "再看一次" : "继续观看";
      const attrs = {
        "data-history-play": video.id,
        ...(done ? { "data-replay": true } : {}),
        "aria-label": `${action}：${video.title}`,
      };
      const knownCover = core.COVER_INDEXES.includes(video.coverIndex);
      const cover = `<span class="history-cover-fallback" aria-hidden="true">${icon("play")}</span>${knownCover ? views.cover(video.coverIndex) : ""}`;
      const meta =
        [date.clock, done ? "看完" : "观看"].filter(Boolean).join(" ") +
        (!done && position ? ` · 看到 ${views.duration(position)}` : "");
      return `<article class="history-item" data-history-video="${esc(video.id)}"><button type="button" class="history-cover" data-history-play="${esc(video.id)}" ${done ? 'data-replay=""' : ""} aria-label="${esc(`${action}：${video.title}`)}" ${available ? "" : "disabled"}>${cover}${duration ? `<span class="history-duration">${views.duration(duration)}</span>` : ""}${!done && duration && position ? `<span class="history-progress" aria-hidden="true"><span style="width:${Math.min(100, (position / duration) * 100)}%"></span></span>` : ""}</button><div class="history-item-copy"><h3 title="${esc(video.title)}">${esc(video.title)}</h3><p>${available ? esc(meta) : "视频暂不可用"}</p><span class="history-status ${done ? "is-complete" : "is-partial"}">${icon(done ? "check" : "clock")}${done ? "已看完" : "未看完"}</span></div>${AppButton({ label: action, leadingIcon: "play", className: "history-play", disabled: !available, attrs })}</article>`;
    }
    function HistoryDateGroup(date, rows, now) {
      return `<section class="history-date-group" aria-label="${esc(date.title)}"><h3 class="history-date-title">${esc(date.title)}${date.detail ? `<span>${esc(date.detail)}</span>` : ""}</h3><div class="history-items">${rows.map((row) => VideoHistoryItem(row, now)).join("")}</div></section>`;
    }
    function skeleton() {
      return `<div class="history-loading" role="status" aria-label="正在加载学习记录"><div class="history-summary history-skeleton-summary"></div>${Array.from({ length: 3 }, () => '<div class="history-item history-skeleton"><span></span><div></div><span></span></div>').join("")}<span class="sr-only">正在加载学习记录…</span></div>`;
    }
    function page(
      state,
      courseId,
      {
        filter = "all",
        status = "ready",
        error = "",
        backRoute = "content",
        now = new Date(),
      } = {},
    ) {
      const course = state?.courses.find((course) => course.id === courseId);
      const trailing = course
        ? `<div class="history-course-pill"><span style="--course-color:${esc(course.color)}">${esc(course.tag)}</span><strong>${esc(course.title)}</strong></div>`
        : "";
      const header = PageHeader({
        title: "学习记录",
        subtitle: "每一次学习，都留下小小的进步",
        trailing,
        backRoute,
      });
      let content;
      if (status === "loading") content = skeleton();
      else if (status === "error")
        content = EmptyState({
          title: "学习记录暂时无法加载",
          description: error || "请稍后重试。",
          error: true,
          action: AppButton({
            label: "重试",
            attrs: { "data-history-retry": true },
          }),
        });
      else if (!course)
        content = EmptyState({
          title: "课程暂不可用",
          description: "课程可能已被移除，请返回内容中心查看。",
        });
      else {
        const rows = core.courseHistory(state, courseId),
          visible =
            filter === "completed" ? rows.filter((row) => row.done) : rows;
        const groups = new Map();
        visible.forEach((row) => {
          const date = dateLabel(row.watchedAt, now);
          if (!groups.has(date.key)) groups.set(date.key, { date, rows: [] });
          groups.get(date.key).rows.push(row);
        });
        const next = core.courseStartVideo(state, courseId);
        const action = next
          ? AppButton({
              label: "去学习",
              leadingIcon: "play",
              attrs: { "data-history-play": next.id },
            })
          : "";
        const empty =
          filter === "completed"
            ? EmptyState({
                title: "还没有看完的视频",
                description: "可以切换到「全部看过」，继续上次的学习。",
                action: AppButton({
                  label: "切回全部看过",
                  variant: "secondary",
                  attrs: { "data-history-filter": "all" },
                }),
              })
            : EmptyState({
                title: "还没有学习记录",
                description: "开始学习后，看过的视频会出现在这里。",
                action,
              });
        content = `${CourseHistorySummary(course, rows, now)}<div class="history-list-heading"><h2>看过的视频</h2>${SegmentedControl(filter)}</div><div class="history-list">${visible.length ? [...groups.values()].map((group) => HistoryDateGroup(group.date, group.rows, now)).join("") + '<p class="history-end">已经到底啦</p>' : empty}</div>`;
      }
      return `<div class="course-history"><div class="history-container">${header}<main>${content}</main></div></div>`;
    }
    return {
      page,
      dateLabel,
      CourseHistorySummary,
      SegmentedControl,
      HistoryDateGroup,
      VideoHistoryItem,
      EmptyState,
    };
  },
);
