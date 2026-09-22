/* flashcard.js — 카드 암기 엔진. 도메인 중립.
   간격 반복(FSRS)은 vendor/fsrs.bundle.js(ts-fsrs, MIT, 공식 오픈소스 구현)를
   그대로 사용한다. 직접 구현하지 않는다 (지시서 §7.1 / 하지 말 것 #7). */
(function (global) {
  "use strict";
  var B = global.StudyBlocks;

  function StudyCards(root, content, adapter, progress) {
    this.root = root;
    this.content = content;
    this.adapter = adapter;
    this.progress = progress;
    this.cards = content.cards || [];
    this.activeCats = new Set(); // 비어있으면 = 전체
    this.queue = [];
    this.qi = 0;
    this.flipped = false;

    this.fsrs = FSRS.fsrs(FSRS.generatorParameters({ enable_fuzz: true, enable_short_term: true }));

    this._loadStates();
    this._buildChips();
    this._buildQueue();
    this._bindActions();
    this.render();
  }

  StudyCards.prototype._loadStates = function () {
    var raw = this.progress.get("cardStates", {});
    var states = {};
    var self = this;
    this.cards.forEach(function (c) {
      var s = raw[c.id];
      if (s) {
        states[c.id] = Object.assign({}, s, {
          due: new Date(s.due),
          last_review: s.last_review ? new Date(s.last_review) : undefined
        });
      } else {
        states[c.id] = FSRS.createEmptyCard(new Date());
      }
    });
    this.states = states;
    this.lapses = this.progress.get("cardLapses", {}); // { cardId: count }
  };

  StudyCards.prototype._saveStates = function () {
    var out = {};
    Object.keys(this.states).forEach(function (id) {
      var s = this.states[id];
      out[id] = {
        due: s.due.toISOString(),
        stability: s.stability, difficulty: s.difficulty,
        elapsed_days: s.elapsed_days, scheduled_days: s.scheduled_days,
        learning_steps: s.learning_steps, reps: s.reps, lapses: s.lapses,
        state: s.state,
        last_review: s.last_review ? s.last_review.toISOString() : null
      };
    }, this);
    this.progress.set("cardStates", out);
    this.progress.set("cardLapses", this.lapses);
  };

  StudyCards.prototype._buildChips = function () {
    var self = this;
    var cats = (this.adapter.cardCategories || []);
    var row = this.root.querySelector("#card-chip-row");
    row.innerHTML = "";
    var allChip = B.el("button", "chip", "전체");
    allChip.type = "button";
    allChip.setAttribute("aria-pressed", "true");
    allChip.addEventListener("click", function () { self.activeCats.clear(); self._onFilterChange(); });
    row.appendChild(allChip);
    cats.forEach(function (cat) {
      var chip = B.el("button", "chip", B.esc(cat.label));
      chip.type = "button";
      chip.dataset.cat = cat.id;
      chip.style.cssText = "--chip-color:var(--" + (B.PALETTE.indexOf(cat.color) >= 0 ? cat.color : "gray") + ");";
      chip.setAttribute("aria-pressed", "false");
      chip.addEventListener("click", function () {
        if (self.activeCats.has(cat.id)) self.activeCats.delete(cat.id);
        else self.activeCats.add(cat.id);
        self._onFilterChange();
      });
      row.appendChild(chip);
    });
    this._allChip = allChip;
    this._chips = Array.from(row.querySelectorAll(".chip[data-cat]"));
  };

  StudyCards.prototype._onFilterChange = function () {
    this._allChip.setAttribute("aria-pressed", String(this.activeCats.size === 0));
    this._chips.forEach(function (c) {
      c.setAttribute("aria-pressed", String(this.activeCats.has(c.dataset.cat)));
    }, this);
    this._buildQueue();
    this.render();
  };

  StudyCards.prototype._matchesFilter = function (card) {
    return this.activeCats.size === 0 || this.activeCats.has(card.category);
  };

  StudyCards.prototype._buildQueue = function () {
    var self = this;
    var now = new Date();
    var due = this.cards.filter(function (c) {
      return self._matchesFilter(c) && self.states[c.id].due <= now;
    });
    // 핵심(core) 우선, 그 다음 마감 임박 순
    due.sort(function (a, b) {
      if (a.priority !== b.priority) return a.priority === "core" ? -1 : 1;
      return self.states[a.id].due - self.states[b.id].due;
    });
    this.queue = due;
    this.qi = 0;
    this.flipped = false;
  };

  // 생성자에서 딱 한 번만 부른다. 여기서 붙이는 document keydown 리스너를 두 번
  // 붙이면 스페이스 한 번에 _flip() 이 두 번 실행돼 뒤집기가 제자리로 돌아온다 —
  // 그래서 렌더 중에 생기는 툴바 버튼은 _bindToolbarActions() 로 분리했다.
  StudyCards.prototype._bindActions = function () {
    var self = this;
    this.root.querySelector("#btn-again").addEventListener("click", function () { self._rate(FSRS.Rating.Again); });
    this.root.querySelector("#btn-good").addEventListener("click", function () { self._rate(FSRS.Rating.Good); });
    document.addEventListener("keydown", function (e) {
      if (document.querySelector('[data-panel="cards"]').hidden) return;
      if (e.target.tagName === "TEXTAREA") return;
      if (e.code === "Space") { e.preventDefault(); self._flip(); }
      else if (e.key === "1") self._rate(FSRS.Rating.Again);
      else if (e.key === "2") self._rate(FSRS.Rating.Good);
    });
  };

  // 툴바(섞기/진행 초기화)는 첫 render() 에서 만들어지므로 그때 한 번만 부른다.
  StudyCards.prototype._bindToolbarActions = function () {
    var self = this;
    var shuffleBtn = this.root.querySelector("#card-shuffle");
    var resetBtn = this.root.querySelector("#card-reset");
    if (shuffleBtn) shuffleBtn.addEventListener("click", function () {
      for (var i = self.queue.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = self.queue[i]; self.queue[i] = self.queue[j]; self.queue[j] = t;
      }
      self.qi = 0; self.flipped = false; self.render();
    });
    if (resetBtn) resetBtn.addEventListener("click", function () {
      if (!confirm("이 콘텐츠의 카드 진행(간격 반복 기록)을 모두 초기화할까요?")) return;
      self._loadStatesReset();
      self._buildQueue();
      self.render();
    });
  };

  StudyCards.prototype._loadStatesReset = function () {
    var states = {};
    this.cards.forEach(function (c) { states[c.id] = FSRS.createEmptyCard(new Date()); });
    this.states = states;
    this.lapses = {};
    this._saveStates();
  };

  StudyCards.prototype._flip = function () {
    if (!this.queue.length) return;
    this.flipped = !this.flipped;
    this.render();
  };

  StudyCards.prototype._rate = function (rating) {
    if (!this.queue.length || !this.flipped) return;
    var card = this.queue[this.qi];
    var now = new Date();
    var result = this.fsrs.next(this.states[card.id], now, rating);
    this.states[card.id] = result.card;
    if (rating === FSRS.Rating.Again) {
      this.lapses[card.id] = (this.lapses[card.id] || 0) + 1;
    }
    this._saveStates();
    global.dispatchEvent(new CustomEvent("study:weakpoints-changed"));

    // "다시"를 누른 카드는 이번 세션 큐 뒤쪽에 다시 넣어 바로 재도전시킨다
    if (rating === FSRS.Rating.Again) {
      var again = this.queue.splice(this.qi, 1)[0];
      this.queue.push(again);
    } else {
      this.queue.splice(this.qi, 1);
      if (this.qi >= this.queue.length) this.qi = 0;
    }
    this.flipped = false;
    this.render();
  };

  StudyCards.prototype._catInfo = function (catId) {
    var cats = this.adapter.cardCategories || [];
    for (var i = 0; i < cats.length; i++) if (cats[i].id === catId) return cats[i];
    return { id: catId, label: catId, color: "gray" };
  };

  StudyCards.prototype.render = function () {
    var mount = this.root.querySelector("#flash-card-mount");
    var actions = this.root.querySelector("#flash-actions");
    var seMount = this.root.querySelector("#self-explain-mount");
    var stats = this.root.querySelector("#card-stats");
    var fill = this.root.querySelector("#flash-progress-fill");
    var total = this.cards.length;
    var masteredCount = Object.keys(this.states).filter(function (id) {
      return this.states[id].state === FSRS.State.Review && this.states[id].reps >= 2;
    }, this).length;

    stats.innerHTML =
      '<span>' + this.queue.length + ' / ' + total + ' 복습 대기</span>' +
      '<span>완료 ' + (total - this.queue.length) + '</span>' +
      '<span>마스터 ' + masteredCount + '</span>';

    var toolbarExtra = this.root.querySelector("#card-toolbar-extra");
    if (!toolbarExtra) {
      toolbarExtra = B.el("div", "", '<button type="button" class="icon-btn" id="card-shuffle">섞기</button> <button type="button" class="icon-btn" id="card-reset">진행 초기화</button>');
      stats.parentNode.appendChild(toolbarExtra);
      toolbarExtra.id = "card-toolbar-extra";
      this._bindToolbarActions(); // 새로 생긴 버튼에만 리스너 부착
    }

    fill.style.width = (total ? Math.round(((total - this.queue.length) / total) * 100) : 0) + "%";

    if (!this.queue.length) {
      mount.innerHTML = '<div class="flash-empty"><h3>지금은 복습할 카드가 없습니다</h3><p>선택한 필터 기준으로 오늘 복습할 카드를 모두 마쳤습니다. 간격 반복 알고리즘이 다음 복습 시점을 자동으로 정합니다 — 나중에 다시 열어보세요.</p></div>';
      actions.hidden = true;
      seMount.innerHTML = "";
      return;
    }

    var card = this.queue[this.qi];
    var cat = this._catInfo(card.category);
    var style = B.catStyle(cat.color);
    var srcBtn = B.sourceRefBtn({ sourceSpan: card.sourceSpan, conceptId: card.conceptId });

    var html = '<div class="flashcard' + (this.flipped ? " flipped" : "") + '" style="' + style + '" id="active-flashcard">' +
      '<div class="fc-top"><span class="fc-cat" style="' + style + '">' + B.esc(cat.label) + '</span>' +
      '<span class="fc-prio">' + (card.priority === "core" ? "핵심" : "일반") + '</span>' +
      '<span class="fc-pos">' + (this.qi + 1) + ' / ' + this.queue.length + '</span></div>' +
      '<div class="fc-q">' + B.applyNotation(card.q, this.adapter) + '</div>' +
      (this.flipped
        ? '<div class="fc-a">' + B.applyNotation(card.a, this.adapter) + (srcBtn ? '<div class="fc-source">' + srcBtn + '</div>' : "") + '</div>'
        : '<div class="fc-hint">클릭 또는 스페이스바로 답 확인</div>') +
      '</div>';
    mount.innerHTML = html;
    mount.querySelector(".flashcard").addEventListener("click", this._flip.bind(this));

    actions.hidden = !this.flipped;

    // 자기 설명 입력 (§7.4) — 뒤집기 전에 스스로 답을 입력, 뒤집으면 모범답안과 나란히 비교
    if (!this.flipped) {
      seMount.innerHTML =
        '<span class="se-label">먼저 스스로 답을 말해보고, 아래에 한 줄로 적어보세요 (생성 효과)</span>' +
        '<textarea id="se-input" placeholder="여기에 내 설명을 적어보세요…">' + B.esc(this._draft || "") + '</textarea>';
      var ta = seMount.querySelector("#se-input");
      var self = this;
      ta.addEventListener("input", function () { self._draft = ta.value; });
    } else {
      var draft = this._draft || "(입력하지 않음)";
      seMount.innerHTML =
        '<div class="se-compare show">' +
        '<div class="se-col"><b>내 설명</b>' + B.esc(draft) + '</div>' +
        '<div class="se-col"><b>모범 답안</b>' + B.applyNotation(card.a, this.adapter) + '</div>' +
        '</div>';
      this._draft = "";
    }
  };

  StudyCards.prototype.getWeakest = function (n) {
    var self = this;
    var arr = Object.keys(this.lapses).map(function (id) {
      var card = self.cards.filter(function (c) { return c.id === id; })[0];
      return { id: id, count: self.lapses[id], q: card ? card.q : id };
    });
    arr.sort(function (a, b) { return b.count - a.count; });
    return arr.slice(0, n || 3);
  };

  global.StudyCards = StudyCards;
})(window);
