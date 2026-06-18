#!/usr/bin/env python3
"""Step 0: scan frontend for hardcoded UI strings not wired to i18n."""

from __future__ import annotations

import re
from collections import defaultdict
from html.parser import HTMLParser
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[1]
PAGES = FRONTEND / "src" / "pages"
JS_ROOT = FRONTEND / "src" / "assets" / "js"
PARTIALS = FRONTEND / "src" / "partials"

SKIP_HTML_TAGS = {
    "script",
    "style",
    "noscript",
    "svg",
    "path",
    "meta",
    "link",
    "head",
    "br",
    "hr",
    "img",
    "source",
    "track",
    "colgroup",
    "col",
}
SKIP_HTML_ATTRS = {"id", "class", "href", "src", "type", "name", "value", "for", "role", "hidden"}
VISIBLE_TEXT_MIN = 2

JS_UI_PATTERNS = [
    (r"\.textContent\s*=\s*(['\"`])(.+?)\1", "textContent"),
    (r"\.innerHTML\s*=\s*(['\"`])(.+?)\1", "innerHTML"),
    (r"\.placeholder\s*=\s*(['\"`])(.+?)\1", "placeholder"),
    (r"setAttribute\(\s*['\"]title['\"]\s*,\s*(['\"`])(.+?)\1", "title"),
    (r"setAttribute\(\s*['\"]aria-label['\"]\s*,\s*(['\"`])(.+?)\1", "aria-label"),
    (r"\.title\s*=\s*(['\"`])(.+?)\1", "title"),
    (r"alert\(\s*(['\"`])(.+?)\1", "alert"),
    (r"showNonBlockingWarning\(\s*(['\"`])(.+?)\1", "warning"),
]

JS_SKIP_PREFIXES = (
    "http",
    "https",
    "#",
    "/",
    "../",
    "./",
    "lhai-",
    "admin-",
    "partner-",
    "customer-",
    "data-",
    "is-",
    "has-",
    "btn-",
    "panel-",
    "tab-",
    "filter",
    "undefined",
    "null",
    "${",
    "<",
)
JS_SKIP_EXACT = {"", " ", "-", "—", "0", "1", "true", "false", "en", "ko", "es", "ja"}


def is_human_text(text: str) -> bool:
    t = re.sub(r"\s+", " ", (text or "").strip())
    if len(t) < VISIBLE_TEXT_MIN:
        return False
    if re.fullmatch(r"[\d\s.,:;+\-/%()]+", t):
        return False
    if re.fullmatch(r"[A-Za-z0-9_.\-:]+", t) and "_" in t:
        return False
    if t in JS_SKIP_EXACT:
        return False
    if any(t.startswith(p) for p in JS_SKIP_PREFIXES):
        return False
    # mostly code/template fragments
    if t.count("{") >= 2 and t.count("}") >= 2 and len(t) > 80:
        return False
    # needs letters (latin or cjk)
    if not re.search(r"[A-Za-z\u00C0-\u024F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]", t):
        return False
    return True


class PageHtmlParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.issues: list[dict] = []
        self._stack: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        self._stack.append(tag)
        if tag in SKIP_HTML_TAGS:
            self._skip_depth += 1
            return
        attr_map = {k: (v or "") for k, v in attrs}
        if tag == "title" and "data-i18n" in attr_map:
            return
        for attr, i18n_attr in (
            ("placeholder", "data-i18n-placeholder"),
            ("title", "data-i18n-title"),
            ("aria-label", "data-i18n-aria-label"),
        ):
            val = attr_map.get(attr, "").strip()
            if val and i18n_attr not in attr_map and is_human_text(val):
                self.issues.append(
                    {
                        "kind": f"missing-{attr}",
                        "tag": tag,
                        "text": val[:120],
                    }
                )

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in SKIP_HTML_TAGS and self._skip_depth:
            self._skip_depth -= 1
        if self._stack and self._stack[-1] == tag:
            self._stack.pop()

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        text = re.sub(r"\s+", " ", data.strip())
        if not is_human_text(text):
            return
        # parent tag is last in stack
        parent = self._stack[-1] if self._stack else ""
        if parent in SKIP_HTML_TAGS:
            return
        self.issues.append({"kind": "text-node", "tag": parent, "text": text[:120]})


def scan_html_file(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8", errors="replace")
    parser = PageHtmlParser()
    parser.feed(raw)

    # elements with data-i18n cover their text — approximate by counting bindings
    i18n_bindings = len(re.findall(r"data-i18n(?:-placeholder|-title|-aria-label)?=", raw))
    has_boot = bool(
        re.search(r"public-page-language-boot\.js", raw)
        or re.search(r"app-page-i18n-boot|app-header\.js", raw)
        or re.search(r"admin-static-shell\.js|customer-static-shell\.js", raw)
    )
    body_domains = re.search(r'data-lhai-i18n-domains="([^"]*)"', raw)
    boot_domains = re.search(r'data-i18n-domains="([^"]*)"', raw)

    # filter text-node issues on lines that also have data-i18n on same line
    filtered: list[dict] = []
    lines = raw.splitlines()
    for issue in parser.issues:
        if issue["kind"] != "text-node":
            filtered.append(issue)
            continue
        txt = issue["text"]
        covered = False
        for line in lines:
            if txt in line and "data-i18n" in line:
                covered = True
                break
        if not covered:
            filtered.append(issue)

    return {
        "path": str(path.relative_to(FRONTEND)).replace("\\", "/"),
        "issues": filtered,
        "i18n_bindings": i18n_bindings,
        "has_boot": has_boot,
        "body_domains": body_domains.group(1) if body_domains else None,
        "boot_domains": boot_domains.group(1) if boot_domains else None,
    }


def scan_js_file(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8", errors="replace")
    rel = str(path.relative_to(FRONTEND)).replace("\\", "/")
    if rel.endswith(
        (
            "i18n-client.js",
            "i18n-dom.js",
            "app-shell-locale.js",
            "auth-public-locale.js",
            "preferred-language.js",
            "public-page-i18n-config.js",
            "config.js",
        )
    ):
        return {"path": rel, "issues": [], "uses_t": "t(" in raw}

    issues: list[dict] = []
    for pattern, kind in JS_UI_PATTERNS:
        for m in re.finditer(pattern, raw, re.DOTALL):
            val = m.group(2)
            val = re.sub(r"\s+", " ", val.strip())
            if "${" in val or "`" in val:
                # template literal — keep if short human prefix
                val = val.split("${", 1)[0].strip()
            if not is_human_text(val):
                continue
            if "t(" in raw[max(0, m.start() - 80) : m.start() + 20]:
                continue
            issues.append({"kind": kind, "text": val[:120]})

    uses_t = "t(" in raw or "from \"../core/i18n-client.js\"" in raw or "from './i18n-client.js'" in raw
    uses_wire = "wireDynamicPageI18nRefresh" in raw
    uses_app_boot = "appPageLanguageReady" in raw
    uses_public_boot = "initPageI18nAndApplyDom" in raw or "initCommonI18nAndApplyDom" in raw

    return {
        "path": rel,
        "issues": issues,
        "uses_t": uses_t,
        "uses_wire": uses_wire,
        "uses_app_boot": uses_app_boot,
        "uses_public_boot": uses_public_boot,
    }


def main() -> None:
    html_results = [scan_html_file(p) for p in sorted(PAGES.glob("*.html"))]
    partial_results = [scan_html_file(p) for p in sorted(PARTIALS.glob("*.html"))] if PARTIALS.exists() else []
    js_results = [scan_js_file(p) for p in sorted(JS_ROOT.rglob("*.js"))]

    html_issue_count = sum(len(r["issues"]) for r in html_results)
    js_issue_count = sum(len(r["issues"]) for r in js_results)

    html_by_file = sorted(html_results, key=lambda r: len(r["issues"]), reverse=True)
    js_by_file = sorted(js_results, key=lambda r: len(r["issues"]), reverse=True)

    no_boot_pages = [r["path"] for r in html_results if not r["has_boot"]]
    no_domains_pages = [r["path"] for r in html_results if not r["body_domains"] and not r["boot_domains"]]

    combined_scores: dict[str, int] = defaultdict(int)
    for r in html_results:
        combined_scores[r["path"]] += len(r["issues"])
    for r in js_results:
        combined_scores[r["path"]] += len(r["issues"])

    top10 = sorted(combined_scores.items(), key=lambda x: x[1], reverse=True)[:10]

    print("=== SUMMARY ===")
    print(f"HTML pages scanned: {len(html_results)}")
    print(f"HTML hardcoded issues (approx): {html_issue_count}")
    print(f"JS files scanned: {len(js_results)}")
    print(f"JS hardcoded UI string assignments (approx): {js_issue_count}")
    print(f"Pages without i18n boot wiring: {len(no_boot_pages)}")
    print(f"Pages without domain declaration: {len(no_domains_pages)}")
    print()

    print("=== TOP 10 FILES (HTML path or JS path) ===")
    for path, score in top10:
        print(f"{score:4d}  {path}")
    print()

    print("=== HTML: TOP 15 BY ISSUE COUNT ===")
    for r in html_by_file[:15]:
        if not r["issues"]:
            continue
        print(f"{len(r['issues']):4d}  {r['path']}  (bindings={r['i18n_bindings']}, boot={r['has_boot']}, domains={r['body_domains'] or r['boot_domains']})")
    print()

    print("=== JS: TOP 15 BY ISSUE COUNT ===")
    for r in js_by_file[:15]:
        if not r["issues"]:
            continue
        flags = []
        if r.get("uses_t"):
            flags.append("t()")
        if r.get("uses_app_boot"):
            flags.append("app-boot")
        if r.get("uses_public_boot"):
            flags.append("page-i18n")
        if r.get("uses_wire"):
            flags.append("wire-refresh")
        print(f"{len(r['issues']):4d}  {r['path']}  [{', '.join(flags) or 'no-i18n'}]")
    print()

    print("=== PAGES WITHOUT BOOT ===")
    for p in no_boot_pages:
        print(p)
    print()

    print("=== PAGES WITHOUT DOMAIN DECLARATION ===")
    for p in no_domains_pages:
        print(p)
    print()

    print("=== SAMPLE HTML ISSUES (first file with most issues) ===")
    for r in html_by_file[:3]:
        if not r["issues"]:
            continue
        print(r["path"])
        for issue in r["issues"][:8]:
            print(f"  - [{issue['kind']}] <{issue.get('tag','')}> {issue['text']}")
    print()

    print("=== SAMPLE JS ISSUES (first file with most issues) ===")
    for r in js_by_file[:3]:
        if not r["issues"]:
            continue
        print(r["path"])
        for issue in r["issues"][:8]:
            print(f"  - [{issue['kind']}] {issue['text']}")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--detail":
        import re
        from pathlib import Path

        PAGES = Path(__file__).resolve().parents[1] / "src" / "pages"
        JS = Path(__file__).resolve().parents[1] / "src" / "assets" / "js"
        html_stats = []
        for p in sorted(PAGES.glob("*.html")):
            raw = p.read_text(encoding="utf-8")
            bindings = len(re.findall(r"data-i18n(?:-placeholder|-title|-aria-label)?=", raw))
            boot = bool(
                re.search(
                    r"public-page-language-boot|admin-static-shell|customer-static-shell|app-header\.js",
                    raw,
                )
            )
            domains_m = re.search(r'data-lhai-i18n-domains="([^"]+)"', raw)
            pub_m = re.search(r'data-i18n-domains="([^"]+)"', raw)
            html_stats.append(
                (
                    p.name,
                    bindings,
                    boot,
                    domains_m.group(1) if domains_m else (pub_m.group(1) if pub_m else None),
                )
            )
        zero_i18n = [n for n, b, _, _ in html_stats if b == 0]
        print("Pages with ZERO data-i18n bindings:", len(zero_i18n))
        for n in zero_i18n:
            print(" ", n)
        print()
        print("Pages by binding count (lowest 20):")
        for n, b, boot, dom in sorted(html_stats, key=lambda x: x[1])[:20]:
            print(f"  {b:3d}  {n}  boot={boot}  domains={dom}")
        js_pages = sorted((JS / "pages").glob("*.js"))
        no_t = []
        partial_t = []
        for p in js_pages:
            raw = p.read_text(encoding="utf-8")
            has_t = "t(" in raw
            has_wire = "wireDynamicPageI18nRefresh" in raw
            has_apply = "applyI18nToDom" in raw
            has_boot = "appPageLanguageReady" in raw or "publicPageLanguageReady" in raw
            assigns = len(re.findall(r"\.textContent\s*=|\.innerHTML\s*=", raw))
            if not has_t:
                no_t.append((p.name, assigns))
            elif assigns > 10 and not has_wire:
                partial_t.append((p.name, assigns, has_apply, has_boot))
        print()
        print("Page JS without t():", len(no_t))
        for n, a in sorted(no_t, key=lambda x: -x[1])[:15]:
            print(f"  {a:3d} assigns  {n}")
        print()
        print("Page JS with t() but heavy dynamic assigns (no wire refresh):")
        for row in sorted(partial_t, key=lambda x: -x[1])[:12]:
            print(f"  {row[1]:3d} assigns  {row[0]}  applyDom={row[2]} boot={row[3]}")
    else:
        main()
