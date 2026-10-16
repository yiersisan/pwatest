(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RewardCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const empty = () => ({ version: 1, courses: {}, bindings: {}, aliases: {}, receipts: {}, feedback: [] });
  const initialCourse = () => ({ total: 0, roundCount: 0, unlocked: [], latest: null });
  function validate(state) {
    if (!state || state.version !== 1 || !state.courses || !state.bindings || !state.receipts || !Array.isArray(state.feedback)) throw Error('学习记录格式不正确，请保留数据后检查，不能自动清空。');
    state.aliases ||= {};
    for (const c of Object.values(state.courses)) {
      if (!Number.isSafeInteger(c.total) || c.total < 0 || c.roundCount !== c.total % 5 || !Array.isArray(c.unlocked)) throw Error('学习记录校验失败，未修改原记录。');
    }
    return state;
  }
  function course(config, id) {
    const value = config.courses.find(c => c.id === id);
    if (!value) throw Error('课程不存在');
    return value;
  }
  function bind(state, config, courseId, videoId) {
    course(config, courseId);
    if (typeof videoId !== 'string' || !videoId) throw Error('视频不存在');
    if (state.bindings[videoId] && state.bindings[videoId] !== courseId) throw Error('这段视频已关联其他课程，同一视频只能领取一次奖励。');
    state.bindings[videoId] = courseId;
    return { courseId, videoId };
  }
  function complete(state, config, event) {
    // 只接收播放器有效 ended 事件；UI 入口、演示按钮、旧 history.completed 不发奖。
    if (!event || event.valid !== true || typeof event.videoId !== 'string') return { awarded: false };
    const courseId = state.bindings[event.videoId], id = state.aliases[event.videoId] || event.videoId;
    if (!courseId || state.receipts[id]) return { awarded: false };
    const definition = course(config, courseId);
    const c = state.courses[courseId] || (state.courses[courseId] = initialCourse());
    c.total++; c.roundCount = c.total % 5;
    const receipt = { videoId: id, courseId, completedAt: event.at, total: c.total, heroId: null };
    if (c.roundCount === 0) {
      const next = definition.heroOrder.find(heroId => !c.unlocked.includes(heroId));
      if (next) { c.unlocked.push(next); c.latest = next; receipt.heroId = next; }
      state.feedback.push({ id, courseId, heroId: next || c.latest, total: c.total });
    }
    state.receipts[id] = receipt;
    return { awarded: true, receipt };
  }
  function relink(state, oldId, newId) {
    if (oldId === newId) return;
    if (state.bindings[oldId] && state.bindings[newId] && state.bindings[oldId] !== state.bindings[newId]) throw Error('新链接已属于其他课程，请检查是否替换了同一视频');
    const oldRoot = state.aliases[oldId] || oldId, newRoot = state.aliases[newId] || newId;
    const canonical = state.receipts[oldRoot] ? oldRoot : state.receipts[newRoot] ? newRoot : oldRoot;
    const ids = new Set([oldId,newId,oldRoot,newRoot,...Object.keys(state.aliases).filter(id => [oldRoot,newRoot].includes(state.aliases[id]))]);
    for (const id of ids) {
      state.aliases[id] = canonical;
      if (state.bindings[oldId] || state.bindings[newId]) state.bindings[id] = state.bindings[oldId] || state.bindings[newId];
    }
  }
  const receiptFor = (state, id) => state.receipts[state.aliases[id] || id];
  function view(state, config, courseId, records = []) {
    const definition = course(config, courseId), c = state.courses[courseId] || initialCourse();
    const nextHero = definition.heroOrder.find(id => !c.unlocked.includes(id)) || null;
    const heroId = c.latest || nextHero;
    const available = records.filter(r => state.bindings[r.id] === courseId);
    const nextContent = available.find(r => !receiptFor(state,r.id)) || null;
    const copy = config.copy;
    const encouragement = c.latest ? (!nextHero ? copy.complete : c.roundCount ? copy.collecting : copy.unlocked) : c.roundCount ? copy.remaining : copy.first;
    return { ...definition, ...c, nextHero, hero: config.heroes.find(h => h.id === heroId), nextContent,
      available, encouragement: encouragement.replace('{n}', 5 - c.roundCount),
      button: c.latest ? copy.collect : c.roundCount ? copy.resume : copy.start };
  }
  return { empty, initialCourse, validate, bind, complete, relink, receiptFor, view };
});
