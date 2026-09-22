// pdf.js 는 ESM으로만 배포되어 일반 <script> 전역이 없다.
// 이 모듈이 import 해서 window.pdfjsLib 전역으로 노출해준다.
import * as pdfjsLib from "./pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./pdf.worker.min.mjs", import.meta.url).href;

window.pdfjsLib = pdfjsLib;
window.__pdfjsCmapUrl = new URL("./cmaps/", import.meta.url).href;
window.__pdfjsFontUrl = new URL("./standard_fonts/", import.meta.url).href;
window.dispatchEvent(new Event("study:pdfjs-ready"));
