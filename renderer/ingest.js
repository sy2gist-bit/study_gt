/* ingest.js — 학습 자료(PDF/이미지/txt/md)를 content JSON으로 바꾸는 파이프라인.
   전부 이 브라우저 안에서 실행된다: 파일 추출도, Claude API 호출도, 저장도.
   (Gemini/OpenAI 등 다른 엔진 연동은 보류 상태 — proxy/gemini-proxy-worker.js 에 코드는
   남겨뒀지만 이 파일에서는 쓰지 않는다. 다시 붙이려면 이 파일에 엔진 배열/자동전환
   로직을 다시 추가하면 된다.)
   이 파일에도 특정 과목/콘텐츠 이름을 하드코딩하지 않는다. */
(function (global) {
  "use strict";
  var B = global.StudyBlocks;

  var CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
  // claude-sonnet-4-5-20250929 는 2026-09-29부로 퇴역 예정이라 claude-sonnet-5 로 갱신함
  // (Anthropic 모델 지원 종료 안내 기준). claude-sonnet-5 는 표준 Messages API에서
  // max_tokens 최대 128,000까지 별도 베타 헤더 없이 지원한다.
  var DEFAULT_MODEL = "claude-sonnet-5";
  var ANTHROPIC_VERSION = "2023-06-01";

  // ────────────────────────────────────────────────────────
  // 1. 파일 → 원문 조각 추출 (클라이언트에서만, AI 호출 없음)
  // ────────────────────────────────────────────────────────

  function readAsText(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
      r.readAsText(file);
    });
  }

  function readAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
      r.readAsDataURL(file);
    });
  }

  function waitForPdfjs() {
    if (global.pdfjsLib) return Promise.resolve(global.pdfjsLib);
    return new Promise(function (resolve) {
      global.addEventListener("study:pdfjs-ready", function handler() {
        global.removeEventListener("study:pdfjs-ready", handler);
        resolve(global.pdfjsLib);
      });
      // 이미 로드가 끝나 이벤트를 놓쳤을 수도 있으니 짧게 폴링도 병행
      var tries = 0;
      var iv = setInterval(function () {
        tries++;
        if (global.pdfjsLib) { clearInterval(iv); resolve(global.pdfjsLib); }
        else if (tries > 100) { clearInterval(iv); }
      }, 100);
    });
  }

  function extractPdf(file, label) {
    return waitForPdfjs().then(function (pdfjsLib) {
      return file.arrayBuffer().then(function (buf) {
        return pdfjsLib.getDocument({
          data: buf,
          cMapUrl: global.__pdfjsCmapUrl, cMapPacked: true,
          standardFontDataUrl: global.__pdfjsFontUrl
        }).promise;
      }).then(function (pdf) {
        var pagePromises = [];
        var _loop = function (i) {
          pagePromises.push(
            pdf.getPage(i).then(function (page) {
              return page.getTextContent().then(function (tc) {
                var text = tc.items.map(function (it) { return it.str; }).join(" ").replace(/\s+/g, " ").trim();
                if (text.length >= 25) {
                  return { type: "text", label: label + " p." + i, text: text };
                }
                // 텍스트 레이어가 거의 없으면 스캔본으로 보고 페이지를 이미지로 렌더링
                var viewport = page.getViewport({ scale: 1.6 });
                var canvas = document.createElement("canvas");
                canvas.width = viewport.width; canvas.height = viewport.height;
                var ctx = canvas.getContext("2d");
                return page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
                  return { type: "image", label: label + " p." + i, dataUrl: canvas.toDataURL("image/png") };
                });
              });
            })
          );
        };
        for (var i = 1; i <= pdf.numPages; i++) _loop(i);
        return Promise.all(pagePromises);
      });
    });
  }

  function extractFile(file) {
    var name = file.name || "파일";
    var ext = (name.split(".").pop() || "").toLowerCase();
    if (ext === "txt" || ext === "md" || ext === "markdown") {
      return readAsText(file).then(function (text) { return [{ type: "text", label: name, text: text }]; });
    }
    if (ext === "pdf") {
      return extractPdf(file, name);
    }
    if (["jpg", "jpeg", "png", "webp", "gif"].indexOf(ext) >= 0) {
      return readAsDataUrl(file).then(function (dataUrl) { return [{ type: "image", label: name, dataUrl: dataUrl }]; });
    }
    return Promise.reject(new Error(name + ": 지원하지 않는 형식입니다 (pdf/jpg/png/txt/md 만 가능)"));
  }

  function extractAll(files) {
    return Promise.all(Array.prototype.map.call(files, extractFile)).then(function (groups) {
      return groups.reduce(function (a, g) { return a.concat(g); }, []);
    });
  }

  // ────────────────────────────────────────────────────────
  // 2. Claude API 호출
  // ────────────────────────────────────────────────────────

  // 원문 조각을 Anthropic content 블록 배열로 바꾼다: [{type:"text",text} | {type:"image",source:{...}}]
  function fragmentsToContentBlocks(fragments) {
    var blocks = [];
    fragments.forEach(function (f) {
      blocks.push({ type: "text", text: "── [" + f.label + "] ──" });
      if (f.type === "text") {
        blocks.push({ type: "text", text: f.text });
      } else {
        var m = /^data:([^;]+);base64,(.*)$/.exec(f.dataUrl);
        if (m) blocks.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
      }
    });
    return blocks;
  }

  var MAX_TOKENS_CAP = 64000; // claude-sonnet-5 표준 한도(128,000)의 절반 — 비용·시간 대비 충분히 넉넉한 상한

  // 추출된 원문 분량(글자 수)에 비례해 시작 max_tokens 를 잡는다. 항상 8192부터 시작해서
  // 잘릴 때마다 재요청하면, 긴 논문 PDF 한 편에서만 4~5번씩 API를 다시 부르게 되어
  // 시간·비용이 낭비된다 — 처음부터 분량에 맞는 값으로 시작하고, 그래도 부족하면
  // callModelJson 이 한 번 더 두 배로 재시도한다(안전망).
  function estimateFragmentChars(fragments) {
    return fragments.reduce(function (sum, f) { return sum + (f.type === "text" ? (f.text || "").length : 0); }, 0);
  }
  function estimateStartTokens(totalChars) {
    var estimate = Math.ceil(totalChars / 2) + 4096; // 원문을 그대로 옮기는 단계 기준의 대략치
    return Math.max(8192, Math.min(estimate, MAX_TOKENS_CAP));
  }

  function callClaude(opts) {
    // opts: { apiKey, model, system, content (array|string), maxTokens, signal }
    return fetch(CLAUDE_API_URL, {
      method: "POST",
      signal: opts.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": opts.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: opts.model || DEFAULT_MODEL,
        max_tokens: opts.maxTokens || 8192,
        system: opts.system,
        messages: [{ role: "user", content: opts.content }]
      })
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) {
          var msg = (data && data.error && data.error.message) || (r.status + " " + r.statusText);
          throw new Error("Claude API 오류: " + msg);
        }
        var text = (data.content || []).filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("\n");
        return { text: text, truncated: data.stop_reason === "max_tokens" };
      });
    });
  }

  function parseJsonLoose(text) {
    var t = text.trim();
    var fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
    if (fence) t = fence[1].trim();
    var first = t.indexOf("{"), last = t.lastIndexOf("}");
    if (first >= 0 && last > first) t = t.slice(first, last + 1);
    return JSON.parse(t);
  }

  var TOO_LONG_MSG = "자료가 길어서 응답이 한 번에 다 안 나왔습니다. 파일을 나눠서(예: PDF를 앞부분만) 다시 시도해보세요.";
  var BAD_JSON_MSG = "모델이 돌려준 응답을 읽지 못했습니다(JSON 형식이 아님). 다시 시도하거나, 자료를 줄여서 해보세요.";

  function appendJsonFixNote(content) {
    var note = "\n\n(이전 응답이 유효한 JSON이 아니었습니다. 설명 없이 JSON 객체 하나만 다시 출력하세요.)";
    return typeof content === "string" ? content + note : content.concat([{ type: "text", text: note }]);
  }

  // 두 가지 실패를 각각 다르게 다룬다:
  //  (1) 응답이 max_tokens 로 잘림 — JSON이 애초에 미완성. MAX_TOKENS_CAP에 도달할 때까지
  //      용량을 계속 두 배로 늘려가며 재요청한다(예: 8192→16384→32768→64000).
  //  (2) 응답은 끝까지 왔지만 JSON 형식이 어긋남 — "JSON만 다시 출력하라"고 재요청. 최대 1회.
  // 용량을 최대까지 늘려도 계속 잘리면 그제서야 포기한다.
  function callModelJson(callOpts, onNote) {
    function attempt(innerOpts, triedJsonFix) {
      return callClaude(innerOpts).then(function (res) {
        if (res.truncated) {
          var current = innerOpts.maxTokens || 8192;
          var bumped = Math.min(current * 2, MAX_TOKENS_CAP);
          if (bumped > current) {
            if (onNote) onNote("응답이 길어서 잘렸어요 — 더 큰 용량(" + bumped + " 토큰)으로 다시 요청 중…");
            return attempt(Object.assign({}, innerOpts, { maxTokens: bumped }), triedJsonFix);
          }
          throw new Error(TOO_LONG_MSG);
        }
        try {
          return parseJsonLoose(res.text);
        } catch (e) {
          // 두 번째도 실패하면 포기한다. 이때 e(SyntaxError)를 그대로 올리면
          // "Unexpected token 'J' …" 같은 영문 JS 오류가 모달에 그대로 노출된다 —
          // 다른 실패 경로(TOO_LONG_MSG 등)와 톤을 맞춰 사람이 읽을 메시지로 바꾸고,
          // 원인 파악용 원문은 콘솔에만 남긴다.
          if (triedJsonFix) {
            console.warn("[ingest.js] JSON 파싱 재시도 실패:", e, (res.text || "").slice(0, 500));
            throw new Error(BAD_JSON_MSG);
          }
          if (onNote) onNote("응답이 JSON으로 안 읽혀서 한 번 더 요청 중…");
          return attempt(Object.assign({}, innerOpts, { content: appendJsonFixNote(innerOpts.content) }), true);
        }
      });
    }
    return attempt(callOpts, false);
  }

  // ────────────────────────────────────────────────────────
  // 3. 단계별 생성 파이프라인
  // ────────────────────────────────────────────────────────

  var RULES = "규칙(반드시 지킬 것): (1) 제공된 원문에 없는 사실·숫자·용어를 지어내지 않는다 — 모르면 비워두거나 생략한다. " +
    "(2) 원문을 요약해서 'original'에 넣지 않는다 — 원문 그대로 옮긴다. 쉬운 설명은 별도 필드에 쓴다. " +
    "(3) 글자가 불확실하면 [판독 불확실]로 표시하고 추측하지 않는다. " +
    "(4) 다른 설명 없이 유효한 JSON 객체 하나만 출력한다. 마크다운 코드펜스도 쓰지 않는다.";

  function stageSource(opts) {
    var sys = "당신은 학습 자료 원문을 구조화하는 도구입니다. 절대 요약하거나 내용을 지어내지 않습니다.";
    var blocks = fragmentsToContentBlocks(opts.fragments);
    blocks.push({
      type: "text", text: "\n위 원문을 의미 단위로 섹션과 문단으로 나눠 다음 JSON 스키마로 출력하세요:\n" +
        '{"sections":[{"id":"s1","navLabel":"짧은 제목","title":"섹션 제목","paragraphs":[' +
        '{"id":"s1-p1","tag":"문단 표시(예: 본문 ①)","original":"원문 그대로","assist":"쉬운 말 풀이(중학생도 이해할 수준)","guide":"이 문단이 왜 중요한지 1~2문장","sourceSpan":{"page":<라벨의 페이지 번호 또는 null>,"line":null}}' +
        "]}]}\n" + RULES
    });
    return callModelJson({ apiKey: opts.apiKey, model: opts.model, system: sys, content: blocks, maxTokens: opts.maxTokens, signal: opts.signal }, opts.onNote);
  }

  function stageAdapter(opts, sourceJson) {
    var sys = "당신은 학습 자료의 과목을 판별해 알맞은 UI 설정을 고르거나 새로 만드는 도구입니다.";
    var sectionTitles = (sourceJson.sections || []).map(function (s) { return s.title; }).join(", ");
    var existing = opts.existingAdapters.map(function (a) {
      return { id: a.id, label: a.label, cardCategories: (a.cardCategories || []).map(function (c) { return c.id + ":" + c.label; }) };
    });
    var prompt = "학습 자료의 섹션 제목: " + sectionTitles + "\n\n" +
      "기존 어댑터 목록: " + JSON.stringify(existing) + "\n\n" +
      "이 중 과목 성격이 잘 맞는 게 있으면 그 id를 고르세요. 잘 맞는 게 없으면 새 어댑터를 만드세요.\n" +
      "출력 스키마 (둘 중 하나):\n" +
      '{"choice":"existing","id":"<기존 id>"}\n또는\n' +
      '{"choice":"new","adapter":{"id":"<영문 소문자-하이픈 id>","label":"<과목명, 예: 중등 사회>","tabLabels":{"guide":"공부법","read":"자료 읽기","study":"학습자료","cards":"카드 암기","output":"시험 리허설"},' +
      '"stageTags":["0단계","1단계","2단계","3단계","4단계"],"assistLabelDefault":"쉬운 말 풀이",' +
      '"cardCategories":[{"id":"concept","label":"개념","color":"blue"},{"id":"term","label":"용어","color":"blue"},{"id":"number","label":"수치","color":"orange"},{"id":"trap","label":"함정","color":"red"}],' +
      '"moduleCategories":[{"id":"concept","color":"blue"},{"id":"trap","color":"red"}],"notation":[],"outputMode":"' + (opts.mode || "exam") + '","readingLevel":"middle"}}\n' +
      "color 값은 blue/orange/teal/red/gray 중에서만 고르세요. 다른 설명 없이 JSON만 출력하세요.";
    return callModelJson({ apiKey: opts.apiKey, model: opts.model, system: sys, content: prompt, maxTokens: 2048, signal: opts.signal }, opts.onNote);
  }

  function stageModules(opts, sourceJson, adapter) {
    var sys = "당신은 원문을 바탕으로 학습 모듈을 설계하는 도구입니다. 원문에 없는 내용은 추가하지 않습니다.";
    var moduleCatIds = (adapter.moduleCategories || []).map(function (c) { return c.id; });
    var prompt = "원문(JSON): " + JSON.stringify(sourceJson) + "\n\n" +
      "이 원문을 바탕으로 학습 모듈을 설계하세요. 모듈 개수와 분량은 원문 분량에 비례해야 합니다 — 짧은 자료를 억지로 늘리지 마세요.\n" +
      "사용 가능한 module category: " + JSON.stringify(moduleCatIds) + "\n" +
      "블록 타입은 이 9개만 사용: prose({text}), list({ordered,items}), callout({tone:blue|teal|null,text}), termGrid({items:[{name,def}]}), " +
      "equation({num,expr,meaning — meaning 필수}), table({columns,rows,highlightRows}), figureCard({items:[{tag,caption,imageUri:null,takeaway}]}), qaList({items:[{q,a}]}), diagram({svg 또는 imageUri,caption}).\n" +
      '출력 스키마: {"modules":[{"id":"m1","category":"<위 카테고리 중 하나>","title":"...","blocks":[...]}]}\n' + RULES;
    return callModelJson({ apiKey: opts.apiKey, model: opts.model, system: sys, content: prompt, maxTokens: opts.maxTokens, signal: opts.signal }, opts.onNote);
  }

  function stageCards(opts, sourceJson, modulesJson, adapter) {
    var sys = "당신은 능동회상(active recall)용 플래시카드를 설계하는 도구입니다. 원문에 없는 내용은 추가하지 않습니다.";
    var cardCatIds = (adapter.cardCategories || []).map(function (c) { return c.id; });
    var prompt = "원문: " + JSON.stringify(sourceJson) + "\n\n모듈: " + JSON.stringify(modulesJson) + "\n\n" +
      "이를 바탕으로 플래시카드를 만드세요. 카드 개수는 원문 분량에 비례하게(짧은 자료는 5~15장 정도) — 억지로 늘리지 마세요.\n" +
      "사용 가능한 card category: " + JSON.stringify(cardCatIds) + "\n" +
      '출력 스키마: {"cards":[{"id":"c1","category":"<카테고리>","priority":"core|normal","q":"...","a":"...","conceptId":"<관련 module id 또는 null>","sourceSpan":{"page":<원문의 sourceSpan.page 참고 또는 null>,"line":null}}]}\n' +
      "priority 는 시험에 가장 자주 나올 핵심만 core로, 나머지는 normal로 표시하세요 — 전부 core로 두지 마세요.\n" + RULES;
    return callModelJson({ apiKey: opts.apiKey, model: opts.model, system: sys, content: prompt, maxTokens: opts.maxTokens, signal: opts.signal }, opts.onNote);
  }

  function stageFinal(opts, sourceJson, modulesJson, cardsJson, adapter) {
    var sys = "당신은 학습 가이드(0단계)와 리허설 대본을 설계하는 도구입니다. 원문에 없는 내용은 추가하지 않습니다.";
    var prompt = "원문: " + JSON.stringify(sourceJson) + "\n\n모듈: " + JSON.stringify(modulesJson) + "\n\n카드: " + JSON.stringify(cardsJson) + "\n\n" +
      "output.mode = \"" + (opts.mode || "exam") + '" 로 고정합니다.\n' +
      '출력 스키마: {"meta":{"eyebrow":"...","title":"...","subtitle":"...","sourceRef":"자료 출처(파일명 등)","oneLiner":"이 내용을 한 문장으로 — 핵심만 <b>강조</b> 포함 가능","pills":["...","...","...","..."],"estimatedMinutes":<정수>},' +
      '"guide":{"headline":"...","intro":"...","steps":[{"n":1,"title":"...","minutes":<정수>,"body":"...","links":[{"tab":"study","anchor":"<module id>","label":"..."}]}],"closingCallout":"..."},' +
      '"output":{"title":"...","targetMinutes":<정수>,"segments":[{"time":"0:00","title":"...","script":"...","keywords":["...","..."]}]}}\n' +
      "guide.steps 는 5~6개, 그림/개요 먼저 보기 → 압축 읽기 → 가리고 맞히기 → 카드 암기 → 예상문제 점검 순서를 따르세요. " + RULES;
    return callModelJson({ apiKey: opts.apiKey, model: opts.model, system: sys, content: prompt, maxTokens: opts.maxTokens, signal: opts.signal }, opts.onNote);
  }

  function slugify(s) {
    return "gen-" + String(s || "content").toLowerCase()
      .replace(/[^\w가-힣\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 40) + "-" + Date.now().toString(36);
  }

  // opts: { apiKey, model, files, mode, targetDate, existingAdapters, onProgress(stageLabel), maxTokens, signal }
  function generate(opts) {
    var progress = opts.onProgress || function () {};
    if (!opts.apiKey) {
      return Promise.reject(new Error("Claude(Anthropic) API 키를 입력하세요."));
    }
    var adapterResolved, sourceJson, modulesJson, cardsJson, finalJson, startTokens;

    progress("자료에서 원문 추출 중…");
    return extractAll(opts.files).then(function (fragments) {
      if (!fragments.length) throw new Error("추출된 내용이 없습니다.");
      // opts.maxTokens 를 직접 지정했으면 그 값을 쓰고, 아니면 원문 분량으로 시작값을 추정한다.
      startTokens = opts.maxTokens || estimateStartTokens(estimateFragmentChars(fragments));
      progress("원문 구조화 중… (1/5)");
      return stageSource({ apiKey: opts.apiKey, model: opts.model, fragments: fragments, maxTokens: startTokens, onNote: progress, signal: opts.signal });
    }).then(function (src) {
      sourceJson = src;
      progress("과목 어댑터 결정 중… (2/5)");
      return stageAdapter({ apiKey: opts.apiKey, model: opts.model, existingAdapters: opts.existingAdapters, mode: opts.mode, onNote: progress, signal: opts.signal }, sourceJson);
    }).then(function (adapterChoice) {
      if (adapterChoice.choice === "existing") {
        adapterResolved = opts.existingAdapters.filter(function (a) { return a.id === adapterChoice.id; })[0];
        if (!adapterResolved) throw new Error("모델이 존재하지 않는 어댑터 id를 골랐습니다: " + adapterChoice.id);
        adapterResolved._isNew = false;
      } else {
        // 여기는 choice 가 "new" 일 때만이 아니라, choice 가 없거나 오타여도 들어오는
        // 기본 분기다. 모델이 스키마를 벗어난 응답을 주면 adapter 가 undefined/문자열이
        // 되어 "Cannot set properties of undefined" 같은 날것의 TypeError 가 그대로
        // 사용자에게 보였다 — existing 쪽처럼 무엇이 잘못됐는지 알려준다.
        adapterResolved = adapterChoice.adapter;
        if (!adapterResolved || typeof adapterResolved !== "object") {
          throw new Error('모델이 과목 어댑터를 형식에 맞게 돌려주지 않았습니다 (choice="' +
            adapterChoice.choice + '"). 다시 시도해보세요.');
        }
        // id 는 IndexedDB 의 keyPath 이자 콘텐츠가 어댑터를 찾는 열쇠라 없으면 저장도 조회도 안 된다.
        if (!adapterResolved.id || typeof adapterResolved.id !== "string") {
          throw new Error("모델이 만든 과목 어댑터에 id가 없습니다. 다시 시도해보세요.");
        }
        adapterResolved._isNew = true;
      }
      progress("학습 모듈 작성 중… (3/5)");
      return stageModules({ apiKey: opts.apiKey, model: opts.model, maxTokens: startTokens, onNote: progress, signal: opts.signal }, sourceJson, adapterResolved);
    }).then(function (mods) {
      modulesJson = mods;
      progress("플래시카드 작성 중… (4/5)");
      return stageCards({ apiKey: opts.apiKey, model: opts.model, maxTokens: startTokens, onNote: progress, signal: opts.signal }, sourceJson, modulesJson, adapterResolved);
    }).then(function (cards) {
      cardsJson = cards;
      progress("학습법·리허설 정리 중… (5/5)");
      return stageFinal({ apiKey: opts.apiKey, model: opts.model, mode: opts.mode, maxTokens: startTokens, onNote: progress, signal: opts.signal }, sourceJson, modulesJson, cardsJson, adapterResolved);
    }).then(function (final) {
      finalJson = final;
      var id = slugify(finalJson.meta && finalJson.meta.title);
      var content = {
        schemaVersion: "1.0",
        adapter: adapterResolved.id,
        meta: Object.assign({ id: id, targetDate: opts.targetDate || null }, finalJson.meta),
        guide: finalJson.guide,
        source: { assistLabel: adapterResolved.assistLabelDefault || "쉬운 말 풀이", assistToggleDefault: "shown", sections: sourceJson.sections },
        modules: modulesJson.modules,
        cards: cardsJson.cards,
        output: Object.assign({ mode: opts.mode || "exam" }, finalJson.output)
      };
      progress("저장 중…");
      var saveP = global.StudyStorage.saveContent(content);
      if (adapterResolved._isNew) {
        saveP = saveP.then(function () {
          var a = Object.assign({}, adapterResolved);
          delete a._isNew;
          return global.StudyStorage.saveAdapter(a);
        });
      }
      return saveP.then(function () { return content; });
    });
  }

  global.StudyIngest = {
    generate: generate,
    extractAll: extractAll,
    DEFAULT_MODEL: DEFAULT_MODEL
  };
})(window);
