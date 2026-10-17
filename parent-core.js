(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ParentCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const count = text => typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(text)].length : Array.from(text).length;
  function title(value, max = 30, allowEmpty = false) {
    const text = String(value ?? '').trim();
    if ((!allowEmpty && !text) || count(text) > max) throw Error(`请填写${allowEmpty ? '0' : '1'}–${max}个字符`);
    return text;
  }
  function course(input, courses, id) {
    const tag = String(input.tag || '').trim(), name = String(input.title || '').trim();
    if (!/^\p{Script=Han}$/u.test(tag) || !/^\p{Script=Han}{2,6}$/u.test(name)) throw Error('标签为1个汉字，课程名称为2–6个汉字');
    if (courses.some(c => c.id !== id && c.title === name)) throw Error('该课程已存在，请选择已有课程');
    return { tag, title: name };
  }
  function reorder(ids, from, to) {
    const next = [...ids];
    if (from < 0 || to < 0 || from >= ids.length || to >= ids.length) return next;
    next.splice(to, 0, next.splice(from, 1)[0]); return next;
  }
  function home(input, videos) {
    const ids = list => {
      if (!Array.isArray(list) || new Set(list).size !== list.length) throw Error('同一栏目不能重复添加视频');
      if (list.some(id => !videos.some(v => v.id === id && v.status === 'ready'))) throw Error('请移除已失效的视频后保存');
      return [...list];
    };
    if (new Set(input.sections.map(s => s.id)).size !== input.sections.length) throw Error('栏目标识重复');
    return { version: input.version, todayVideoIds: ids(input.todayVideoIds), sections: input.sections.map(s => ({ id:s.id, title:title(s.title,12), subtitle:title(s.subtitle,40,true), videoIds:ids(s.videoIds) })) };
  }
  return { count, title, course, reorder, home };
});
