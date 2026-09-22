/* ingest-ui.js — "새 자료로 만들기" 모달. ingest.js(추출+생성 파이프라인)와
   storage.js(IndexedDB)를 연결하는 UI 레이어. 이 파일에도 특정 과목/콘텐츠
   이름을 하드코딩하지 않는다.
   (Gemini 등 다른 엔진 연동은 보류 상태 — Claude(Anthropic) 단일 엔진만 쓴다.) */
(function (global) {
  "use strict";
  var B = global.StudyBlocks;

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  // 기존 어댑터 목록(정적 파일 + 이 브라우저에 저장된 것)을 모은다.
  // stageAdapter 단계에서 "이미 맞는 과목 설정이 있으면 재사용" 판단에 쓰인다.
  function collectExistingAdapters() {
    var staticAdapters = fetch("../content/manifest.json")
      .then(function (r) { return r.json(); })
      .then(function (list) {
        var ids = [];
        list.forEach(function (e) { if (e.adapter && ids.indexOf(e.adapter) < 0) ids.push(e.adapter); });
        return Promise.all(ids.map(function (id) {
          return fetch("../adapters/" + id + ".json").then(function (r) { return r.json(); });
        }));
      })
      .catch(function () { return []; });
    var storedAdapters = global.StudyStorage ? global.StudyStorage.listAdapters().catch(function () { return []; }) : Promise.resolve([]);
    return Promise.all([staticAdapters, storedAdapters]).then(function (pair) { return pair[0].concat(pair[1]); });
  }

  function openModal(opts) {
    opts = opts || {};
    if (!global.StudyIngest || !global.StudyStorage) {
      alert("자료 생성 기능을 불러오지 못했습니다. 페이지를 새로고침 해보세요.");
      return;
    }

    var backdrop = el("div", "ingest-backdrop");
    var modal = el("div", "ingest-modal");
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    modal.innerHTML = '<div class="ing-loading">불러오는 중…</div>';

    // running 상태일 때는 배경 클릭/Esc 로 실수로 닫혀서 진행 중이던 생성 작업이
    // 화면에서만 사라지고 그대로 백그라운드에서 계속 돌아가는(비용 낭비 + 재시작 필요)
    // 문제를 막는다. requestClose() 가 유일한 닫기 경로다.
    var runningRef = { current: false };
    var controllerRef = { current: null };

    function requestClose() {
      if (runningRef.current) {
        var ok = confirm("생성이 진행 중입니다. 지금 중단할까요? 지금까지 진행된 내용은 저장되지 않습니다.");
        if (!ok) return;
        if (controllerRef.current) controllerRef.current.abort();
        runningRef.current = false;
      }
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
    }
    function onKey(e) { if (e.key === "Escape") requestClose(); }

    backdrop.addEventListener("click", function (e) { if (e.target === backdrop) requestClose(); });
    document.addEventListener("keydown", onKey);

    Promise.all([
      global.StudyStorage.getSetting("anthropicApiKey"),
      global.StudyStorage.getSetting("anthropicModel"),
      collectExistingAdapters()
    ]).then(function (res) {
      // 예전에 저장해둔 모델 ID가 곧 퇴역 예정인 구버전(claude-sonnet-4-5-20250929)이면
      // 무시하고 최신 기본값을 쓴다 — 안 그러면 브라우저에 저장된 값 때문에 계속
      // 옛 모델을 호출하게 된다. 사용자가 "고급 설정"에서 다른 모델을 직접 넣어뒀다면
      // (RETIRING_MODELS에 없는 값) 그대로 존중한다.
      var savedModel = res[1] || "";
      var RETIRING_MODELS = ["claude-sonnet-4-5-20250929"];
      var model = (savedModel && RETIRING_MODELS.indexOf(savedModel) < 0) ? savedModel : global.StudyIngest.DEFAULT_MODEL;
      renderForm(modal, {
        apiKey: res[0] || "",
        model: model,
        existingAdapters: res[2] || []
      }, requestClose, opts, runningRef, controllerRef);
    }).catch(function (err) {
      modal.innerHTML = '<div class="ing-loading">불러오지 못했습니다: ' + B.esc(String(err)) + '</div>';
    });
  }

  function renderForm(modal, state, requestClose, opts, runningRef, controllerRef) {
    modal.innerHTML =
      '<div class="ingest-head"><h2>새 자료로 학습 콘텐츠 만들기</h2><button type="button" class="ingest-close" aria-label="닫기">✕</button></div>' +
      '<div class="ingest-body">' +
        '<label class="ing-field"><span>Anthropic API 키</span><input type="password" id="ing-apikey" placeholder="sk-ant-..." autocomplete="off"></label>' +
        '<p class="ing-hint">이 키는 이 브라우저(이 기기)에만 저장되고, Anthropic 서버로만 전송됩니다. 다른 어떤 서버로도 보내지 않으며 클로드ai 계정과도 무관합니다.</p>' +
        '<label class="ing-field"><span>학습 자료 파일 <span class="ing-optional">(PDF · JPG/PNG 사진 · TXT · MD, 여러 개 선택 가능)</span></span>' +
        '<input type="file" id="ing-files" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.txt,.md,.markdown"></label>' +
        '<div class="ing-row">' +
          '<label class="ing-field ing-inline"><span>학습 목적</span><select id="ing-mode"><option value="exam">시험 대비</option><option value="presentation">발표 준비</option></select></label>' +
          '<label class="ing-field ing-inline"><span>목표일 <span class="ing-optional">(선택)</span></span><input type="date" id="ing-date"></label>' +
        '</div>' +
        '<details class="ing-adv"><summary>고급 설정</summary>' +
        '<label class="ing-field"><span>모델 ID</span><input type="text" id="ing-model" value="' + B.esc(state.model) + '"></label>' +
        '<p class="ing-hint">Anthropic Console에서 확인한 모델 이름을 그대로 입력하세요. 잘 모르면 기본값을 그대로 두세요.</p>' +
        '</details>' +
        '<div class="ing-progress" id="ing-progress" hidden></div>' +
        '<div class="ing-error" id="ing-error" hidden></div>' +
      '</div>' +
      '<div class="ingest-foot"><button type="button" class="btn-ghost" id="ing-cancel">취소</button><button type="button" class="btn-primary" id="ing-start">생성 시작</button></div>';

    modal.querySelector("#ing-apikey").value = state.apiKey;
    modal.querySelector(".ingest-close").addEventListener("click", requestClose);
    modal.querySelector("#ing-cancel").addEventListener("click", requestClose);

    modal.querySelector("#ing-start").addEventListener("click", function () {
      var apiKey = modal.querySelector("#ing-apikey").value.trim();
      var model = modal.querySelector("#ing-model").value.trim() || global.StudyIngest.DEFAULT_MODEL;
      var files = modal.querySelector("#ing-files").files;
      var mode = modal.querySelector("#ing-mode").value;
      var targetDate = modal.querySelector("#ing-date").value || null;
      var errBox = modal.querySelector("#ing-error");
      errBox.hidden = true;

      if (!apiKey) { showError(errBox, "API 키를 입력하세요."); return; }
      if (!files || !files.length) { showError(errBox, "파일을 1개 이상 선택하세요."); return; }

      global.StudyStorage.setSetting("anthropicApiKey", apiKey);
      global.StudyStorage.setSetting("anthropicModel", model);

      setRunning(modal, true, runningRef);
      var progBox = modal.querySelector("#ing-progress");
      progBox.hidden = false;
      progBox.innerHTML = "";
      function addStep(label) {
        var line = el("div", "ing-step", '<span class="ing-dot"></span>' + B.esc(label));
        progBox.appendChild(line);
        progBox.scrollTop = progBox.scrollHeight;
      }

      var controller = (typeof AbortController !== "undefined") ? new AbortController() : null;
      controllerRef.current = controller;

      global.StudyIngest.generate({
        apiKey: apiKey, model: model,
        files: files, mode: mode, targetDate: targetDate,
        existingAdapters: state.existingAdapters,
        onProgress: addStep,
        signal: controller ? controller.signal : undefined
      }).then(function (content) {
        addStep("완료! 학습 화면으로 이동합니다…");
        setRunning(modal, false, runningRef);
        controllerRef.current = null;
        if (opts.onDone) opts.onDone(content);
        requestClose();
      }).catch(function (err) {
        setRunning(modal, false, runningRef);
        controllerRef.current = null;
        if (err && err.name === "AbortError") return; // 사용자가 직접 중단 — 이미 모달 닫힘, 에러로 보여줄 필요 없음
        showError(errBox, (err && err.message) || String(err));
      });
    });
  }

  // 진행 중에는 시작 버튼·입력 필드만 잠근다. 닫기(✕)·취소 버튼은 계속 눌러서
  // requestClose() 로 "중단할지" 확인받을 수 있어야 한다 — 안 그러면 진행 중
  // 화면을 벗어날 방법이 없어진다.
  function setRunning(modal, running, runningRef) {
    runningRef.current = running;
    Array.prototype.forEach.call(modal.querySelectorAll("input,select,#ing-start"), function (elx) { elx.disabled = running; });
    var cancelBtn = modal.querySelector("#ing-cancel");
    if (cancelBtn) cancelBtn.textContent = running ? "생성 중단" : "취소";
  }
  function showError(box, msg) { box.hidden = false; box.textContent = msg; }

  global.StudyIngestUI = { openModal: openModal };
})(window);
