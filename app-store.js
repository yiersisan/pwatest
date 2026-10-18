"use strict";
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;
  else root.AppStore = factory(root.indexedDB, root.AppCore);
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  function (indexedDB, core, name = "pwatest-local-v1") {
    let connection;
    function open() {
      if (connection) return connection;
      connection = new Promise((resolve, reject) => {
        if (!indexedDB) {
          reject(Error("当前浏览器无法使用本地数据库"));
          return;
        }
        const r = indexedDB.open(name, 1);
        r.onupgradeneeded = () => r.result.createObjectStore("state");
        r.onerror = () => reject(r.error);
        r.onblocked = () =>
          reject(Error("数据库正被其他页面使用，请关闭其他学习岛页面后重试"));
        r.onsuccess = () => {
          const db = r.result;
          db.onversionchange = () => {
            db.close();
            connection = null;
          };
          resolve(db);
        };
      }).catch((e) => {
        connection = null;
        throw e;
      });
      return connection;
    }
    async function transaction(edit, expected) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("state", "readwrite"),
          store = tx.objectStore("state"),
          r = store.get("snapshot");
        let state, result, error;
        r.onsuccess = () => {
          try {
            state = core.validate(r.result || core.initial());
            if (expected !== undefined && state.revision !== expected)
              throw Error("其他页面已更新数据，请重新打开当前页面后修改");
            if (edit) {
              result = edit(state);
              if (result && typeof result.then === "function")
                throw Error("数据库事务中不能异步读取文件");
              state.revision++;
            }
            if (core.upgradeCoverPool(state)) state.revision++;
            // Store the selection in the same transaction as imports/progress.
            // Scheduling is derived metadata, not a separate user edit revision.
            core.syncTodayTasks(state);
            state = core.validate(state);
            store.put(state, "snapshot");
          } catch (e) {
            error = e;
            tx.abort();
          }
        };
        tx.oncomplete = () => resolve({ state, result });
        tx.onabort = tx.onerror = () =>
          reject(error || tx.error || Error("本地数据保存失败"));
      });
    }
    return {
      read: async () => (await transaction()).state,
      update: (edit, expected) => transaction(edit, expected),
      replace: (input, expected) =>
        transaction((state) => {
          const clean = core.validate(input),
            revision = state.revision;
          Object.keys(state).forEach((k) => delete state[k]);
          Object.assign(state, clean, { revision });
        }, expected),
      close: async () => {
        if (connection) (await connection).close();
        connection = null;
      },
    };
  },
);
