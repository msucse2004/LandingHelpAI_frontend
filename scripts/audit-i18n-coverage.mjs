#!/usr/bin/env node
/**
 * Step 7 — i18n coverage audit for Landing Help AI frontend.
 *
 * Scans HTML pages and JS for hardcoded user-visible strings not wired to i18n.
 * Heuristic tool: expect false positives/negatives; tune allowlists as needed.
 *
 * Usage:
 *   node scripts/audit-i18n-coverage.mjs
 *   node scripts/audit-i18n-coverage.mjs --summary
 *   node scripts/audit-i18n-coverage.mjs --json
 *
 * npm (when package.json exists):
 *   "i18n:audit": "node scripts/audit-i18n-coverage.mjs"
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(__dirname, "..");
const PAGES_DIR = path.join(FRONTEND_ROOT, "src", "pages");
const JS_DIR = path.join(FRONTEND_ROOT, "src", "assets", "js");

const VISIBLE_TEXT_MIN = 2;
const KOREAN_RE = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/;

const ALLOWLIST_BASENAMES = new Set([
  "app-shell-locale.js",
  "auth-public-locale.js",
  "localization-locale.js",
  "quote-detail-locale.js",
  "invoice-detail-locale.js",
  "documents-page-locale.js",
  "i18n-client.js",
  "i18n-dom.js",
  "i18n-dynamic.js",
  "public-page-i18n-config.js",
  "app-page-i18n-boot.js",
  "public-page-language-boot.js",
  "preferred-language.js",
  "config.js",
  "step6_en_fallbacks.py",
]);

/** Files whose basename ends with -locale.js or contains locale dictionaries. */
function isLocaleDictionaryFile(relPath) {
  const base = path.basename(relPath);
  if (ALLOWLIST_BASENAMES.has(base)) return true;
  if (/-locale\.js$/i.test(base)) return true;
  if (base.includes("locale") && /LOCALE|_loc_row|fallback/i.test(readFileSafe(path.join(FRONTEND_ROOT, relPath)) || "")) {
    return true;
  }
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

const SKIP_HTML_TAGS = new Set([
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
  "option", // geographic / enum option values often stay raw
]);

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

function isKnownLocaleString(text) {
  const t = normalizeHumanText(text);
  if (!t) return false;
  if (knownLocaleStrings.has(t)) return true;
  // partial match for long strings embedded in templates
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
  if (/^[A-Z][A-Z0-9_]{2,}$/.test(t)) return true; // ENUM_LIKE
  if (/^[a-z0-9_.-]+\.(html|js|css|json|png|jpg|svg)$/i.test(t)) return true;
  if (/^v?\d+\.\d+/.test(t)) return true;
  return false;
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

/** Strip // and block comments for JS scanning (string-aware, approximate). */
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

/**
 * @param {string} rel
 * @param {string} raw
 * @returns {{ file: string, line: number, text: string, reason: string }[]}
 */
function auditHtmlFile(rel, raw) {
  if (isAllowlisted(rel)) return [];
  const findings = [];
  const lines = raw.split(/\r?\n/);

  // Attribute checks on opening tags (may span lines; line-level is enough for audit)
  const attrChecks = [
    ["placeholder", "data-i18n-placeholder", "placeholder attribute without data-i18n-placeholder"],
    ["title", "data-i18n-title", "title attribute without data-i18n-title"],
    ["aria-label", "data-i18n-aria-label", "aria-label attribute without data-i18n-aria-label"],
  ];

  for (let li = 0; li < lines.length; li += 1) {
    const line = lines[li];
    const lineNo = li + 1;
    if (isDeveloperOnlyContext(line)) continue;

    for (const [attr, i18nAttr, reason] of attrChecks) {
      const attrRe = new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)')`, "gi");
      let m;
      while ((m = attrRe.exec(line)) !== null) {
        const val = m[2] ?? m[3] ?? "";
        if (!isHumanText(val)) continue;
        const tagSlice = line.slice(0, m.index);
        if (tagSlice.includes(i18nAttr)) continue;
        if (line.includes(i18nAttr)) continue;
        if (isKnownLocaleString(val)) continue;
        findings.push({ file: rel, line: lineNo, text: val.slice(0, 120), reason });
      }
    }

    // Visible text between tags on a single line: >text<
    const textRe = />([^<]+)</g;
    let tm;
    while ((tm = textRe.exec(line)) !== null) {
      const text = normalizeHumanText(tm[1]);
      if (!isHumanText(text)) continue;
      if (/^[\u25CB\u25CF●○]$/.test(text)) continue;
      if (/<option\b/i.test(line)) continue;
      if (line.includes("data-i18n") && line.includes(text.slice(0, Math.min(20, text.length)))) continue;
      if (isKnownLocaleString(text)) continue;
      // skip if parent context on same line has data-i18n-default (paired binding)
      if (/data-i18n(?:-default)?=/.test(line)) continue;
      findings.push({
        file: rel,
        line: lineNo,
        text: text.slice(0, 120),
        reason: "HTML text node without data-i18n",
      });
    }

    // Korean anywhere on line (not in script src, URLs)
    if (KOREAN_RE.test(line)) {
      if (/src\s*=|href\s*=\s*["']https?:/i.test(line)) continue;
      if (line.includes("data-i18n")) continue;
      const koMatches = line.match(/["']([^"']*[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF][^"']*)["']/g);
      if (koMatches) {
        for (const quoted of koMatches) {
          const inner = quoted.slice(1, -1);
          if (!KOREAN_RE.test(inner)) continue;
          if (isKnownLocaleString(inner)) continue;
          if (isApiOrTechnicalString(inner)) continue;
          findings.push({
            file: rel,
            line: lineNo,
            text: inner.slice(0, 120),
            reason: "Korean string not in known locale fallback files",
          });
        }
      } else {
        const stripped = line.replace(/<[^>]+>/g, " ").trim();
        if (KOREAN_RE.test(stripped) && isHumanText(stripped) && !isKnownLocaleString(stripped)) {
          findings.push({
            file: rel,
            line: lineNo,
            text: stripped.slice(0, 120),
            reason: "Korean visible text not in known locale fallback files",
          });
        }
      }
    }
  }

  return dedupeFindings(findings);
}

const JS_UI_PATTERNS = [
  { regex: /\.textContent\s*=\s*(['"`])([\s\S]*?)\1/g, reason: "textContent assignment without t()" },
  { regex: /\.innerHTML\s*=\s*(['"`])([\s\S]*?)\1/g, reason: "innerHTML assignment without t()" },
  { regex: /\.placeholder\s*=\s*(['"`])([\s\S]*?)\1/g, reason: "placeholder assignment without t()" },
  { regex: /setAttribute\(\s*['"]title['"]\s*,\s*(['"`])([\s\S]*?)\1/g, reason: "title setAttribute without t()" },
  {
    regex: /setAttribute\(\s*['"]aria-label['"]\s*,\s*(['"`])([\s\S]*?)\1/g,
    reason: "aria-label setAttribute without t()",
  },
  { regex: /\.title\s*=\s*(['"`])([\s\S]*?)\1/g, reason: "title property assignment without t()" },
  { regex: /\balert\(\s*(['"`])([\s\S]*?)\1/g, reason: "alert() without t()" },
  { regex: /showNonBlockingWarning\(\s*(['"`])([\s\S]*?)\1/g, reason: "showNonBlockingWarning() without t()" },
];

function usesI18nNear(raw, index) {
  const windowStart = Math.max(0, index - 120);
  const slice = raw.slice(windowStart, index + 40);
  return /\bt\s*\(|localizedStatus\s*\(|setLocalizedText\s*\(|localizedOption\s*\(/.test(slice);
}

/**
 * @param {string} rel
 * @param {string} raw
 * @returns {{ file: string, line: number, text: string, reason: string }[]}
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
      if (m[1] === "`" && val.includes("${")) {
        val = val.split("${")[0];
      }
      val = normalizeHumanText(val.replace(/\\n/g, " "));
      if (!isHumanText(val)) continue;
      if (usesI18nNear(stripped, m.index)) continue;
      if (isKnownLocaleString(val)) continue;
      if (isApiOrTechnicalString(val)) continue;
      // template/HTML fragments assigned to innerHTML
      if (reason.includes("innerHTML") && (val.startsWith("<") || val.includes("class="))) continue;
      findings.push({
        file: rel,
        line: lineNumberAt(raw, m.index),
        text: val.slice(0, 120),
        reason,
      });
    }
  }

  // Korean in string literals
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
      reason: "Korean string literal not in known locale fallback files",
    });
  }

  return dedupeFindings(findings);
}

function dedupeFindings(findings) {
  const seen = new Set();
  const out = [];
  for (const f of findings) {
    const key = `${f.file}:${f.line}:${f.reason}:${f.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

function collectFindings() {
  extractQuotedStringsFromLocaleFiles();

  /** @type {{ file: string, line: number, text: string, reason: string }[]} */
  const all = [];

  const htmlFiles = walkFiles(PAGES_DIR, ".html");
  for (const abs of htmlFiles) {
    const rel = relPath(abs);
    const raw = readFileSafe(abs);
    if (raw == null) continue;
    all.push(...auditHtmlFile(rel, raw));
  }

  const jsFiles = walkFiles(JS_DIR, ".js");
  for (const abs of jsFiles) {
    const rel = relPath(abs);
    const raw = readFileSafe(abs);
    if (raw == null) continue;
    all.push(...auditJsFile(rel, raw));
  }

  return all.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.line - b.line;
  });
}

function printSummary(findings) {
  const byFile = new Map();
  const byReason = new Map();
  for (const f of findings) {
    byFile.set(f.file, (byFile.get(f.file) || 0) + 1);
    byReason.set(f.reason, (byReason.get(f.reason) || 0) + 1);
  }
  console.log("=== i18n coverage audit summary ===");
  console.log(`Total findings: ${findings.length}`);
  console.log(`Files with issues: ${byFile.size}`);
  console.log(`Known locale strings loaded: ${knownLocaleStrings.size}`);
  console.log();
  console.log("By reason:");
  for (const [reason, count] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count}\t${reason}`);
  }
  console.log();
  console.log("Top files:");
  for (const [file, count] of [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${count}\t${file}`);
  }
}

function main() {
  const args = new Set(process.argv.slice(2));
  const findings = collectFindings();

  if (args.has("--json")) {
    process.stdout.write(`${JSON.stringify({ findings, total: findings.length }, null, 2)}\n`);
  } else if (args.has("--summary")) {
    printSummary(findings);
  } else {
    printSummary(findings);
    console.log();
    console.log("=== Findings (file:line) ===");
    for (const f of findings) {
      const preview = f.text.replace(/\s+/g, " ");
      console.log(`${f.file}:${f.line}\t[${f.reason}]\t"${preview}"`);
    }
  }

  process.exit(findings.length > 0 ? 1 : 0);
}

main();
