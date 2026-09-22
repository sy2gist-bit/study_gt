/* render.js — 뼈대 오케스트레이터. content JSON + adapter JSON 을 읽어
   전체 페이지를 구성한다. 이 파일에 특정 과목/콘텐츠 이름이 등장하면 실패다. */
(function (global) {
  "use strict";
  var B = global.StudyBlocks;

  var TAB_ORDER = ["guide", "read", "study", "cards", "output"];
  var TAB_COLOR = { guide: "ink", read: "blue", study: "blue", cards: "teal", output: "orange" };

  function qs(sel) { return document.querySelector(sel); }
  function htmlToPlainText(html) {
    var d = document.createElement("div");
    d.innerHTML = html;
    return d.textContent || "";
  }
  function qp(name, fallback) {
    var v = new URLSearchParams(location.search).get(name);
    return v || fallback;
  }

  function App() {
    this.root = document.body;
  }

  App.prototype.boot = function () {
    var self = this;
    var contentId = qp("content", null);

    if (!contentId) {
      this.renderPicker();
      return;
    }

    this.loadContentAndAdapter(contentId)
      .then(function (result) {
        self.content = result.content;
        self.adapter = result.adapter;
        self.progress = new global.StudyProgress(self.content.meta.id);
        self.init();
      })
      .catch(function (err) {
        document.body.innerHTML = '<div style="padding:40px;font-family:monospace;white-space:pre-wrap;">콘텐츠를 불러오지 못했습니다.\n' +
          'renderer/index.html 은 반드시 웹 서버로 열어야 합니다 (file:// 직접 열기는 fetch() 가 차단됩니다).\n' +
          '예: 이 폴더에서 `python3 -m http.server 8000` 실행 후 http://localhost:8000/renderer/?content=' + contentId + ' 접속.\n\n' +
          String(err);
      });
  };

  // 정적 파일(content/*.json, adapters/*.json)을 먼저 찾고, 없으면 이 브라우저에
  // 저장된(IndexedDB) 사용자 생성 콘텐츠/어댑터에서 찾는다 — "새 자료로 만들기"로
  // 만든 콘텐츠도 똑같은 방식(?content=id)으로 열 수 있게 하기 위함.
  function fetchJson(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error("not found: " + path);
      return r.json();
    });
  }
  App.prototype.loadContentAndAdapter = function (contentId) {
    return fetchJson("../content/" + contentId + ".json")
      .catch(function () {
        if (!global.StudyStorage) throw new Error("콘텐츠를 찾을 수 없습니다: " + contentId);
        return global.StudyStorage.getContent(contentId).then(function (c) {
          if (!c) throw new Error("콘텐츠를 찾을 수 없습니다: " + contentId);
          return c;
        });
      })
      .then(function (content) {
        return fetchJson("../adapters/" + content.adapter + ".json")
          .catch(function () {
            if (!global.StudyStorage) throw new Error("어댑터를 찾을 수 없습니다: " + content.adapter);
            return global.StudyStorage.getAdapter(content.adapter).then(function (a) {
              if (!a) throw new Error("어댑터를 찾을 수 없습니다: " + content.adapter);
              return a;
            });
          })
          .then(function (adapter) { return { content: content, adapter: adapter }; });
      });
  };

  // 쿼리 파라미터 없이 열었을 때: manifest 를 읽어 콘텐츠 선택 화면을 보여준다.
  // 렌더러 자체에는 어떤 콘텐츠 id도 하드코딩하지 않는다 (수용 테스트 A).
  // 정적 콘텐츠에 더해, 이 브라우저에 저장된 사용자 생성 콘텐츠도 함께 보여주고
  // "새 자료로 만들기" 카드로 ingest 모달을 연다.
  App.prototype.renderPicker = function () {
    var staticList = fetch("../content/manifest.json")
      .then(function (r) { return r.json(); })
      .then(function (list) {
        return Promise.all(list.map(function (entry) {
          return fetch("../content/" + entry.id + ".json").then(function (r) { return r.json(); })
            .then(function (c) { return { id: entry.id, title: c.meta.title, subtitle: c.meta.subtitle, eyebrow: c.meta.eyebrow, local: false }; });
        }));
      })
      .catch(function () { return []; });

    var storedList = (global.StudyStorage ? global.StudyStorage.listContents() : Promise.resolve([]))
      .then(function (list) {
        return list.map(function (c) {
          return { id: c.meta.id, title: c.meta.title, subtitle: c.meta.subtitle, eyebrow: c.meta.eyebrow, local: true };
        });
      })
      .catch(function () { return []; });

    Promise.all([staticList, storedList]).then(function (pair) {
      var items = pair[0].concat(pair[1]);
      document.body.innerHTML =
        '<div class="wrap"><div class="hero"><span class="eyebrow">스터디 가이드</span><h1>학습할 콘텐츠를 선택하세요</h1></div>' +
        '<div class="picker-grid" id="picker-grid"></div></div>';

      var grid = qs("#picker-grid");
      items.forEach(function (it) {
        // 자르기는 이스케이프 "전에" 해야 한다 — 이스케이프된 문자열을 자르면
        // &amp; 같은 엔티티가 중간에서 끊겨 깨진 글자가 남는다. 120자를 넘을
        // 때만 말줄임표를 붙인다.
        var sub = htmlToPlainText(it.subtitle || "");
        var a = document.createElement("a");
        a.href = "?content=" + encodeURIComponent(it.id);
        a.className = "picker-card";
        a.innerHTML =
          '<div class="eyebrow">' + B.esc(it.eyebrow || "") + (it.local ? ' <span class="local-badge">내 자료</span>' : '') + '</div>' +
          '<div class="picker-title">' + B.esc(it.title || "(제목 없음)") + '</div>' +
          '<div class="picker-sub">' + B.esc(sub.length > 120 ? sub.slice(0, 120) + "…" : sub) + '</div>';
        grid.appendChild(a);
      });

      var newCard = document.createElement("button");
      newCard.type = "button";
      newCard.className = "picker-card picker-card-new";
      newCard.innerHTML =
        '<div class="picker-new-plus">+</div>' +
        '<div class="picker-title">새 자료로 만들기</div>' +
        '<div class="picker-sub">PDF·사진·텍스트 파일을 올리면 이 브라우저에서 바로 학습 콘텐츠를 만듭니다. 클로드ai 없이도 동작합니다.</div>';
      newCard.addEventListener("click", function () {
        if (!global.StudyIngestUI) { alert("생성 기능을 불러오지 못했습니다. 페이지를 새로고침 해보세요."); return; }
        global.StudyIngestUI.openModal({
          onDone: function (content) { location.href = "?content=" + encodeURIComponent(content.meta.id); }
        });
      });
      grid.appendChild(newCard);
    });
  };

  App.prototype.init = function () {
    var content = this.content, adapter = this.adapter, self = this;

    global.StudyNav = {
      gotoTab: function (tab) { self.showTab(tab); },
      gotoModule: function (id) {
        self.showTab("study");
        setTimeout(function () {
          var el = document.getElementById("mod-" + id);
          if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); el.classList.add("nav-flash"); setTimeout(function () { el.classList.remove("nav-flash"); }, 1200); }
        }, 30);
      },
      gotoParagraph: function (id) {
        self.showTab("read");
        setTimeout(function () {
          var el = document.getElementById("para-" + id);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 30);
      }
    };

    this.renderHero();
    this.renderTabbar();
    this.renderGuide();
    this.renderRead();
    this.renderStudy();
    this.cards = new global.StudyCards(this.root, content, adapter, this.progress);
    this.output = new global.StudyOutput(this.root, content, adapter);
    this.renderWeakBox();
    global.addEventListener("study:weakpoints-changed", this.renderWeakBox.bind(this));
    qs("#app-footer").textContent = (content.meta.sourceRef || "") + " · " + adapter.label + " 어댑터 · schema " + content.schemaVersion;

    this.showTab("guide");
  };

  // ── HERO / PITCH ─────────────────────────────────────────
  App.prototype.renderHero = function () {
    var m = this.content.meta;
    document.title = m.title || "스터디 가이드";
    qs("#hero-eyebrow").textContent = m.eyebrow || "";
    qs("#hero-title").textContent = m.title || "";
    qs("#hero-sub").innerHTML = B.sanitizeHtml(m.subtitle || "");
    qs("#hero-pills").innerHTML = (m.pills || []).map(function (p) { return '<span class="pill">' + B.esc(p) + "</span>"; }).join("");
    qs("#pitch-text").innerHTML = B.sanitizeHtml(m.oneLiner || "");
  };

  // ── TAB BAR ──────────────────────────────────────────────
  App.prototype.renderTabbar = function () {
    var self = this;
    var adapter = this.adapter;
    var bar = qs("#tabbar");
    var tags = adapter.stageTags || [];
    bar.innerHTML = TAB_ORDER.map(function (tab, i) {
      var label = (adapter.tabLabels && adapter.tabLabels[tab]) || tab;
      return '<button class="tab-btn" data-tab="' + tab + '" role="tab" aria-selected="false" ' +
        'style="--tab-color:var(--' + TAB_COLOR[tab] + ')">' + B.esc(label) +
        (tags[i] ? ' <span class="tag">' + B.esc(tags[i]) + "</span>" : "") + "</button>";
    }).join("");
    Array.from(bar.querySelectorAll(".tab-btn")).forEach(function (btn) {
      btn.addEventListener("click", function () { self.showTab(btn.dataset.tab); });
    });
  };

  App.prototype.showTab = function (tab) {
    TAB_ORDER.forEach(function (t) {
      var panel = qs('[data-panel="' + t + '"]');
      if (panel) panel.hidden = (t !== tab);
      var btn = qs('.tab-btn[data-tab="' + t + '"]');
      if (btn) btn.setAttribute("aria-selected", String(t === tab));
    });
  };

  // ── GUIDE TAB ────────────────────────────────────────────
  App.prototype.renderGuide = function () {
    var self = this, content = this.content, progress = this.progress;
    var g = content.guide || {};
    qs("#guide-headline").textContent = g.headline || "";
    qs("#guide-intro-text").innerHTML = B.sanitizeHtml(g.intro || "");
    qs("#guide-closing").innerHTML = B.sanitizeHtml(g.closingCallout || "");

    var done = progress.getSet("guideDone");
    var steps = g.steps || [];

    function renderProgress() {
      var d = progress.getSet("guideDone");
      qs("#guide-progress-text").textContent = d.size + " / " + steps.length + " 단계 완료";
      qs("#guide-progress-fill").style.width = (steps.length ? Math.round((d.size / steps.length) * 100) : 0) + "%";
    }

    qs("#guide-steps").innerHTML = steps.map(function (s) {
      var isDone = done.has(String(s.n));
      var links = (s.links || []).map(function (l) {
        return '<button type="button" class="goto-link" data-tab="' + B.esc(l.tab) + '" data-anchor="' + B.esc(l.anchor || "") + '">' + B.esc(l.label) + "</button>";
      }).join("");
      return '<div class="guide-step' + (isDone ? " gs-done" : "") + '" data-step="' + s.n + '">' +
        '<div class="guide-step-head"><span class="gs-num">' + s.n + '</span><h3>' + B.esc(s.title) + '</h3>' +
        '<span class="guide-time">약 ' + s.minutes + '분</span>' +
        '<label class="chk"><input type="checkbox" data-guide-step="' + s.n + '"' + (isDone ? " checked" : "") + '> 완료</label></div>' +
        '<p>' + B.sanitizeHtml(s.body || "") + '</p>' +
        (links ? '<div class="guide-links">' + links + '</div>' : "") +
        '</div>';
    }).join("");

    Array.from(qs("#guide-steps").querySelectorAll("[data-guide-step]")).forEach(function (chk) {
      chk.addEventListener("change", function () {
        progress.toggleInSet("guideDone", chk.dataset.guideStep);
        chk.closest(".guide-step").classList.toggle("gs-done", chk.checked);
        renderProgress();
      });
    });
    Array.from(qs("#guide-steps").querySelectorAll(".goto-link")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tab = btn.dataset.tab, anchor = btn.dataset.anchor;
        if (tab === "study" && anchor) global.StudyNav.gotoModule(anchor);
        else if (tab === "read" && anchor) { self.showTab("read"); global.StudyNav.gotoParagraph(anchor); }
        else global.StudyNav.gotoTab(tab);
      });
    });

    renderProgress();
  };

  // ── READ TAB ─────────────────────────────────────────────
  App.prototype.renderRead = function () {
    var content = this.content, adapter = this.adapter, progress = this.progress;
    var src = content.source || {};
    var sections = src.sections || [];
    var totalParas = sections.reduce(function (n, s) { return n + (s.paragraphs || []).length; }, 0);

    qs("#read-toc-links").innerHTML = sections.map(function (s) {
      return '<a data-jump="' + B.esc(s.id) + '">' + B.esc(s.navLabel || s.title) + "</a>";
    }).join("");
    Array.from(qs("#read-toc-links").querySelectorAll("a")).forEach(function (a) {
      a.addEventListener("click", function () {
        var el = document.getElementById("sec-" + a.dataset.jump);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    var toggleBtn = qs("#trans-toggle-btn");
    var label = adapter.assistLabelDefault || src.assistLabel || "보조 해설";
    var hidden = (src.assistToggleDefault === "hidden");
    function syncToggleLabel() {
      toggleBtn.textContent = (hidden ? label + " 보기" : label + " 숨기기");
      toggleBtn.setAttribute("aria-pressed", String(!hidden));
      qs("#panel-read").classList.toggle("hide-trans", hidden);
    }
    toggleBtn.addEventListener("click", function () { hidden = !hidden; syncToggleLabel(); });
    syncToggleLabel();

    function renderReadProgress() {
      var done = progress.getSet("readDone");
      qs("#read-progress-text").textContent = done.size + " / " + totalParas + " 문단 완료";
      qs("#read-progress-fill").style.width = (totalParas ? Math.round((done.size / totalParas) * 100) : 0) + "%";
    }

    var doneSet = progress.getSet("readDone");
    qs("#read-sections").innerHTML = sections.map(function (sec) {
      var paras = (sec.paragraphs || []).map(function (p) {
        var isDone = doneSet.has(p.id);
        return '<div class="para-card" id="para-' + B.esc(p.id) + '">' +
          '<div class="para-head"><span class="para-tag">' + B.esc(p.tag || "") + '</span>' +
          '<div class="para-head-right"><label class="chk"><input type="checkbox" data-para="' + B.esc(p.id) + '"' + (isDone ? " checked" : "") + '> 이해완료</label></div></div>' +
          '<p class="para-orig">' + B.sanitizeHtml(p.original || "") + '</p>' +
          '<div class="para-trans"><span class="tr-label">' + B.esc(label) + '</span><p>' + B.sanitizeHtml(p.assist || "") + '</p></div>' +
          (p.guide ? '<div class="para-guide"><span class="g-label">이해 가이드</span><p>' + B.sanitizeHtml(p.guide) + '</p></div>' : "") +
          '</div>';
      }).join("");
      return '<section id="sec-' + B.esc(sec.id) + '" class="mod"><div class="mod-head"><h2>' + B.esc(sec.title) + '</h2></div>' +
        '<div class="mod-body">' + paras + '</div></section>';
    }).join("");

    Array.from(qs("#read-sections").querySelectorAll("[data-para]")).forEach(function (chk) {
      chk.addEventListener("change", function () {
        progress.toggleInSet("readDone", chk.dataset.para);
        renderReadProgress();
      });
    });
    renderReadProgress();
  };

  // ── STUDY TAB ────────────────────────────────────────────
  App.prototype.renderStudy = function () {
    var content = this.content, adapter = this.adapter, progress = this.progress;
    var mods = content.modules || [];
    var mount = qs("#study-modules");
    mount.innerHTML = "";

    var doneSet = progress.getSet("moduleDone");
    mods.forEach(function (m) {
      var cat = (adapter.moduleCategories || []).filter(function (c) { return c.id === m.category; })[0] || { color: "gray" };
      var style = B.catStyle(cat.color);
      var section = B.el("section", "mod");
      section.id = "mod-" + m.id;
      section.style.cssText = style;
      var isDone = doneSet.has(m.id);
      var head = B.el("div", "mod-head",
        '<span class="idx">' + B.esc((m.id + "").replace(/^m/, "")) + '</span>' +
        "<h2>" + B.esc(m.title) + "</h2>" +
        '<label class="chk"><input type="checkbox"' + (isDone ? " checked" : "") + '> 완료</label>');
      var body = B.el("div", "mod-body");
      (m.blocks || []).forEach(function (b) { body.appendChild(B.renderBlock(b, { adapter: adapter })); });
      section.appendChild(head);
      section.appendChild(body);
      mount.appendChild(section);

      head.querySelector("input[type=checkbox]").addEventListener("change", function (e) {
        progress.toggleInSet("moduleDone", m.id);
      });
    });
  };

  // ── 취약 지점 집계 (§7.5) ────────────────────────────────
  App.prototype.renderWeakBox = function () {
    if (!this.cards) return;
    var weak = this.cards.getWeakest(3);
    var box = qs("#weak-box");
    if (!weak.length) { box.hidden = true; return; }
    box.hidden = false;
    qs("#weak-list").innerHTML = weak.map(function (w) {
      return '<div class="weak-item"><span>' + B.esc(w.q) + '</span><span class="w-count">틀린 횟수 ' + w.count + '</span></div>';
    }).join("");
  };

  document.addEventListener("DOMContentLoaded", function () {
    new App().boot();
  });
})(window);
