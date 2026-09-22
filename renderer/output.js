/* output.js — 산출 리허설 엔진 (발표 리허설 / 시험 리허설 공용).
   output.mode 가 "presentation" 이든 "exam" 이든 같은 엔진을 쓴다.
   도메인 중립. */
(function (global) {
  "use strict";
  var B = global.StudyBlocks;

  function parseTimeToSeconds(t) {
    if (t == null) return null;
    var m = String(t).match(/(\d+)\s*[:：]\s*(\d+)/);
    if (m) return (+m[1]) * 60 + (+m[2]);
    var m2 = String(t).match(/(\d+)/);
    if (m2) return (+m2[1]) * 60;
    return null;
  }

  function mmss(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  function StudyOutput(root, content, adapter) {
    this.root = root;
    this.content = content;
    this.adapter = adapter;
    this.data = (content.output && content.output.segments) || [];
    this.targetTotal = ((content.output && content.output.targetMinutes) || 10) * 60;
    this.idx = 0;
    this.elapsed = 0;
    this.running = false;
    this.timerHandle = null;
    this.keywordMode = false;
    this.bigMode = false;
    this.segActual = new Array(this.data.length).fill(null);

    this.elClock = root.querySelector("#tp-clock");
    this.elTarget = root.querySelector("#tp-target");
    this.elStage = root.querySelector("#tp-stage");
    this.elPos = root.querySelector("#tp-pos");
    this.elDots = root.querySelector("#tp-dots");
    this.elStartPause = root.querySelector("#tp-startpause");

    this.elTarget.textContent = "목표 " + mmss(this.targetTotal);

    var self = this;
    root.querySelector("#tp-startpause").addEventListener("click", function () { self.startPause(); });
    root.querySelector("#tp-reset").addEventListener("click", function () { self.reset(); });
    root.querySelector("#tp-prev").addEventListener("click", function () { self.goTo(self.idx - 1); });
    root.querySelector("#tp-next").addEventListener("click", function () { self.goTo(self.idx + 1); });
    root.querySelector("#tp-keyword-toggle").addEventListener("change", function (e) { self.keywordMode = e.target.checked; self.renderStage(); });
    root.querySelector("#tp-big-toggle").addEventListener("change", function (e) { self.bigMode = e.target.checked; self.renderStage(); });

    this.renderDots();
    this.renderStage();
  }

  StudyOutput.prototype.renderDots = function () {
    var self = this;
    this.elDots.innerHTML = this.data.map(function (seg, i) {
      var cls = "tp-dot";
      if (self.segActual[i] != null) {
        var target = parseTimeToSeconds(seg.time);
        if (target != null) {
          cls += Math.abs(self.segActual[i] - target) <= Math.max(20, target * 0.25) ? " pace-good" : " pace-late";
        }
      }
      return '<button type="button" class="' + cls + '" data-i="' + i + '" aria-current="' + (i === self.idx) + '"></button>';
    }).join("");
    Array.from(this.elDots.querySelectorAll(".tp-dot")).forEach(function (dot) {
      dot.addEventListener("click", function () { self.goTo(+dot.dataset.i); });
    });
  };

  StudyOutput.prototype.renderStage = function () {
    if (!this.data.length) {
      this.elStage.innerHTML = '<p style="color:var(--ink-faint);text-align:center;">이 콘텐츠에는 산출 리허설 자료가 없습니다.</p>';
      return;
    }
    var seg = this.data[this.idx];
    var html = '<span class="tp-time-label">목표 진입 시각 ' + B.esc(seg.time || "") + '</span>' +
      '<h2 class="tp-title">' + B.applyNotation(seg.title || "", this.adapter) + '</h2>';

    if (this.keywordMode && seg.keywords && seg.keywords.length) {
      html += '<ul class="tp-kw' + (this.bigMode ? " big" : "") + '">' +
        seg.keywords.map(function (k) { return "<li>" + B.applyNotation(k, this.adapter) + "</li>"; }, this).join("") + "</ul>";
    } else {
      html += '<p class="tp-script' + (this.bigMode ? " big" : "") + '">' + B.applyNotation(seg.script || "", this.adapter) + "</p>";
    }

    var diff = this.elapsed - (parseTimeToSeconds(seg.time) || 0);
    if (this.running && Math.abs(diff) > 30) {
      var msg = diff > 0
        ? "지금 페이스가 목표보다 " + Math.round(diff) + "초 느립니다. 다음 구간에서 조금 서둘러 보세요."
        : "지금 페이스가 목표보다 " + Math.round(-diff) + "초 빠릅니다. 여유 있게 진행해도 됩니다.";
      html += '<div class="callout ' + (Math.abs(diff) <= 45 ? "teal" : "") + ' tp-note">' + msg + "</div>";
    }
    if (this.idx === this.data.length - 1 && this.segActual[this.idx] !== null) {
      var overall = this.elapsed - this.targetTotal;
      html += '<div class="callout blue tp-note">여기까지가 목표 ' + mmss(this.targetTotal) + ' 분량입니다. 현재 누적 시간 ' +
        mmss(this.elapsed) + ' (목표 대비 ' + (overall >= 0 ? "+" : "") + Math.round(overall) + '초)</div>';
    }
    this.elStage.innerHTML = html;
    this.elPos.textContent = (this.idx + 1) + " / " + this.data.length;
    this.renderDots();
  };

  StudyOutput.prototype.goTo = function (i) {
    i = Math.max(0, Math.min(this.data.length - 1, i));
    this.idx = i;
    if (this.running && this.segActual[i] === null) this.segActual[i] = this.elapsed;
    this.renderStage();
  };

  StudyOutput.prototype.tick = function () {
    this.elapsed += 1;
    this.elClock.textContent = mmss(this.elapsed);
  };

  StudyOutput.prototype.startPause = function () {
    this.running = !this.running;
    this.elStartPause.textContent = this.running ? "일시정지" : "계속";
    if (this.running) {
      if (this.segActual[this.idx] === null) this.segActual[this.idx] = this.elapsed;
      this.timerHandle = setInterval(this.tick.bind(this), 1000);
    } else {
      clearInterval(this.timerHandle);
    }
  };

  StudyOutput.prototype.reset = function () {
    this.running = false;
    clearInterval(this.timerHandle);
    this.elapsed = 0;
    this.idx = 0;
    this.segActual = new Array(this.data.length).fill(null);
    this.elClock.textContent = "00:00";
    this.elStartPause.textContent = "시작";
    this.renderStage();
  };

  global.StudyOutput = StudyOutput;
})(window);
