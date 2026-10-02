# study-guide-template

`암기용_스터디가이드_범용화_지시서.md` 의 설계를 실제로 구현한 결과물입니다.

```
[뼈대(renderer)] + [내용(content/*.json)] + [과목 어댑터(adapters/*.json)]
```

`renderer/` 는 어떤 과목인지 전혀 모른 채로 동작합니다. 새 과목은 코드를 고치지 않고
`content/`, `adapters/` 에 JSON 파일을 추가하는 것만으로 늘어납니다.

## 실행 방법

`fetch()` 로 JSON을 읽어오기 때문에 `file://` 로 `index.html` 을 직접 열면 브라우저
보안 정책(CORS)에 막혀 아무것도 뜨지 않습니다. 반드시 웹 서버로 띄워서 열어야 합니다.

```bash
cd study-guide-template
python3 -m http.server 8000
# 브라우저에서:
#   http://localhost:8000/renderer/index.html                 → 콘텐츠 선택 화면
#   http://localhost:8000/renderer/index.html?content=perca-ceas
#   http://localhost:8000/renderer/index.html?content=sci-m2-state-change
```

이 앱은 **클로드ai 계정이나 인터넷 연결된 서버 없이도** 동작합니다 — 로컬 웹서버(또는
아래 "온라인에 올리기" 방법으로 아무 정적 호스팅)만 있으면 됩니다.

(Node 로 만든 실제 웹앱에 통합할 때는 `renderer/` 를 그대로 정적 자산으로 서빙하고,
`content=<id>` 쿼리 파라미터 대신 라우팅으로 콘텐츠 id를 넘기면 됩니다.)

## 새 자료로 바로 만들기 (클로드ai 없이)

콘텐츠 선택 화면의 **"+ 새 자료로 만들기"** 카드를 누르면, 학교·학원에서 받은 자료
(PDF, 사진/스캔본 JPG·PNG, TXT, MD — 여러 파일 동시 가능)를 올려서 PERCA 논문 콘텐츠와
똑같은 구조(원문 읽기 → 학습자료 → 카드 암기 → 시험/발표 리허설)로 그 자리에서 바로
학습 콘텐츠를 만들 수 있습니다. 이 브라우저를 새로고침해도, 다시 방문해도 계속 남아있고
(이 기기의 IndexedDB에 저장), 정적 콘텐츠(`content/*.json`)와 나란히 "내 자료" 배지가
붙어 선택 화면에 함께 나타납니다.

**필요한 것: 사용자 본인의 Anthropic API 키 1개.**

1. https://console.anthropic.com 에서 계정을 만들고(클로드ai 구독과는 별개 시스템입니다)
   "API Keys" 메뉴에서 키를 발급받습니다. 소액 크레딧을 충전해야 호출이 됩니다(자료
   하나 생성에 보통 몇백 원~1천 원대 수준의 토큰 비용이 듭니다 — 자료 분량에 따라 다름).
2. "새 자료로 만들기" 모달에 그 키를 붙여넣고, 파일을 선택한 뒤 "생성 시작"을 누릅니다.
3. 파일 추출(PDF 텍스트/이미지, 사진, 텍스트 파일 읽기)부터 Anthropic API 호출까지
   **전부 이 브라우저 안에서** 일어납니다. 진행 단계가 5단계로 화면에 표시됩니다.

**동작 원리와 보안 모델(꼭 읽어보세요):**

- API 키는 이 브라우저의 IndexedDB에만 저장됩니다. 클로드/Anthropic의 `messages` 엔드포인트로만
  전송되고(`anthropic-dangerous-direct-browser-access` 헤더로 브라우저 직접 호출을 허용받음),
  그 외 어떤 서버로도 보내지 않습니다 — 이 프로젝트에는 백엔드 서버가 아예 없습니다.
- 이 사이트를 GitHub Pages 등에 올려서 **다른 사람과 링크를 공유**하면, 그 사람도 "새 자료로
  만들기"를 쓰려면 자기 자신의 API 키를 넣어야 합니다(한 사람의 키가 다른 사람에게 전달되지
  않습니다 — 각자 브라우저에 각자 저장). 반대로 말하면, 내가 넣은 키는 내 브라우저에만
  있으므로 다른 사람이 이 링크에 들어가도 내 키나 내 API 사용량을 볼 수 없습니다.
- API 키는 결제 수단과 연결된 민감한 값입니다. 공용 컴퓨터에서 이 기능을 쓴 뒤에는
  브라우저 데이터(IndexedDB)를 지우는 것을 권장합니다.
- 원문에 없는 내용을 지어내지 않도록 각 생성 단계마다 규칙을 강하게 명시하고 있지만,
  AI가 만든 결과이므로 **생성된 학습자료는 실제 시험 전에 원문과 한 번 대조 확인**하는
  것을 권장합니다.
- 스캔본(사진으로 찍은 페이지)은 텍스트 레이어가 거의 없는 PDF 페이지를 자동으로 이미지로
  변환해 보내므로 따로 처리할 필요가 없습니다. 단, 손글씨나 저화질 사진은 인식률이 떨어질
  수 있습니다.

## 온라인에 올리기 (배포)

이 폴더 전체가 정적 파일(HTML/CSS/JS)이라 서버 코드 없이 아무 정적 호스팅에 올리면 됩니다.
둘 다 클로드ai 계정과 무관하며, 완전히 무료로 가능합니다.

실제 앱은 `renderer/` 안에 있지만, 최상위 `index.html`(자동으로 `renderer/`로 이동시켜주는
리디렉션 페이지)과 Netlify용 `_redirects` 파일을 함께 넣어뒀기 때문에 **사이트 최상위
주소만 열어도 바로 뜹니다** — `/renderer/` 를 따로 붙일 필요가 없습니다.

**방법 1 — Netlify Drop (가장 간단, 계정 없이도 가능)**
1. https://app.netlify.com/drop 접속
2. `study-guide-template` **폴더 자체를** 그대로 드래그 앤 드롭 (폴더 안의 파일들만 따로
   드래그하면 안 됩니다 — 폴더째로 끌어다 놓아야 `renderer/`, `content/`, `_redirects` 등이
   같은 위치 구조로 올라갑니다)
3. 몇 초 뒤 발급되는 `https://....netlify.app/` 주소를 그대로 열면 자동으로 콘텐츠 선택
   화면으로 넘어갑니다. (혹시 "Page not found"가 뜨면 폴더 안의 개별 파일들만 올라간
   경우입니다 — 사이트를 지우고 폴더째로 다시 드래그해보세요.)

**방법 2 — GitHub Pages (계속 관리하며 쓰기 좋음)**
1. 이 폴더 내용을 새 GitHub 저장소에 커밋 & 푸시 (저장소 루트에 `index.html`, `renderer/`,
   `content/`, `adapters/` 가 나란히 있어야 합니다)
2. 저장소 Settings → Pages → Branch를 `main`(또는 사용 중인 브랜치), 루트로 지정
3. `https://<계정명>.github.io/<저장소명>/` 로 접속하면 자동으로 `renderer/` 로 이동합니다

두 방법 모두 이후 "새 자료로 만들기"로 콘텐츠를 만들면 각 방문자의 브라우저(IndexedDB)에만
저장됩니다 — 즉 내가 만든 자료가 자동으로 다른 방문자에게 보이지는 않습니다. 만든 자료를
다른 기기나 다른 사람과 공유하려면, 지금은 `content/`, `adapters/` 폴더에 파일로 직접
추가해 재배포하는 방법뿐입니다(§"새 과목을 추가하려면" 참고).

## 폴더 구조

```
study-guide-template/
  renderer/            뼈대. 과목 이름이 등장하면 안 됨 (수용 테스트 A)
    index.html          구조만 (빈 슬롯)
    style.css            카테고리 색은 어댑터가 --cat-color 변수로 주입, CSS는 그 변수만 참조
    render.js             오케스트레이터: content+adapter 로드(정적 파일 → 없으면 IndexedDB) → 탭/진도/네비게이션 구성
    blocks.js              블록 타입 사전 렌더러 (9종) + 콘텐츠 HTML 살균 (§"콘텐츠 HTML 처리")
    progress.js             localStorage 진도 저장 (meta.id 로 네임스페이스 분리)
    flashcard.js             카드 암기 엔진 + FSRS 간격 반복
    output.js                 발표/시험 리허설 엔진 (타이머·키워드모드·페이스 점)
    storage.js               IndexedDB 레이어 — 사용자가 만든 콘텐츠/어댑터/API 키 저장(이 기기 안에만)
    ingest.js                 파일 추출(pdf.js/이미지/텍스트) + Anthropic API 단계별 생성 파이프라인
    ingest-ui.js               "새 자료로 만들기" 모달 UI (storage.js·ingest.js 연결)
    vendor/fsrs.bundle.js      ts-fsrs v5.4.2 (MIT) 공식 오픈소스 빌드 — 직접 구현 안 함
    vendor/pdfjs/               pdfjs-dist v4.10.38 (Apache-2.0) 공식 빌드 — PDF 텍스트/스캔본 추출용
  proxy/
    gemini-proxy-worker.js    (보류) Gemini를 나중에 붙일 때 쓸 Cloudflare Workers CORS 프록시 — 지금은 앱에서 쓰지 않음, §"알려진 한계" 참고
  adapters/
    research-paper.json    기존 PERCA-CEAS 아티팩트 재현용
    science-middle.json    중등 과학 — 새 과목 증명용
  content/
    manifest.json          어떤 콘텐츠가 있는지 목록 (렌더러가 선택 화면을 그릴 때 사용)
    perca-ceas.json         원본 아티팩트 전체를 손실 없이 옮긴 콘텐츠 (수용 테스트 B)
    sci-m2-state-change.json  중2 과학 '물질의 상태 변화' 샘플 콘텐츠 (수용 테스트 C)
```

`adapters/`, `content/` 에 미리 담겨있는 것은 두 개의 "정적 예시"일 뿐입니다. "새 자료로
만들기"로 직접 생성한 콘텐츠/어댑터는 이 폴더의 파일이 아니라 각 사용자 브라우저의
IndexedDB(`study-loop` 데이터베이스)에 저장됩니다.

## 콘텐츠 HTML 처리

콘텐츠 JSON의 문자열(`original`, `assist`, 카드 `q`/`a`, 블록 `text` 등)은 **의도적으로
`innerHTML` 로 삽입**됩니다 — 본문 안에 `<b>`, `<sub>`, `<i>` 같은 인라인 서식과
`diagram` 블록의 `<svg>` 를 그대로 쓸 수 있어야 하기 때문입니다. 이건 설계이지 실수가
아니므로, 전부 이스케이프하는 방향으로 "고치면" 기존 콘텐츠가 깨집니다.

대신 삽입 직전에 `blocks.js` 의 `sanitizeHtml()` 이 **실행 가능한 것만** 걷어냅니다:

| 제거 | 유지 |
|---|---|
| `<script>`, `<iframe>`, `<object>`, `<embed>`, `<link>`, `<meta>`, `<base>`, `<form>` | `<b>`, `<sub>`, `<i>` 등 서식 태그 |
| `on*` 이벤트 핸들러 속성 (`onerror`, `onload` …) | `<svg>` 도형과 그 속성 (`viewBox`, `fill` …) |
| `javascript:` URL (`java\tscript:` 같은 우회 포함) | 표·목록·이미지 등 일반 마크업 |

브라우저 파서(`DOMParser`)로 한 번 훑는 방식이라 정규식 기반 필터보다 우회가 어렵습니다.
`esc()` 는 `&`/`<`/`>` 에 더해 따옴표(`"`, `'`)도 이스케이프합니다 — `figureCard` 의
`imageUri` 처럼 `esc()` 결과가 속성값 안에 들어가는 자리가 있어서입니다.

**왜 필요한가:** 직접 저작한 `content/*.json` 은 신뢰할 수 있지만, "새 자료로 만들기"로
들어온 **모델 출력도 똑같은 렌더 경로**를 탑니다. 자기 브라우저·자기 API 키 범위라
피해 반경은 좁지만, 삽입 지점을 한 군데로 모아 막아두는 편이 낫다고 판단했습니다.

정적 콘텐츠 두 개의 원시-HTML 문자열 **714개(태그 포함 153개)** 를 전부 통과시켜
파서 라운드트립 결과와 비교했을 때 **변경 0건** — 즉 기존 렌더 결과는 그대로입니다.

> 새 블록 타입을 추가할 때: 콘텐츠 문자열을 `innerHTML` 로 넣는다면 반드시
> `applyNotation()`(내부에서 살균함) 또는 `B.sanitizeHtml()` 을 거치게 하세요.
> 속성값 자리에는 `B.esc()` 를 쓰면 됩니다.

## 수용 테스트 결과

| # | 테스트 | 결과 |
|---|---|---|
| A | `grep -riE "perca\|RO2\|ceas\|주하이" renderer/` | 실제 도메인 언급 0건 (`uppercase` 안에 우연히 `perca` 부분 문자열이 잡히는 오탐 1건 제외) |
| B | `content/perca-ceas.json` + `adapters/research-paper.json` 렌더 | 5탭·진도·카드 66장·발표 리허설 모두 원본과 동일하게 재현됨 (헤드리스 브라우저로 확인) |
| C | `content/sci-m2-state-change.json` + `adapters/science-middle.json` 렌더 | 같은 5탭 흐름이 중2 과학 내용으로 정상 동작 |
| D | 새 과목 추가 | `science-middle.json` 어댑터 + 콘텐츠 파일 추가만으로 동작, renderer/ JS 0줄 수정 |
| E | 카드 진도 지속 | FSRS 카드 상태(`due`/`stability`/`difficulty`)가 `localStorage` 에 저장되어 새로고침 후에도 유지됨 (콘텐츠 id로 네임스페이스 분리) |
| F | 출처 결속 | 카드에 `sourceSpan`(교과서 p./행) 또는 `conceptId`(학습자료 모듈)가 있으면 "📖 원문 보기" 버튼이 뜨고, 클릭 시 해당 모듈로 자동 스크롤 |
| G | 읽기 수준 | `science-middle` 콘텐츠는 중2가 사전 없이 읽을 수 있는 문장으로 작성 |

## 지시서 §7 "빠진 것" 구현 현황

- **§7.1 간격 반복** — `ts-fsrs`(공식 오픈소스, MIT) 그대로 사용. `renderer/vendor/fsrs.bundle.js` 는 npm의
  `ts-fsrs@5.4.2` UMD 빌드를 그대로 복사한 것이며 수정하지 않았습니다.
- **§7.2 진도 저장 범위** — `progress.js` 가 `meta.id` 로 localStorage 키를 네임스페이스
  분리하므로 콘텐츠가 여러 개여도 서로 섞이지 않습니다.
- **§7.3 출처 결속 UI** — 카드에 한해 구현했습니다 (가장 값어치가 큰 지점). 원문 문단
  자체는 이미 "원문 읽기" 탭이 곧 출처이므로 별도 버튼을 달지 않았습니다.
- **§7.4 자기 설명 입력** — 카드 뒤집기 전에 텍스트 입력 → 뒤집으면 모범답안과 나란히
  비교 표시. 최소 형태로 구현했습니다 (자동 채점은 하지 않음).
- **§7.5 취약 지점 집계** — "다시"를 누른 횟수를 카드별로 집계해 상단에 "가장 약한
  항목 3개"로 노출합니다.

## 수정 이력

### 2026-10-02 — "새 자료로 만들기" 오류 메시지 정비

`fetch` 를 가짜 Claude 응답으로 바꿔 생성 파이프라인 전체를 점검하던 중, 실패 경로 두
곳에서 날것의 JS 오류가 모달에 그대로 노출되는 것을 발견해 고쳤습니다. 나머지 실패
경로는 모두 사람이 읽을 한국어 안내였는데 이 둘만 튀었습니다.

- **어댑터 결정 단계(2/5)의 누락된 가드** (`ingest.js`)
  `choice === "existing"` 쪽에는 "존재하지 않는 어댑터 id를 골랐습니다" 가드가 있었지만,
  `else` 쪽에는 아무 검사도 없었습니다. 게다가 `else` 는 `choice` 가 없거나 오타여도
  들어오는 **기본 분기**라, 모델이 스키마를 벗어나면 `adapterResolved` 가
  `undefined`/문자열이 되어 `Cannot set properties of undefined (setting '_isNew')`
  같은 TypeError가 사용자에게 그대로 보였습니다. 어댑터가 객체인지, `id` 가 문자열인지
  확인하고 각각 무엇이 잘못됐는지 알려주도록 했습니다. `id` 를 따로 보는 이유는 그 값이
  IndexedDB의 `keyPath` 이자 콘텐츠가 어댑터를 찾는 열쇠여서, 없으면 저장도 조회도
  조용히 깨지기 때문입니다.
- **JSON 재파싱이 두 번 실패할 때** (`ingest.js`)
  `SyntaxError: Unexpected token 'J' …` 가 그대로 올라왔습니다. `TOO_LONG_MSG` 옆에
  `BAD_JSON_MSG` 를 두고 톤을 맞췄습니다. 원인 파악용으로 원래 오류와 응답 앞부분
  500자는 `console.warn` 에 남깁니다(`blocks.js` 가 알 수 없는 블록 타입을 다루는 방식과 동일).

점검하면서 확인한 정상 동작: 5단계 호출 순서, 요청 헤더 3종, 잘림 재시도
(8192→16384→32768→64000 후 포기), JSON 1회 실패 후 복구, 중단(`AbortError`),
API 오류 전달, IndexedDB 저장·재조회, 생성 어댑터의 탭 라벨·카테고리·표기 규칙 적용.

스캔본 PDF 폴백(텍스트 25자 미만 → 페이지를 이미지로 렌더링)도 확인했습니다. 한 PDF
안에서 페이지별로 갈라지는 것까지 정상입니다 — 2페이지 테스트 PDF에서 긴 텍스트가 있는
1쪽은 텍스트 조각으로, 짧은 2쪽은 952×1347 PNG(scale 1.6)로 변환되어 Anthropic 요청에
각각 `text` 블록과 `image`(base64/png) 블록으로 실렸습니다.

> **알아둘 것 — 백그라운드 탭에서 멈춥니다.** pdf.js의 `page.render()` 는
> `requestAnimationFrame` 으로 구동되는데, 브라우저는 백그라운드 탭에서 rAF를 아예
> 발생시키지 않습니다(`document.hidden === true`). 그래서 **스캔본 PDF 추출 중에
> 사용자가 다른 탭으로 전환하면 그 자리에서 멈추고, 돌아와야 재개됩니다.** 생성이
> 몇 분 걸리는 작업이라 탭을 떠나기 쉬운 상황이므로 걸릴 만합니다. 텍스트 PDF·이미지
> 파일·텍스트 파일 경로는 rAF를 쓰지 않아 영향이 없습니다. 고치려면 렌더링을
> `OffscreenCanvas` + 워커로 옮기거나, 진행 중에는 탭을 떠나지 말라고 안내하면 됩니다.
> (위 검증은 rAF를 `setTimeout` 으로 대체해 pdf.js 코드 경로는 그대로 두고 구동만
> 시키는 방식으로 했습니다.)

### 2026-09-22 — 버그 수정 및 정리

- **카드 암기 탭에서 스페이스바 뒤집기가 동작하지 않던 버그** (`flashcard.js`)
  `_bindActions()` 가 생성자에서 한 번, 첫 `render()` 에서 툴바 버튼(섞기/진행 초기화)을
  만들면서 또 한 번 호출돼 `document` keydown 리스너가 두 개 붙었습니다. 스페이스 한 번에
  `_flip()` 이 두 번 실행돼 카드가 제자리로 돌아왔습니다 — 클릭 뒤집기와 `1`/`2` 키는
  `_rate()` 의 `if (!this.flipped) return` 가드 덕에 멀쩡해서 눈에 잘 안 띄었습니다.
  전역 리스너용 `_bindActions()` 와 툴바 전용 `_bindToolbarActions()` 로 분리해 각각
  한 번씩만 붙도록 고쳤습니다. (수정 전 `_flip` 2회 → 수정 후 1회, 브라우저로 확인)
- **키워드 암송 모드에서 표기 규칙이 적용되지 않던 문제** (`output.js`)
  `applyNotation(k, {})` 로 빈 어댑터를 넘기고 있어 화학식 아래첨자 변환이 빠졌습니다
  (바로 아래 대본 분기는 어댑터를 제대로 넘기고 있었음). `map` 의 `thisArg` 로 어댑터를
  넘기도록 고쳤습니다.
- **DB 버전을 올릴 때마다 사용자 콘텐츠가 지워지던 문제** (`storage.js`)
  `onupgradeneeded` 가 `oldVersion` 을 보지 않고 `contents` 스토어를 무조건 지우고 다시
  만들고 있었습니다. 잘못된 keyPath 수리는 v1→v2 경로에서만 필요하므로
  `event.oldVersion < 2` 조건을 달았습니다. 사용자가 만든 콘텐츠는 이 DB에만 있고 복구
  경로가 없어서(아래 §"알려진 한계" 참고) 앞으로 `DB_VERSION` 을 올려도 보존됩니다.
- **콘텐츠 선택 화면의 부제 처리** (`render.js`)
  길이와 무관하게 `…` 이 붙었고, 이스케이프한 **뒤에** 자르고 있어 `&amp;` 같은 엔티티가
  중간에서 끊길 수 있었습니다. 자르기를 이스케이프보다 먼저 하고, 120자를 넘을 때만
  말줄임표를 붙입니다.
- **콘텐츠 HTML 삽입 경로 정리** (`blocks.js`, `render.js`)
  `sanitizeHtml()` 도입, `esc()` 가 따옴표까지 이스케이프. 자세한 내용과 설계 의도는
  위 §"콘텐츠 HTML 처리" 참고.
- **중첩된 낡은 사본 제거** — `study-guide-template/study-guide-template/` 안에 하루 전
  스냅샷이 통째로(205개 파일, 3.9MB) 들어 있어 삭제했습니다. `README.md`·`ingest.js`·
  `ingest-ui.js` 세 개만 구버전이고 나머지는 바이트 단위로 동일했습니다.
- **git 저장소 초기화** — 이 폴더는 이제 git으로 관리됩니다(`main` 브랜치). 벤더링한
  공식 빌드의 바이트를 보존하려고 `core.autocrlf=false` 를 저장소에 설정했습니다.
  원격은 아직 연결하지 않았습니다.

## 알려진 한계 (다음 작업자를 위한 메모)

- **PERCA 콘텐츠의 `sourceSpan`** 은 대부분 `null` 입니다. 원본 아티팩트 자체에 페이지·행
  인용이 없었기 때문에(직접 저작한 요약 자료), 없는 값을 지어내지 않았습니다. 실제 논문
  PDF 페이지 번호로 채우려면 `content/perca-ceas.json` 을 별도로 보강해야 합니다.
- **`math-middle` 등 LaTeX 표기 어댑터**는 스키마 예시만 있고 실제 구현(KaTeX 연동 등)은
  하지 않았습니다. `adapters/` 의 `notation.render` 값 중 `chemical-subscript` 만 동작합니다.
- **자기 설명 입력의 자동 비교/채점**은 없습니다 (사람이 눈으로 비교).
- **모듈 m7(비교표 해설)과 m10(발표 대본)**은 원본 HTML에 표/블록 구조가 없어(설명 문장
  형태였음) `prose` 블록으로 옮겼습니다 — 내용을 지어내지 않고 있는 그대로 보존한 결과입니다.
- 이 결과물은 정적 파일 세트입니다. 실제 서비스(다기기 동기화, 회원별 저장)로 가려면
  `progress.js`/`flashcard.js` 의 localStorage 저장을 서버 API 호출로 바꾸면 됩니다
  (인터페이스는 이미 `get/set` 두 메서드로 분리되어 있어 교체 지점이 명확합니다).
- **"새 자료로 만들기"로 생성한 콘텐츠는 그 브라우저에만 저장**됩니다(IndexedDB). 다른
  기기·다른 브라우저에서 이어 보려면, 지금은 같은 브라우저를 계속 쓰거나 완성된 콘텐츠를
  `content/`, `adapters/` 에 파일로 옮겨 재배포하는 수밖에 없습니다. 진짜 다기기 동기화가
  필요하면 위 항목처럼 서버가 하나 있어야 합니다.
- `ingest.js` 의 생성 파이프라인은 원문에 없는 내용을 지어내지 말라는 규칙을 프롬프트에
  강하게 넣고 있지만, 이것도 결국 AI가 만든 결과라 사람이 손댄 PERCA 콘텐츠만큼의 정확도는
  보장하지 못합니다. 실제 시험 전 원문 대조를 권장한다고 README·앱 내 안내에 모두
  명시했습니다.
- `vendor/pdfjs/` 는 `pdfjs-dist@4.10.38`(Apache-2.0) 공식 빌드를 그대로 복사한 것이며
  v4부터 ESM 전용 배포라 `pdf-init.mjs` 라는 얇은 로더로 `window.pdfjsLib` 전역을 만들어
  씁니다 — pdf.js 자체 코드는 수정하지 않았습니다.
- **Gemini(Google)·OpenAI API 연동은 보류 상태입니다.** Claude API 하나만 지원합니다.
  Gemini는 Anthropic과 달리 브라우저 직접 호출(CORS)을 지원하지 않아 프록시 서버가
  필요한데(구글 공식 문서도 클라이언트 앱은 백엔드 프록시를 두라고 명시), 이 조건을
  다시 검토하기로 하고 이번엔 보류했습니다. 이미 만들어 검증까지 해둔 Cloudflare
  Workers 프록시 코드는 `proxy/gemini-proxy-worker.js` 에 남겨뒀습니다 — 나중에
  다시 연동하려면 `renderer/ingest.js`/`ingest-ui.js` 에 엔진 선택/자동전환 로직을
  다시 추가하면 됩니다(전에 한 번 구현했던 구조라 어렵지 않습니다).

## 새 과목을 추가하려면

1. `adapters/<과목id>.json` 작성 — `tabLabels`, `cardCategories`, `moduleCategories`, `notation` 채우기.
2. `content/<콘텐츠id>.json` 작성 — 이 문서 상단에서 링크한 지시서 §3 스키마를 그대로 따르기.
   `sourceSpan` 은 문단·카드에서 값을 지어내지 말고, 정말 있는 근거만 채울 것.
3. `content/manifest.json` 에 `{ "id": "...", "adapter": "..." }` 한 줄 추가.
4. `renderer/` 안의 어떤 파일도 건드리지 않는다 — 건드렸다면 설계가 잘못된 것.
