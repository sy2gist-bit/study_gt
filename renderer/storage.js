/* storage.js — IndexedDB 레이어. 사용자가 이 브라우저에서 직접 생성한
   콘텐츠·어댑터·설정(Anthropic API 키 포함)을 저장한다. 이 파일도 도메인
   중립이며, 어떤 서버로도 데이터를 보내지 않는다 — 전부 이 기기 안에만. */
(function (global) {
  "use strict";

  var DB_NAME = "study-loop";
  // v2: "contents" 의 keyPath 를 "id" → "meta.id" 로 수정 (content JSON 은
  // schemaVersion/adapter/meta/… 구조라 최상위에 id가 없고 meta.id 에 있음).
  var DB_VERSION = 2;
  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!("indexedDB" in global)) { reject(new Error("이 브라우저는 IndexedDB를 지원하지 않습니다.")); return; }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (event) {
        var db = req.result;
        // v1 은 "contents" 의 keyPath 가 "id" 로 잘못 잡혀 있었다. 그 버전에서
        // 올라오는 경우에만 스토어를 다시 만든다 — oldVersion 을 보지 않고 매번
        // 지우면 나중에 DB_VERSION 을 올릴 때마다 사용자가 만든 콘텐츠가 통째로
        // 날아간다(이 앱에서 사용자 콘텐츠는 이 DB에만 있고 복구 경로가 없다).
        if (event.oldVersion < 2 && db.objectStoreNames.contains("contents")) {
          db.deleteObjectStore("contents");
        }
        if (!db.objectStoreNames.contains("contents")) db.createObjectStore("contents", { keyPath: "meta.id" });
        if (!db.objectStoreNames.contains("adapters")) db.createObjectStore("adapters", { keyPath: "id" });
        if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function tx(storeName, mode) {
    return openDb().then(function (db) {
      return db.transaction(storeName, mode).objectStore(storeName);
    });
  }

  function reqToPromise(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  var Storage = {
    // ── 콘텐츠 ──────────────────────────────────────────
    listContents: function () {
      return tx("contents", "readonly").then(function (store) { return reqToPromise(store.getAll()); })
        .catch(function () { return []; });
    },
    getContent: function (id) {
      return tx("contents", "readonly").then(function (store) { return reqToPromise(store.get(id)); })
        .catch(function () { return undefined; });
    },
    saveContent: function (contentObj) {
      return tx("contents", "readwrite").then(function (store) { return reqToPromise(store.put(contentObj)); });
    },
    deleteContent: function (id) {
      return tx("contents", "readwrite").then(function (store) { return reqToPromise(store.delete(id)); });
    },

    // ── 어댑터 ──────────────────────────────────────────
    listAdapters: function () {
      return tx("adapters", "readonly").then(function (store) { return reqToPromise(store.getAll()); })
        .catch(function () { return []; });
    },
    getAdapter: function (id) {
      return tx("adapters", "readonly").then(function (store) { return reqToPromise(store.get(id)); })
        .catch(function () { return undefined; });
    },
    saveAdapter: function (adapterObj) {
      return tx("adapters", "readwrite").then(function (store) { return reqToPromise(store.put(adapterObj)); });
    },

    // ── 설정 (API 키 등 — 이 브라우저에만 저장, 서버 전송 없음) ──
    getSetting: function (key) {
      return tx("settings", "readonly").then(function (store) { return reqToPromise(store.get(key)); })
        .then(function (row) { return row ? row.value : undefined; })
        .catch(function () { return undefined; });
    },
    setSetting: function (key, value) {
      return tx("settings", "readwrite").then(function (store) { return reqToPromise(store.put({ key: key, value: value })); });
    }
  };

  global.StudyStorage = Storage;
})(window);
