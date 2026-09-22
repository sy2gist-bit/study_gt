/* gemini-proxy-worker.js — Cloudflare Workers 배포용.
 *
 * Gemini(Google) API는 Anthropic과 달리 브라우저에서 직접 fetch() 호출을 허용하지
 * 않는다(CORS 미지원). 이 워커는 그 문제만 해결한다 — 딱 한 가지 일만 한다:
 *
 *   study-guide-template 앱(브라우저) → 이 워커 → generativelanguage.googleapis.com
 *
 * 요청을 그대로 전달하고, 응답에 CORS 헤더만 붙여서 돌려준다. API 키를 저장하거나
 * 로그로 남기지 않는다 — 매 요청마다 사용자 자신의 키가 헤더에 실려 그대로 지나갈
 * 뿐이다. 그래서 이 워커를 배포하는 사람(성윤)뿐 아니라, 이 사이트를 쓰는 누구든
 * "자기 자신의" Gemini 키만 이 프록시를 거쳐 나간다 — 워커 배포자가 다른 사람의
 * 키를 볼 수 없다(요청/응답 바디를 읽거나 저장하는 코드가 아예 없음).
 *
 * 배포 방법 (무료, 5분):
 *   1. https://dash.cloudflare.com 에서 무료 계정 생성(신용카드 불필요)
 *   2. 왼쪽 메뉴 "Workers & Pages" → "Create" → "Create Worker"
 *   3. 이름은 아무거나(예: study-guide-gemini-proxy) → "Deploy"
 *   4. 배포된 워커의 "Edit code" 들어가서, 기본으로 채워진 코드를 전부 지우고
 *      이 파일 내용 전체를 붙여넣기 → 오른쪽 위 "Deploy"
 *   5. 워커 화면에 나오는 주소(예: https://study-guide-gemini-proxy.<계정>.workers.dev)를
 *      복사 → study-guide-template 앱의 "새 자료로 만들기" 모달 → "Gemini 프록시 URL"에 붙여넣기
 *
 * 무료 티어 한도(Cloudflare Workers 무료 플랜, 별도 결제수단 불필요)로도 개인이
 * 쓰기엔 충분하다. 더 필요해지면 그때 유료 플랜을 고려하면 된다.
 */

const ALLOWED_HOST = "generativelanguage.googleapis.com";
const PREFIX = "/gemini/";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type,x-goog-api-key",
  "Access-Control-Max-Age": "86400"
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    if (!url.pathname.startsWith(PREFIX)) {
      return new Response(
        "이 워커는 study-guide-template 전용 Gemini 프록시입니다. " +
        "/gemini/v1beta/... 형태로만 요청하세요.",
        { status: 404, headers: CORS_HEADERS }
      );
    }

    // "/gemini/v1beta/models/...:generateContent" → "/v1beta/models/...:generateContent"
    const targetPath = url.pathname.slice(PREFIX.length - 1);
    const targetUrl = "https://" + ALLOWED_HOST + targetPath + url.search;

    // 딱 필요한 헤더만 그대로 전달한다 — 그 외(쿠키 등)는 애초에 건드리지 않는다.
    const forwardHeaders = new Headers();
    const passthrough = ["content-type", "x-goog-api-key"];
    for (const name of passthrough) {
      const v = request.headers.get(name);
      if (v) forwardHeaders.set(name, v);
    }

    const init = {
      method: request.method,
      headers: forwardHeaders,
      body: (request.method === "GET" || request.method === "HEAD") ? undefined : await request.arrayBuffer()
    };

    let upstream;
    try {
      upstream = await fetch(targetUrl, init);
    } catch (err) {
      return new Response(
        JSON.stringify({ error: { message: "프록시에서 Gemini로 요청을 전달하지 못했습니다: " + err.message } }),
        { status: 502, headers: Object.assign({ "content-type": "application/json" }, CORS_HEADERS) }
      );
    }

    const respHeaders = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) respHeaders.set(k, v);
    return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
  }
};
