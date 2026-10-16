(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LearningCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const STORAGE_KEY = 'pwatest-learning-demo-v1';
  const ART = ['avatar-ultraman', 'avatar-teacher', 'cover-weekend', 'cover-bear', 'cover-fruits', 'cover-giraffe', 'cover-cake', 'cover-zebra'];
  function validate(data) {
    if (!data || data.mode !== 'demo' || !Array.isArray(data.lessons) || !Array.isArray(data.requiredIds) || !Array.isArray(data.initialCompleted)) throw Error('Invalid demo data');
    const seen = new Set();
    for (const l of data.lessons) {
      if (!l || typeof l.id !== 'string' || !/^[a-z0-9-]+$/.test(l.id) || seen.has(l.id) || typeof l.title !== 'string' || !l.title.trim() || !ART.includes(l.image) || !Number.isFinite(l.lesson) || typeof l.level !== 'string' || !Number.isFinite(l.minutes)) throw Error('Invalid lesson');
      seen.add(l.id);
    }
    if (new Set(data.requiredIds).size !== data.requiredIds.length || data.requiredIds.some(id => !seen.has(id))) throw Error('Invalid required tasks');
    return data;
  }
  function completedFrom(raw, data) {
    const ids = raw === null ? data.initialCompleted : JSON.parse(raw);
    if (!Array.isArray(ids)) throw Error('Invalid demo progress');
    return new Set(ids.filter(id => data.lessons.some(l => l.id === id)));
  }
  function progress(requiredIds, completed) { return { done: requiredIds.filter(id => completed.has(id)).length, total: requiredIds.length }; }
  function weekend(date) { return date.getDay() === 0 || date.getDay() === 6; }
  return { STORAGE_KEY, ART, validate, completedFrom, progress, weekend };
});
