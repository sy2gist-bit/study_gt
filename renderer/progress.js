/* progress.js — 진도 저장/복원. 콘텐츠 id(meta.id)로 네임스페이스를 나눠
   콘텐츠가 바뀌어도 서로 섞이지 않게 한다 (지시서 §7.2). 도메인 중립. */
(function (global) {
  "use strict";

  function Progress(contentId) {
    this.ns = "study-guide::" + contentId + "::";
  }

  Progress.prototype._key = function (k) { return this.ns + k; };

  Progress.prototype.get = function (k, fallback) {
    try {
      var raw = localStorage.getItem(this._key(k));
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) { return fallback; }
  };

  Progress.prototype.set = function (k, v) {
    try { localStorage.setItem(this._key(k), JSON.stringify(v)); }
    catch (e) { /* localStorage 불가(프라이빗 모드 등) — 조용히 무시, 세션 내 메모리로만 동작 */ }
  };

  // 체크박스류 집합 진도 (완료된 id 집합)
  Progress.prototype.getSet = function (k) {
    var arr = this.get(k, []);
    return new Set(Array.isArray(arr) ? arr : []);
  };
  Progress.prototype.toggleInSet = function (k, id) {
    var s = this.getSet(k);
    if (s.has(id)) s.delete(id); else s.add(id);
    this.set(k, Array.from(s));
    return s;
  };

  global.StudyProgress = Progress;
})(window);
