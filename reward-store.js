(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else {
    root.createRewardStore = factory;
    root.RewardStore = factory({ indexedDB: root.indexedDB, core: root.RewardCore, config: root.ContentConfig });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (options) {
  'use strict';
  const { indexedDB, core, config, name = 'pwatest-course-rewards-v1' } = options;
  // 单个 readwrite 事务原子保存去重凭证、累计记录、英雄和轮次；跨标签页也由 IDB 串行化。
  let connection;
  function open() {
    if (connection) return connection;
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('state');
      request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); connection = null; }; resolve(db); };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(Error('请关闭旧标签页后重试'));
    }).catch(error => { connection = null; throw error; });
    return connection;
  }
  async function transaction(change) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('state', change ? 'readwrite' : 'readonly');
      const store = tx.objectStore('state'); const request = store.get('snapshot');
      let state, value, failure;
      request.onsuccess = () => {
        try {
          state = core.validate(request.result || core.empty());
          if (change) { value = change(state); store.put(state, 'snapshot'); }
        } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => resolve(change ? value : state);
      tx.onabort = tx.onerror = () => reject(failure || tx.error || Error('学习记录保存失败'));
    });
  }
  return {
    read: () => transaction(),
    bind: (courseId, videoId) => transaction(state => core.bind(state, config, courseId, videoId)),
    relink: (oldId, newId) => transaction(state => core.relink(state, oldId, newId)),
    complete: event => transaction(state => core.complete(state, config, event)),
    acknowledge: id => transaction(state => { state.feedback = state.feedback.filter(item => item.id !== id); })
  };
});
