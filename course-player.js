(() => {
  'use strict';
  const id = new URLSearchParams(location.hash.slice(1)).get('course');
  const course = ContentConfig.courses.find(c => c.id === id);
  const note = document.getElementById('course-playback-status');
  const back = document.getElementById('back-to-content');
  const retry = document.getElementById('retry-course-reward');
  let pendingBinding = Promise.resolve(), pendingCompletion = null;
  function message(text) { note.hidden = false; note.textContent = text; }

  if (course) {
    back.hidden = false;
    message('当前课程：' + course.name + '。在此导入的新视频会关联到本课程，首次播放完成才收集徽章。');
  }
  async function award(event) {
    try {
      await pendingBinding;
      const result = await RewardStore.complete(event);
      pendingCompletion = null; retry.hidden = true;
      if (result.awarded) {
        back.hidden = false;
        message(result.receipt.heroId ? '五枚集齐！英雄奖励已保存，返回内容中心查看合成。' : '已收集1枚能量徽章！返回内容中心查看进度。');
      }
    } catch {
      pendingCompletion = event; retry.hidden = false;
      message('本次奖励暂未保存。请保留此页面，检查存储设置后点击“重试保存奖励”；重复重试不会多发。');
    }
  }
  retry.addEventListener('click', () => { if (pendingCompletion) award(pendingCompletion); });
  window.CoursePlayer = {
    imported(record, replacedId) {
      pendingBinding = (async () => {
        if (replacedId && replacedId !== record.id) await RewardStore.relink(replacedId, record.id);
        if (course) await RewardStore.bind(course.id, record.id);
      })();
      pendingBinding.catch(error => message('课程关联未保存：' + (error.message || '请检查存储设置后重新关联') + '。仍可正常播放。'));
    },
    completed(record) {
      // app.js 在有效 ended 回调处传递不可变的 ID 快照，不以“开始学习”或历史 completed 布尔值推断。
      const event = { videoId: record.id, valid: true, at: Date.now() };
      pendingCompletion = event; return award(event);
    },
    async launch(records, select) {
      if (!course) return;
      try {
        const state = await RewardStore.read();
        let requested;
        try { requested = JSON.parse(sessionStorage.getItem('pwatest-course-launch')); sessionStorage.removeItem('pwatest-course-launch'); } catch { /* 可从关联记录恢复 */ }
        const target = requested?.courseId === course.id ? records.find(r => r.id === requested.videoId && state.bindings[r.id] === course.id) : null;
        const next = target || RewardCore.view(state, ContentConfig, course.id, records).nextContent;
        if (next) select(next, false);
      } catch { message('课程记录暂时无法读取。播放器仍可使用，请返回内容中心重新关联后收集徽章。'); }
    }
  };
})();
