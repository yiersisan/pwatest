// 仅由明确的“视觉演示”入口加载，不读写 RewardStore、视频记录或首页演示进度。
window.ContentDemo = {
  snapshot() {
    const state = RewardCore.empty();
    for (const [id, total] of [['english',3],['thinking',0],['pinyin',5],['math',1],['reading',0]]) {
      state.courses[id] = { total, roundCount: total % 5, unlocked: total >= 5 ? ['ultraman'] : [], latest: total >= 5 ? 'ultraman' : null };
    }
    return state;
  }
};
