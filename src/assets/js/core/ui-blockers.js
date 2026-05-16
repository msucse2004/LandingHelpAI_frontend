/**
 * 전역 top-layer(주로 네이티브 `<dialog>` 모달)가 남아 화면이 반투명으로 덮이고
 * 클릭이 막히는 경우를 정리합니다. (이전 페이지의 showModal, BFCache 복원 등)
 *
 * 수동 진단(읽기 전용, DOM 미수정): 브라우저 콘솔에서
 *   window.__lhaiDiagnoseTopLayer("manual-check")
 */

let _pageshowRecoveryInstalled = false;

/** @param {DOMRectReadOnly | DOMRect} rect */
function _rectToPlain(rect) {
  if (!rect || typeof rect !== "object") return null;
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    bottom: rect.bottom,
    right: rect.right,
  };
}

/** @param {Element} el @param {number} maxDepth */
function _parentChainBrief(el, maxDepth = 4) {
  const parts = [];
  let node = el;
  for (let i = 0; i < maxDepth && node; i++) {
    if (node instanceof Element) {
      const id = node.id ? `#${node.id}` : "";
      const cn =
        node.className && typeof node.className === "string"
          ? String(node.className)
              .trim()
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 3)
              .join(".")
          : "";
      const cls = cn ? `.${cn}` : "";
      parts.push(`${node.tagName.toLowerCase()}${id}${cls}`);
    }
    node = node.parentElement;
  }
  return parts.join(" > ");
}

/** @param {number} vw @param {number} vh @param {DOMRect} rect */
function _viewportCoverageRatio(vw, vh, rect) {
  if (vw <= 0 || vh <= 0) return 0;
  const left = Math.max(rect.left, 0);
  const right = Math.min(rect.right, vw);
  const top = Math.max(rect.top, 0);
  const bottom = Math.min(rect.bottom, vh);
  const area = Math.max(0, right - left) * Math.max(0, bottom - top);
  return area / (vw * vh);
}

function _textPreview(el, maxLen = 80) {
  try {
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
  } catch {
    return "";
  }
}

/**
 * 셸 top-layer/오버레이 원인 추적용 진단(읽기 전용). DOM·스타일·속성을 변경하지 않습니다.
 * @param {string} [phase]
 */
export function diagnoseShellTopLayerBlockers(phase = "unspecified") {
  const label = `[lhai top-layer diagnose] ${phase}`;
  console.group(label);

  try {
    const body = document.body;
    const html = document.documentElement;
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;

    console.group("A. 현재 페이지");
    console.log({
      phase,
      pathname: window.location.pathname,
      readyState: document.readyState,
      timestamp: new Date().toISOString(),
      activeElement:
        document.activeElement &&
        `${document.activeElement.tagName}${document.activeElement.id ? `#${document.activeElement.id}` : ""}`,
      bodyClassName: body ? body.className : "(no body)",
      htmlClassName: html ? html.className : "(no html)",
    });
    console.groupEnd();

    console.group("B. 열린 dialog 목록 (query: dialog)");
    const dialogs = document.querySelectorAll("dialog");
    console.log("count:", dialogs.length);
    dialogs.forEach((d, i) => {
      const cs = window.getComputedStyle(d);
      const open = d instanceof HTMLDialogElement ? d.open : undefined;
      console.log(`dialog[${i}]`, {
        open,
        id: d.id || "",
        className: d.className || "",
        textPreview: _textPreview(d),
        display: cs.display,
        visibility: cs.visibility,
        zIndex: cs.zIndex,
        rect: _rectToPlain(d.getBoundingClientRect()),
      });
    });
    console.groupEnd();

    const overlaySelectors = [
      ".modal-backdrop",
      ".lhai-modal-backdrop",
      ".admin-services__intake-side-backdrop",
      ".admin-intake-preview-dialog",
      ".admin-services__intake-dialog",
      "[data-modal-backdrop]",
      "[data-overlay]",
      '[role="dialog"]',
      '[aria-modal="true"]',
      ".is-modal-open",
      ".has-open-dialog",
    ];
    const seenOverlay = new Set();
    /** @type {Element[]} */
    const overlayEls = [];
    for (const sel of overlaySelectors) {
      try {
        document.querySelectorAll(sel).forEach((el) => {
          if (seenOverlay.has(el)) return;
          seenOverlay.add(el);
          overlayEls.push(el);
        });
      } catch {
        /* invalid selector in older engines — skip */
      }
    }

    console.group("C. overlay/backdrop 후보");
    console.log("matched (deduped):", overlayEls.length);
    overlayEls.forEach((el, i) => {
      const cs = window.getComputedStyle(el);
      const inertIdl = el instanceof HTMLElement ? Boolean(el.inert) : undefined;
      console.log(`overlay[${i}]`, {
        tagName: el.tagName,
        id: el.id || "",
        className: el.className || "",
        hidden: el instanceof HTMLElement ? el.hidden : undefined,
        ariaHidden: el.getAttribute("aria-hidden"),
        inert: inertIdl,
        position: cs.position,
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        pointerEvents: cs.pointerEvents,
        zIndex: cs.zIndex,
        rect: _rectToPlain(el.getBoundingClientRect()),
      });
    });
    console.groupEnd();

    console.group("D. inert 요소");
    const inertNodes = document.querySelectorAll("[inert]");
    console.log("count:", inertNodes.length);
    inertNodes.forEach((el, i) => {
      console.log(`inert[${i}]`, {
        tagName: el.tagName,
        id: el.id || "",
        className: el.className || "",
        parentChain: _parentChainBrief(el),
      });
    });
    console.groupEnd();

    console.group('E. shell aria-hidden="true"');
    const shellSelectors = [
      "body",
      "#lhai-app-header-root",
      ".lhai-layout",
      ".lhai-sidebar",
      ".lhai-main",
      "main",
      "aside",
    ];
    shellSelectors.forEach((sel) => {
      let nodes;
      try {
        nodes = document.querySelectorAll(sel);
      } catch {
        return;
      }
      nodes.forEach((el, j) => {
        if (el.getAttribute("aria-hidden") !== "true") return;
        console.log(`${sel}[${j}]`, {
          tagName: el.tagName,
          id: el.id || "",
          className: el.className || "",
          parentChain: _parentChainBrief(el),
        });
      });
    });
    console.groupEnd();

    console.group("F. body/html computed");
    if (body && html) {
      const bcs = window.getComputedStyle(body);
      const hcs = window.getComputedStyle(html);
      console.log({
        bodyOverflow: bcs.overflow,
        bodyPointerEvents: bcs.pointerEvents,
        bodyPosition: bcs.position,
        bodyZIndex: bcs.zIndex,
        htmlOverflow: hcs.overflow,
        htmlPointerEvents: hcs.pointerEvents,
      });
      try {
        console.log({
          bodyInert: Boolean(body.inert),
          htmlInert: Boolean(html.inert),
          bodyStyleAttrOverflow: body.getAttribute("style"),
          bodyOpenDialogs: document.querySelectorAll("dialog[open]").length,
        });
      } catch {
        /* ignore */
      }
    } else {
      console.log("(body/html 없음)");
    }
    console.groupEnd();

    console.group("G. fixed/sticky 대형 후보 (제한 순회)");
    const MAX_NODES = 2500;
    const MAX_LOGGED = 28;
    /** @type {Element[]} */
    const fixedCandidates = [];
    if (body) {
      const all = body.querySelectorAll("*");
      const n = Math.min(all.length, MAX_NODES);
      for (let i = 0; i < n; i++) {
        const el = all[i];
        if (!(el instanceof Element)) continue;
        const cs = window.getComputedStyle(el);
        const pos = cs.position;
        if (pos !== "fixed" && pos !== "sticky") continue;
        if (cs.display === "none") continue;
        if (cs.visibility === "hidden") continue;
        if (cs.opacity === "0") continue;
        if (cs.pointerEvents === "none") continue;
        const rect = el.getBoundingClientRect();
        const cov = _viewportCoverageRatio(vw, vh, rect);
        if (cov < 0.6) continue;
        const zi = cs.zIndex;
        const ziNum = parseInt(String(zi), 10);
        /* z-index:auto 인 전체 화면 고정 레이어는 기존 로직에서 누락됨 → 매우 큰 덮개만 추가 포함 */
        const zIndexed = zi !== "auto" || (!Number.isNaN(ziNum) && ziNum >= 10);
        if (!zIndexed && cov < 0.88) continue;
        fixedCandidates.push(el);
        if (fixedCandidates.length >= MAX_LOGGED) break;
      }
    }
    console.log(`visited up to ${MAX_NODES} nodes, logged up to ${MAX_LOGGED}`);
    fixedCandidates.forEach((el, i) => {
      const cs = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      console.log(`fixedLayer[${i}]`, {
        tagName: el.tagName,
        id: el.id || "",
        className: el.className || "",
        zIndex: cs.zIndex,
        pointerEvents: cs.pointerEvents,
        opacity: cs.opacity,
        rect: _rectToPlain(rect),
        textPreview: _textPreview(el),
      });
    });
    console.groupEnd();

    console.group("H. 화면 중앙 elementsFromPoint 스택 (상위 14개)");
    try {
      const cx = Math.floor(vw / 2);
      const cy = Math.floor(vh / 2);
      const stack = document.elementsFromPoint(cx, cy).slice(0, 14);
      stack.forEach((el, i) => {
        if (!(el instanceof Element)) return;
        const cs = window.getComputedStyle(el);
        console.log(`hit[${i}]`, {
          tag: el.tagName,
          id: el.id || "",
          className: (el.className && String(el.className).slice(0, 160)) || "",
          pointerEvents: cs.pointerEvents,
          opacity: cs.opacity,
          position: cs.position,
          zIndex: cs.zIndex,
          rect: _rectToPlain(el.getBoundingClientRect()),
        });
      });
    } catch (err) {
      console.log("hit stack failed", err);
    }
    console.groupEnd();
  } finally {
    console.groupEnd();
  }
}

if (typeof window !== "undefined") {
  window.__lhaiDiagnoseTopLayer = diagnoseShellTopLayerBlockers;
}

function _isPartnerShellPage() {
  const p = (window.location.pathname || "").split("/").pop() || "";
  return p.startsWith("partner-");
}

function _installPartnerPageshowRecovery() {
  if (_pageshowRecoveryInstalled) return;
  _pageshowRecoveryInstalled = true;
  window.addEventListener("pageshow", () => {
    if (!_isPartnerShellPage()) return;
    // persisted(BFCache) 뿐 아니라 일반 표시에서도 호출: 다른 탭·히스토리에서 열린 dialog
    // backdrop이 남아 파트너 셸 전체가 회색·무클릭처럼 보이는 경우를 정리합니다.
    clearShellTopLayerBlockers();
  });
}

/**
 * 열린 네이티브 `<dialog>`를 모두 닫아 ::backdrop top-layer를 제거합니다.
 * (파트너 셸 HTML에는 dialog가 없으므로, 잔여물만 대상으로 해도 안전합니다.)
 */
function _unlockPartnerShellDocumentInteraction() {
  /* 모달 dialog 닫은 뒤에도 Chromium 등에서 body에 남는 inert / overflow:hidden / pointer-events:none 정리 */
  try {
    document.documentElement.removeAttribute("inert");
    document.body.removeAttribute("inert");
    document.documentElement.style.removeProperty("overflow");
    document.body.style.removeProperty("overflow");
    document.documentElement.style.removeProperty("pointer-events");
    document.body.style.removeProperty("pointer-events");
  } catch {
    /* ignore */
  }
  document.querySelectorAll("[inert]").forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    try {
      el.removeAttribute("inert");
      el.inert = false;
    } catch {
      /* ignore */
    }
  });

  /* dialog 열림 수는 0인데도 모달 스택이 남은 경우: html/body·레이아웃 루트에 aria-hidden="true"만 남음 (진단 E구역) */
  const shellAriaRoots = [
    document.documentElement,
    document.body,
    document.querySelector("#lhai-app-header-root"),
    document.querySelector(".lhai-layout"),
    document.querySelector(".lhai-sidebar"),
    document.querySelector(".lhai-main"),
  ];
  shellAriaRoots.forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    try {
      if (el.getAttribute("aria-hidden") === "true") {
        el.removeAttribute("aria-hidden");
      }
    } catch {
      /* ignore */
    }
  });

  /* 관리 셸 전용 스크림이 DOM에 남아 있는 경우(비정상 공유·복원) — 파트너 페이지에서는 항상 숨김 */
  document.querySelectorAll(".admin-services__intake-side-backdrop").forEach((el) => {
    if (el instanceof HTMLElement) el.hidden = true;
  });
}

export function clearShellTopLayerBlockers() {
  _installPartnerPageshowRecovery();
  document.querySelectorAll("dialog").forEach((el) => {
    if (!(el instanceof HTMLDialogElement)) return;
    try {
      if (el.open) el.close();
    } catch {
      /* ignore */
    }
  });

  if (!_isPartnerShellPage()) return;

  _unlockPartnerShellDocumentInteraction();
}
