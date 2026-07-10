#!/usr/bin/env node
/**
 * Step 1 — Full-page i18n audit for Landing Help AI frontend.
 *
 * Verifies that UI respects *selected language*:
 * - logged-in account preferred_language_code
 * - language dropdown / getEffectiveLanguage()
 * NOT survey_submission.common_info.preferred_language (except survey intake itself).
 *
 * Usage:
 *   node scripts/audit-i18n-coverage.mjs
 *   node scripts/audit-i18n-coverage.mjs --summary
 *   node scripts/audit-i18n-coverage.mjs --json
 *   node scripts/audit-i18n-coverage.mjs --fallbacks
 *   node scripts/audit-i18n-coverage.mjs --local-ko-bundles
 *
 * Step 6 — ``--local-ko-bundles`` lists temporary local KO page bundles (allowed until
 * StringTranslation runtime coverage is verified; see page-locale-migration-status.json).
 *
 * Step 4 — ``t(key, fallback)`` / ``ti(key, fallback)`` / ``localizedStatus(key, fallback)``
 * fallbacks must be English source text (not Korean/CJK). Violations exit with code 1
 * (--fallbacks lists them only).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(__dirname, "..");
const PAGES_DIR = path.join(FRONTEND_ROOT, "src", "pages");
const JS_PAGES_DIR = path.join(FRONTEND_ROOT, "src", "assets", "js", "pages");
const JS_COMPONENTS_DIR = path.join(FRONTEND_ROOT, "src", "assets", "js", "components");
const JS_LAYOUTS_DIR = path.join(FRONTEND_ROOT, "src", "assets", "js", "layouts");
const JS_DIR = path.join(FRONTEND_ROOT, "src", "assets", "js");

const VISIBLE_TEXT_MIN = 2;
const KOREAN_RE = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/;
const CJK_RE = /[\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/;
const LATIN_RE = /[A-Za-z]/;

const LOCAL_KO_BUNDLE_FILES = new Set([
  "quote-detail-locale.js",
  "invoice-detail-locale.js",
  "schedule-page-locale.js",
  "documents-page-locale.js",
]);

const MIGRATION_STATUS_PATH = path.join(__dirname, "page-locale-migration-status.json");

const ALLOWLIST_BASENAMES = new Set([
  "app-shell-locale.js",
  "auth-public-locale.js",
  "localization-locale.js",
  "quote-detail-locale.js",
  "invoice-detail-locale.js",
  "schedule-page-locale.js",
  "documents-page-locale.js",
  "dashboard-locale.js",
  "i18n-client.js",
  "i18n-dom.js",
  "i18n-dynamic.js",
  "public-page-i18n-config.js",
  "app-page-i18n-boot.js",
  "public-page-language-boot.js",
  "preferred-language.js",
  "config.js",
]);

const DOMAIN_HINTS = {
  dashboard: ["common", "nav", "dashboard"],
  messages: ["common", "nav", "messages"],
  profile: ["common", "nav", "profile"],
  password: ["common", "nav", "auth"],
  documents: ["common", "nav", "documents"],
  schedule: ["common", "nav", "schedule"],
  completion: ["common", "nav", "completion"],
  cases: ["common", "nav", "cases"],
  "case-detail": ["common", "nav", "cases"],
  "quote-detail": ["common", "nav", "customer.quote"],
  "invoice-detail": ["common", "nav", "customer.invoice"],
  login: ["common", "auth"],
  signup: ["common", "auth"],
  "forgot-password": ["common", "auth"],
  "reset-password": ["common", "auth"],
  "verify-email": ["common", "auth"],
  "find-username": ["common", "auth"],
  services: ["common", "services"],
  "survey-start": ["common", "survey"],
  "survey-branching": ["common", "survey"],
  "survey-recommendations": ["common", "survey"],
  "survey-submitted": ["common", "survey"],
  "customer-bid-results": ["common", "nav", "bidding"],
  "partner-dashboard": ["common", "nav", "partner"],
  "partner-bid-request": ["common", "nav", "partner"],
  "partner-assigned-request": ["common", "nav", "partner"],
  "admin-dashboard": ["common", "nav", "admin"],
  "admin-localization": ["common", "nav", "admin", "localization"],
  "admin-services": ["common", "nav", "admin"],
  "admin-quotes": ["common", "nav", "admin"],
  "admin-invoices": ["common", "nav", "admin"],
  "admin-message-translations": ["common", "nav", "admin", "localization"],
};

/** @type {Set<string>} */
let knownLocaleStrings = new Set();

function readFileSafe(absPath) {
  try {
    return fs.readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
}

function walkFiles(dir, ext, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(abs, ext, out);
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      out.push(abs);
    }
  }
  return out;
}

function relPath(absPath) {
  return path.relative(FRONTEND_ROOT, absPath).replace(/\\/g, "/");
}

const SCAN_DIRS = [JS_PAGES_DIR, JS_COMPONENTS_DIR, JS_LAYOUTS_DIR];

function loadPageLocaleMigrationStatus() {
  const raw = readFileSafe(MIGRATION_STATUS_PATH);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Step 6 — local KO bundles are temporary until StringTranslation covers the page.
 * @returns {{ file: string, line: number, text: string, category: string, detail?: string }[]}
 */
function auditTemporaryLocalKoBundles() {
  const findings = [];
  const migration = loadPageLocaleMigrationStatus();
  const pagesByFile = new Map();
  if (migration?.pages) {
    for (const page of migration.pages) {
      pagesByFile.set(path.basename(page.localeFile), page);
    }
  }

  for (const abs of walkFiles(JS_PAGES_DIR, ".js")) {
    const rel = relPath(abs);
    const base = path.basename(rel);
    if (!LOCAL_KO_BUNDLE_FILES.has(base)) continue;
    const raw = readFileSafe(abs);
    if (!raw) continue;
    if (!/\bconst\s+KO\s*=/.test(raw)) continue;

    const pageMeta = pagesByFile.get(base);
    const status = pageMeta?.status || "unknown";
    const line = lineNumberAt(raw, raw.search(/\bconst\s+KO\s*=/));
    findings.push({
      file: rel,
      line,
      text: base,
      category: "local_ko_bundle_temporary",
      detail: pageMeta
        ? `temporary local KO bundle (${pageMeta.seededKeys}/${pageMeta.totalKeys} seeded; status=${status})`
        : "temporary local KO bundle — run export-local-page-bundles-to-ui-seed.mjs",
    });
  }
  return findings;
}

function printLocalKoBundleAudit(findings, migration) {
  console.log("=== Step 6 — temporary local KO page bundles ===");
  if (migration?.policy) {
    console.log(`Policy: ${migration.policy.localKoBundle}`);
  }
  if (!findings.length) {
    console.log("ok: no local KO bundle objects in target page locale files");
    return;
  }
  for (const f of findings) {
    console.log(`${f.file}:${f.line} [${f.category}] ${f.detail}`);
  }
  console.log(`\nTotal: ${findings.length} (allowed temporarily; remove KO after runtime StringTranslation verified)`);
  if (migration?.pages) {
    console.log("\nPer-page migration status:");
    for (const p of migration.pages) {
      console.log(
        `  ${p.id}: ${p.status} | keys ${p.seededKeys}/${p.totalKeys} | KO local: ${p.koLocalObjectPresent ? "yes" : "no"}`,
      );
    }
  }
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function normalizeHumanText(text) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

const JS_SKIP_EXACT = new Set(["", " ", "-", "—", "0", "1", "true", "false", "en", "ko", "es", "ja", "zh", "OK"]);
const JS_SKIP_PREFIXES = [
  "http://",
  "https://",
  "#",
  "/api/",
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
  "Bearer ",
  "application/",
  "text/",
  "module",
];

function isHumanText(text) {
  const t = normalizeHumanText(text);
  if (t.length < VISIBLE_TEXT_MIN) return false;
  if (/^[\d\s.,:;+\-/%()]+$/.test(t)) return false;
  if (/^[A-Za-z0-9_.\-:]+$/.test(t) && t.includes("_")) return false;
  if (JS_SKIP_EXACT.has(t)) return false;
  if (JS_SKIP_PREFIXES.some((p) => t.startsWith(p))) return false;
  if ((t.match(/\{/g) || []).length >= 2 && (t.match(/\}/g) || []).length >= 2 && t.length > 80) return false;
  if (!/[A-Za-z\u00C0-\u024F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/.test(t)) return false;
  return true;
}

function isLocaleDictionaryFile(relPath) {
  const base = path.basename(relPath);
  if (ALLOWLIST_BASENAMES.has(base)) return true;
  if (/-locale\.js$/i.test(base)) return true;
  return false;
}

function isTestFile(relPath) {
  const norm = relPath.replace(/\\/g, "/");
  return (
    norm.includes("/tests/") ||
    norm.includes("/test/") ||
    /\.test\.(js|mjs|cjs)$/i.test(norm) ||
    /\.spec\.(js|mjs|cjs)$/i.test(norm) ||
    /-test\.js$/i.test(norm)
  );
}

function isAllowlisted(relPath) {
  const base = path.basename(relPath);
  if (ALLOWLIST_BASENAMES.has(base)) return true;
  if (isLocaleDictionaryFile(relPath)) return true;
  if (isTestFile(relPath)) return true;
  return false;
}

function isKnownLocaleString(text) {
  const t = normalizeHumanText(text);
  if (!t) return false;
  if (knownLocaleStrings.has(t)) return true;
  for (const known of knownLocaleStrings) {
    if (known.length >= 8 && t.includes(known)) return true;
  }
  return false;
}

function isDeveloperOnlyContext(line) {
  const trimmed = line.trim();
  if (/console\.(log|debug|info|warn|error|trace)\s*\(/.test(trimmed)) return true;
  if (/\/\/\s*eslint|@ts-ignore|istanbul ignore/.test(trimmed)) return true;
  if (/^\s*\/\//.test(trimmed) && !KOREAN_RE.test(trimmed)) return true;
  return false;
}

function isApiOrTechnicalString(text) {
  const t = normalizeHumanText(text);
  if (!t) return true;
  if (/^https?:\/\//i.test(t)) return true;
  if (/^\/api\//i.test(t)) return true;
  if (/^[A-Z][A-Z0-9_]{2,}$/.test(t)) return true;
  if (/^[a-z0-9_.-]+\.(html|js|css|json|png|jpg|svg)$/i.test(t)) return true;
  if (/^v?\d+\.\d+/.test(t)) return true;
  return false;
}

function isEnglishFallback(text) {
  const t = normalizeHumanText(text);
  if (!t) return true;
  if (KOREAN_RE.test(t) || /[\u3040-\u30FF\u3400-\u9FFF]/.test(t)) return false;
  if (/[àáâãäåæçèéêëìíîïñòóôõöùúûüýÿ]/i.test(t)) return false;
  return LATIN_RE.test(t) || /^[\d\s.,:;+\-/%()'"]+$/.test(t);
}

function extractQuotedStringsFromLocaleFiles() {
  const jsFiles = walkFiles(JS_DIR, ".js");
  for (const abs of jsFiles) {
    const rel = relPath(abs);
    if (!isLocaleDictionaryFile(rel)) continue;
    const raw = readFileSafe(abs);
    if (!raw) continue;
    const re = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
    let m;
    while ((m = re.exec(raw)) !== null) {
      const val = m[2].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\'/g, "'");
      if (KOREAN_RE.test(val) || (isHumanText(val) && val.length >= 3)) {
        knownLocaleStrings.add(normalizeHumanText(val));
      }
    }
  }
}

function stripJsComments(code) {
  let out = "";
  let i = 0;
  const len = code.length;
  while (i < len) {
    const ch = code[i];
    const next = code[i + 1];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < len) {
        const c = code[i];
        out += c;
        if (c === "\\") {
          i += 1;
          if (i < len) {
            out += code[i];
            i += 1;
          }
          continue;
        }
        if (c === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < len && code[i] !== "\n") i += 1;
      out += "\n";
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < len && !(code[i] === "*" && code[i + 1] === "/")) i += 1;
      i += 2;
      out += " ";
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function dedupeFindings(findings) {
  const seen = new Set();
  const out = [];
  for (const f of findings) {
    const key = `${f.file}:${f.line}:${f.category}:${f.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

function usesI18nNear(raw, index) {
  const windowStart = Math.max(0, index - 120);
  const slice = raw.slice(windowStart, index + 40);
  return /\bt\s*\(|localizedStatus\s*\(|setLocalizedText\s*\(|localizedOption\s*\(/.test(slice);
}

function parseScriptModules(html) {
  const scripts = [];
  const re = /<script[^>]*type\s*=\s*["']module["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const srcMatch = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (!srcMatch) continue;
    const domainsMatch = tag.match(/\bdata-i18n-domains\s*=\s*["']([^"']+)["']/i);
    scripts.push({
      src: srcMatch[1].split("?")[0],
      domains: domainsMatch
        ? domainsMatch[1]
            .split(",")
            .map((d) => d.trim())
            .filter(Boolean)
        : [],
    });
  }
  return scripts;
}

function resolveJsImportPath(fromAbs, importPath) {
  if (!importPath.startsWith(".")) return null;
  const resolved = path.normalize(path.join(path.dirname(fromAbs), importPath));
  if (fs.existsSync(resolved)) return resolved;
  if (fs.existsSync(`${resolved}.js`)) return `${resolved}.js`;
  return null;
}

function collectTransitiveImports(entryAbs, maxDepth = 4) {
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {string[]} */
  const queue = [{ abs: entryAbs, depth: 0 }];
  while (queue.length) {
    const { abs, depth } = queue.shift();
    if (!abs || seen.has(abs) || depth > maxDepth) continue;
    seen.add(abs);
    const raw = readFileSafe(abs);
    if (!raw) continue;
    const importRe = /\bfrom\s+["']([^"']+)["']/g;
    let m;
    while ((m = importRe.exec(raw)) !== null) {
      const target = resolveJsImportPath(abs, m[1]);
      if (target) queue.push({ abs: target, depth: depth + 1 });
    }
  }
  return [...seen].map(relPath);
}

function parseDeclaredDomains(html) {
  const domains = new Set();
  const bodyMatch = html.match(/\bdata-(?:lhai-)?i18n-domains\s*=\s*["']([^"']+)["']/i);
  if (bodyMatch) {
    for (const d of bodyMatch[1].split(",")) {
      const v = d.trim();
      if (v) domains.add(v);
    }
  }
  for (const script of parseScriptModules(html)) {
    for (const d of script.domains) domains.add(d);
  }
  return [...domains];
}

function suggestDomainsForPage(pageBase) {
  const stem = pageBase.replace(/\.html$/i, "");
  const hinted = DOMAIN_HINTS[stem];
  if (hinted) return [...hinted];
  if (stem.startsWith("admin-")) return ["common", "nav", "admin"];
  if (stem.startsWith("partner-")) return ["common", "nav", "partner"];
  if (stem.startsWith("survey-")) return ["common", "survey"];
  return ["common"];
}

function buildPageRegistry() {
  /** @type {Map<string, { htmlRel: string, htmlAbs: string, scripts: object[], pageJs: string[], allJs: string[], isPublic: boolean, isApp: boolean, hasShell: boolean, declaredDomains: string[] }>} */
  const registry = new Map();
  const htmlFiles = walkFiles(PAGES_DIR, ".html");
  for (const htmlAbs of htmlFiles) {
    const htmlRel = relPath(htmlAbs);
    const html = readFileSafe(htmlAbs) || "";
    const pageBase = path.basename(htmlAbs);
    const scripts = parseScriptModules(html);
    const scriptRels = scripts.map((s) => {
      const normalized = s.src.replace(/^\.\.\//, "src/");
      return normalized.startsWith("src/") ? normalized : `src/assets/js/${normalized.replace(/^\.\.\/assets\/js\//, "")}`;
    });

    /** @type {string[]} */
    const pageJs = [];
    for (const s of scripts) {
      if (/\/pages\/[^/]+\.js$/i.test(s.src)) {
        const abs = path.normalize(path.join(path.dirname(htmlAbs), s.src));
        pageJs.push(relPath(abs));
      }
    }

    const allJsSet = new Set();
    for (const s of scripts) {
      const abs = path.normalize(path.join(path.dirname(htmlAbs), s.src));
      if (fs.existsSync(abs)) {
        allJsSet.add(relPath(abs));
        for (const imp of collectTransitiveImports(abs)) allJsSet.add(imp);
      }
    }

    registry.set(pageBase, {
      htmlRel,
      htmlAbs,
      scripts,
      pageJs,
      allJs: [...allJsSet],
      isPublic: scripts.some((s) => s.src.includes("public-page-language-boot")),
      isApp: scripts.some((s) => s.src.includes("app-header")),
      hasShell: scripts.some((s) => /-(static-shell)\.js/.test(s.src)),
      declaredDomains: parseDeclaredDomains(html),
    });
  }
  return registry;
}

/**
 * @returns {{ file: string, line: number, text: string, category: string, detail?: string }[]}
 */
function auditHtmlHardcoded(rel, raw) {
  if (isAllowlisted(rel)) return [];
  const findings = [];
  const lines = raw.split(/\r?\n/);
  const attrChecks = [
    ["placeholder", "data-i18n-placeholder", "html_attr_without_i18n"],
    ["title", "data-i18n-title", "html_attr_without_i18n"],
    ["aria-label", "data-i18n-aria-label", "html_attr_without_i18n"],
  ];

  for (let li = 0; li < lines.length; li += 1) {
    const line = lines[li];
    const lineNo = li + 1;
    if (isDeveloperOnlyContext(line)) continue;

    for (const [attr, i18nAttr, category] of attrChecks) {
      const attrRe = new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)')`, "gi");
      let m;
      while ((m = attrRe.exec(line)) !== null) {
        const val = m[2] ?? m[3] ?? "";
        if (!isHumanText(val)) continue;
        if (line.includes(i18nAttr)) continue;
        if (isKnownLocaleString(val)) continue;
        const hasKo = KOREAN_RE.test(val);
        const hasEn = LATIN_RE.test(val) && !KOREAN_RE.test(val);
        if (!hasKo && !hasEn) continue;
        findings.push({
          file: rel,
          line: lineNo,
          text: val.slice(0, 120),
          category,
          detail: `${attr} without ${i18nAttr}`,
        });
      }
    }

    const textRe = />([^<]+)</g;
    let tm;
    while ((tm = textRe.exec(line)) !== null) {
      const text = normalizeHumanText(tm[1]);
      if (!isHumanText(text)) continue;
      if (/^[\u25CB\u25CF●○]$/.test(text)) continue;
      if (/<option\b/i.test(line)) continue;
      if (/data-i18n(?:-default)?=/.test(line)) continue;
      if (isKnownLocaleString(text)) continue;
      const hasKo = KOREAN_RE.test(text);
      const hasEn = LATIN_RE.test(text) && !KOREAN_RE.test(text);
      if (!hasKo && !hasEn) continue;
      findings.push({
        file: rel,
        line: lineNo,
        text: text.slice(0, 120),
        category: "html_text_without_data_i18n",
        detail: "visible text node",
      });
    }
  }
  return dedupeFindings(findings);
}

const JS_UI_PATTERNS = [
  { regex: /\.textContent\s*=\s*(['"`])([\s\S]*?)\1/g, reason: "js_korean_ui_string" },
  { regex: /\.innerHTML\s*=\s*(['"`])([\s\S]*?)\1/g, reason: "js_korean_ui_string" },
  { regex: /\.placeholder\s*=\s*(['"`])([\s\S]*?)\1/g, reason: "js_korean_ui_string" },
  { regex: /setAttribute\(\s*['"]title['"]\s*,\s*(['"`])([\s\S]*?)\1/g, reason: "js_korean_ui_string" },
  { regex: /setAttribute\(\s*['"]aria-label['"]\s*,\s*(['"`])([\s\S]*?)\1/g, reason: "js_korean_ui_string" },
  { regex: /\balert\(\s*(['"`])([\s\S]*?)\1/g, reason: "js_korean_ui_string" },
];

/**
 * @returns {{ file: string, line: number, text: string, category: string, detail?: string }[]}
 */
function auditJsFile(rel, raw) {
  if (isAllowlisted(rel)) return [];
  const findings = [];
  const stripped = stripJsComments(raw);

  for (const { regex, reason } of JS_UI_PATTERNS) {
    regex.lastIndex = 0;
    let m;
    while ((m = regex.exec(stripped)) !== null) {
      let val = m[2];
      if (m[1] === "`" && val.includes("${")) val = val.split("${")[0];
      val = normalizeHumanText(val.replace(/\\n/g, " "));
      if (!KOREAN_RE.test(val)) continue;
      if (!isHumanText(val)) continue;
      if (usesI18nNear(stripped, m.index)) continue;
      if (isKnownLocaleString(val)) continue;
      if (reason.includes("innerHTML") && (val.startsWith("<") || val.includes("class="))) continue;
      findings.push({
        file: rel,
        line: lineNumberAt(raw, m.index),
        text: val.slice(0, 120),
        category: "js_korean_hardcoded",
        detail: reason,
      });
    }
  }

  const strRe = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
  let sm;
  while ((sm = strRe.exec(stripped)) !== null) {
    const val = sm[2].replace(/\\n/g, "\n");
    if (!KOREAN_RE.test(val)) continue;
    if (!isHumanText(val) && val.length < 2) continue;
    if (isKnownLocaleString(val)) continue;
    if (isApiOrTechnicalString(val)) continue;
    const idx = sm.index;
    const line = lineNumberAt(raw, idx);
    const lineText = raw.split(/\r?\n/)[line - 1] || "";
    if (isDeveloperOnlyContext(lineText)) continue;
    if (usesI18nNear(stripped, idx)) continue;
    findings.push({
      file: rel,
      line,
      text: normalizeHumanText(val).slice(0, 120),
      category: "js_korean_hardcoded",
      detail: "Korean string literal",
    });
  }

  return dedupeFindings(findings);
}

function auditNonEnglishTFallbacks(rel, raw) {
  if (isAllowlisted(rel)) return [];
  const findings = [];
  const stripped = stripJsComments(raw);
  const callPatterns = [
    { fn: "t", re: /\bt\s*\(\s*(['"`])([^'"`]+)\1\s*,\s*(['"`])((?:\\.|(?!\3)[^\\])*)\3/gs },
    { fn: "ti", re: /\bti\s*\(\s*(['"`])([^'"`]+)\1\s*,\s*(['"`])((?:\\.|(?!\4)[^\\])*)\4/gs },
    {
      fn: "localizedStatus",
      re: /\blocalizedStatus\s*\(\s*(['"`])([^'"`]+)\1\s*,\s*(['"`])((?:\\.|(?!\4)[^\\])*)\4/gs,
    },
  ];
  for (const { fn, re } of callPatterns) {
    let m;
    while ((m = re.exec(stripped)) !== null) {
      const key = m[2];
      const fallback = m[4].replace(/\\n/g, " ");
      if (isEnglishFallback(fallback)) continue;
      findings.push({
        file: rel,
        line: lineNumberAt(raw, m.index),
        text: `${fn}(${key}) → ${normalizeHumanText(fallback).slice(0, 80)}`,
        category: "t_fallback_not_english",
        detail: `${fn}(key, fallback) fallback must be English source text`,
      });
    }
  }
  return findings;
}

function auditAllJsI18nFallbacks() {
  const findings = [];
  for (const abs of walkFiles(JS_DIR, ".js")) {
    const rel = relPath(abs);
    const raw = readFileSafe(abs);
    if (!raw) continue;
    findings.push(...auditNonEnglishTFallbacks(rel, raw));
  }
  return dedupeFindings(findings);
}

function fileAwaitsLanguageReady(raw) {
  return (
    /\bawait\s+appPageLanguageReady\b/.test(raw) ||
    /\bawait\s+publicPageLanguageReady\b/.test(raw) ||
    /\bawait\s+initAppPageI18n\s*\(/.test(raw)
  );
}

function fileHasLanguageListeners(raw) {
  return (
    /wireDynamicPageI18nRefresh\s*\(/.test(raw) ||
    /lhai:language-changed/.test(raw) ||
    /lhai:i18n-runtime-resolved/.test(raw) ||
    /applyLanguageChangeToPage\s*\(/.test(raw)
  );
}

function fileLoadsI18nDomains(raw) {
  return (
    /initPageI18nAndApplyDom\s*\(/.test(raw) ||
    /initI18nDomains\s*\(/.test(raw) ||
    /registerI18nDomains\s*\(/.test(raw) ||
    /appPageLanguageReady/.test(raw) ||
    /publicPageLanguageReady/.test(raw) ||
    /initAppPageI18n\s*\(/.test(raw)
  );
}

function auditLanguageReady(pageMeta, pageJsRels) {
  const findings = [];
  for (const jsRel of pageJsRels) {
    const raw = readFileSafe(path.join(FRONTEND_ROOT, jsRel));
    if (!raw) continue;
    if (fileAwaitsLanguageReady(raw)) continue;
    if (pageMeta.hasShell) continue;

    if (pageMeta.isPublic) {
      findings.push({
        file: jsRel,
        line: 1,
        text: path.basename(jsRel),
        category: "missing_public_page_language_ready",
        detail: "public page JS does not await publicPageLanguageReady",
      });
    } else if (pageMeta.isApp) {
      findings.push({
        file: jsRel,
        line: 1,
        text: path.basename(jsRel),
        category: "missing_app_page_language_ready",
        detail: "app page JS does not await appPageLanguageReady (app-header alone is a race)",
      });
    }
  }
  return findings;
}

function auditApplyWithoutDomains(jsRels, pageMeta) {
  if (pageMeta.isApp || pageMeta.isPublic || pageMeta.hasShell) return [];
  const findings = [];
  for (const jsRel of jsRels) {
    if (isAllowlisted(jsRel)) continue;
    const raw = readFileSafe(path.join(FRONTEND_ROOT, jsRel));
    if (!raw || !/applyI18nToDom\s*\(/.test(raw)) continue;
    if (fileLoadsI18nDomains(raw)) continue;
    const line = lineNumberAt(raw, raw.search(/applyI18nToDom\s*\(/));
    findings.push({
      file: jsRel,
      line,
      text: "applyI18nToDom",
      category: "apply_i18n_without_domain_load",
      detail: "applyI18nToDom without initPageI18nAndApplyDom / domain registration in same file",
    });
  }
  return findings;
}

const SURVEY_LOCALE_PATTERNS = [
  { re: /resolveQuoteUiLang\s*\(/, label: "resolveQuoteUiLang (survey preferred_language)" },
  { re: /resolveInvoiceUiLang\s*\(/, label: "resolveInvoiceUiLang (survey preferred_language)" },
  { re: /getQuoteLocaleBundle\s*\(/, label: "getQuoteLocaleBundle local bundle" },
  { re: /getInvoiceLocaleBundle\s*\(/, label: "getInvoiceLocaleBundle local bundle" },
  { re: /common\.preferred_language/, label: "survey common_info.preferred_language for UI locale" },
  { re: /common_info\.preferred_language/, label: "survey common_info.preferred_language for UI locale" },
];

function auditSurveyPreferredLocale(jsRels, pageBase) {
  if (/^survey-/i.test(pageBase)) return [];
  const findings = [];
  for (const jsRel of jsRels) {
    const raw = readFileSafe(path.join(FRONTEND_ROOT, jsRel));
    if (!raw) continue;
    for (const { re, label } of SURVEY_LOCALE_PATTERNS) {
      if (!re.test(raw)) continue;
      const idx = raw.search(re);
      findings.push({
        file: jsRel,
        line: lineNumberAt(raw, idx),
        text: label,
        category: "survey_preferred_language_locale",
        detail: "UI should use getEffectiveLanguage(), not survey intake preferred_language",
      });
    }
  }
  return findings;
}

function auditDynamicRenderWithoutRefresh(jsRels) {
  const findings = [];
  for (const jsRel of jsRels) {
    if (isAllowlisted(jsRel)) continue;
    const raw = readFileSafe(path.join(FRONTEND_ROOT, jsRel));
    if (!raw) continue;
    const usesT = /\bt\s*\(/.test(raw);
    const mutatesDom =
      /\.innerHTML\s*=/.test(raw) ||
      /\.textContent\s*=/.test(raw) ||
      /insertAdjacentHTML\s*\(/.test(raw) ||
      /render[A-Z]\w*\s*\(/.test(raw);
    if (!usesT || !mutatesDom) continue;
    if (fileHasLanguageListeners(raw)) continue;
    findings.push({
      file: jsRel,
      line: 1,
      text: path.basename(jsRel),
      category: "dynamic_t_without_language_listener",
      detail: "uses t() + DOM render but no wireDynamicPageI18nRefresh / lhai:language-changed",
    });
  }
  return findings;
}

const API_RAW_FIELD_RE =
  /\b(?:message|msg|m|row|item|thread|quote|case|bid|offer|w|update|activity)\.(?:title|body|description|subtitle|name|preview|status_label)\b/g;
const DISPLAY_FIELD_OK_RE = /display_(?:title|body|description|subtitle|name|preview|status_label)/;

function auditApiWithoutDisplayFields(jsRels) {
  const findings = [];
  for (const jsRel of jsRels) {
    if (isAllowlisted(jsRel)) continue;
    if (/-logic\.js$|-display-logic\.js$/.test(jsRel)) continue;
    const raw = readFileSafe(path.join(FRONTEND_ROOT, jsRel));
    if (!raw) continue;
    const lines = raw.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (isDeveloperOnlyContext(line)) continue;
      if (/\/\/.*display_/.test(line)) continue;
      if (DISPLAY_FIELD_OK_RE.test(line) && line.includes("display_")) continue;
      API_RAW_FIELD_RE.lastIndex = 0;
      let m;
      while ((m = API_RAW_FIELD_RE.exec(line)) !== null) {
        const token = m[0];
        if (token.includes("display_")) continue;
        const window = line.slice(Math.max(0, m.index - 30), m.index + token.length + 30);
        if (/display_/.test(window)) continue;
        if (/\.get\(|formInput|schema|field|key:|mock|demo|TODO|eslint-disable/.test(line)) continue;
        findings.push({
          file: jsRel,
          line: i + 1,
          text: token,
          category: "api_raw_field_without_display",
          detail: "prefer display_* API fields for viewer locale",
        });
      }
    }
  }
  return dedupeFindings(findings);
}

const CATEGORY_WEIGHT = {
  missing_app_page_language_ready: "risky",
  missing_public_page_language_ready: "risky",
  survey_preferred_language_locale: "risky",
  apply_i18n_without_domain_load: "risky",
  dynamic_t_without_language_listener: "risky",
  api_raw_field_without_display: "partial",
  html_text_without_data_i18n: "partial",
  html_attr_without_i18n: "partial",
  js_korean_hardcoded: "partial",
  t_fallback_not_english: "risky",
  local_ko_bundle_temporary: "partial",
};

function statusFromFindings(findings) {
  let status = "ok";
  for (const f of findings) {
    const w = CATEGORY_WEIGHT[f.category] || "partial";
    if (w === "risky") return "risky";
    if (w === "partial") status = "partial";
  }
  return status;
}

function buildPageReports(registry) {
  /** @type {object[]} */
  const reports = [];

  for (const [pageBase, meta] of registry.entries()) {
    const htmlRaw = readFileSafe(meta.htmlAbs) || "";
    const scopedJs = meta.allJs.filter((j) => {
      const norm = j.replace(/\\/g, "/");
      return (
        norm.includes("/assets/js/pages/") ||
        norm.includes("/assets/js/components/") ||
        norm.includes("/assets/js/layouts/")
      );
    });

    const findings = [
      ...auditHtmlHardcoded(meta.htmlRel, htmlRaw),
      ...scopedJs.flatMap((j) => {
        const raw = readFileSafe(path.join(FRONTEND_ROOT, j));
        if (!raw) return [];
        return [
          ...auditJsFile(j, raw),
          ...auditNonEnglishTFallbacks(j, raw),
        ];
      }),
      ...auditLanguageReady(meta, meta.pageJs),
      ...auditApplyWithoutDomains(scopedJs, meta),
      ...auditSurveyPreferredLocale(scopedJs, pageBase),
      ...auditDynamicRenderWithoutRefresh(scopedJs),
      ...auditApiWithoutDisplayFields(scopedJs),
    ];

    const deduped = dedupeFindings(findings);
    const reasons = [...new Set(deduped.map((f) => f.detail || f.category))];
    const filesToFix = [...new Set(deduped.map((f) => f.file))].sort();
    const suggestedDomains = meta.declaredDomains.length
      ? meta.declaredDomains
      : suggestDomainsForPage(pageBase);

    reports.push({
      page: pageBase,
      status: statusFromFindings(deduped),
      reasons,
      filesToFix,
      suggestedDomains,
      findings: deduped,
      counts: {
        total: deduped.length,
        byCategory: deduped.reduce((acc, f) => {
          acc[f.category] = (acc[f.category] || 0) + 1;
          return acc;
        }, {}),
      },
    });
  }

  return reports.sort((a, b) => a.page.localeCompare(b.page));
}

function printPageReport(reports) {
  const risky = reports.filter((r) => r.status === "risky").length;
  const partial = reports.filter((r) => r.status === "partial").length;
  const ok = reports.filter((r) => r.status === "ok").length;

  console.log("=== Step 1 — Full-page i18n audit ===");
  console.log(`Pages: ${reports.length} | ok: ${ok} | partial: ${partial} | risky: ${risky}`);
  console.log(`Known locale fallback strings: ${knownLocaleStrings.size}`);
  console.log();
  console.log("Selected language = account preferred_language_code | dropdown | getEffectiveLanguage()");
  console.log("NOT survey_submission.common_info.preferred_language (except survey intake pages)");
  console.log();

  for (const report of reports) {
    if (report.status === "ok") continue;
    console.log(`--- ${report.page} [${report.status.toUpperCase()}] ---`);
    console.log(`  domains: ${report.suggestedDomains.join(", ")}`);
    if (report.reasons.length) {
      console.log("  reasons:");
      for (const r of report.reasons.slice(0, 8)) console.log(`    - ${r}`);
      if (report.reasons.length > 8) console.log(`    … +${report.reasons.length - 8} more`);
    }
    if (report.filesToFix.length) {
      console.log(`  files (${report.filesToFix.length}): ${report.filesToFix.slice(0, 6).join(", ")}${report.filesToFix.length > 6 ? " …" : ""}`);
    }
    const top = report.findings.slice(0, 5);
    for (const f of top) {
      console.log(`    ${f.file}:${f.line} [${f.category}] ${f.text.replace(/\s+/g, " ").slice(0, 70)}`);
    }
    if (report.findings.length > 5) console.log(`    … +${report.findings.length - 5} more findings`);
    console.log();
  }

  console.log("=== Summary by status ===");
  for (const status of ["risky", "partial", "ok"]) {
    const list = reports.filter((r) => r.status === status).map((r) => r.page);
    console.log(`${status}: ${list.length}`);
    if (status !== "ok" && list.length) console.log(`  ${list.join(", ")}`);
  }
}

function printSummary(reports) {
  const byCategory = {};
  for (const r of reports) {
    for (const [cat, n] of Object.entries(r.counts.byCategory)) {
      byCategory[cat] = (byCategory[cat] || 0) + n;
    }
  }
  console.log("=== i18n audit summary ===");
  console.log(`Pages: ${reports.length}`);
  console.log(`ok: ${reports.filter((r) => r.status === "ok").length}`);
  console.log(`partial: ${reports.filter((r) => r.status === "partial").length}`);
  console.log(`risky: ${reports.filter((r) => r.status === "risky").length}`);
  console.log();
  console.log("Findings by category:");
  for (const [cat, n] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n}\t${cat}`);
  }
}

function printFallbackViolations(findings) {
  console.log("=== Non-English i18n fallbacks (must be English source) ===");
  if (!findings.length) {
    console.log("ok: none");
    return;
  }
  for (const f of findings) {
    console.log(`${f.file}:${f.line} ${f.text}`);
  }
  console.log(`\nTotal: ${findings.length}`);
}

function main() {
  const args = new Set(process.argv.slice(2));
  const pageFilter = (() => {
    const idx = process.argv.indexOf("--page");
    return idx >= 0 ? process.argv[idx + 1] : null;
  })();

  const globalFallbackFindings = auditAllJsI18nFallbacks();
  const localKoBundleFindings = auditTemporaryLocalKoBundles();
  const migrationStatus = loadPageLocaleMigrationStatus();

  if (args.has("--local-ko-bundles")) {
    printLocalKoBundleAudit(localKoBundleFindings, migrationStatus);
    process.exit(0);
  }

  if (args.has("--fallbacks")) {
    printFallbackViolations(globalFallbackFindings);
    process.exit(globalFallbackFindings.length > 0 ? 1 : 0);
  }

  extractQuotedStringsFromLocaleFiles();
  const registry = buildPageRegistry();
  let reports = buildPageReports(registry);
  if (pageFilter) {
    reports = reports.filter((r) => r.page === pageFilter || r.page === `${pageFilter}.html`);
  }

  const riskyCount = reports.filter((r) => r.status === "risky").length;
  const issueCount = reports.reduce((n, r) => n + r.counts.total, 0);
  const fallbackCount = globalFallbackFindings.length;
  const localKoCount = localKoBundleFindings.length;

  if (args.has("--json")) {
    const payload = reports.map(({ findings, ...rest }) => ({
      ...rest,
      findings,
    }));
    process.stdout.write(
      `${JSON.stringify(
        { reports: payload, totalFindings: issueCount, tFallbackViolations: globalFallbackFindings },
        null,
        2
      )}\n`
    );
  } else if (args.has("--summary")) {
    printSummary(reports);
    if (fallbackCount) {
      console.log();
      printFallbackViolations(globalFallbackFindings);
    }
  } else {
    printPageReport(reports);
    if (fallbackCount) {
      console.log();
      printFallbackViolations(globalFallbackFindings);
    }
    if (localKoCount) {
      console.log();
      printLocalKoBundleAudit(localKoBundleFindings, migrationStatus);
    }
  }

  process.exit(riskyCount > 0 || issueCount > 0 || fallbackCount > 0 ? 1 : 0);
}

main();
