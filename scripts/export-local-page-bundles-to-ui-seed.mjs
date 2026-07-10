#!/usr/bin/env node
/**
 * Step 6 — Export local KO/EN page locale bundles for StringKey/StringTranslation seeding.
 *
 * Reads quote, invoice, schedule, and documents page locale modules, validates EN/KO
 * separation, skips keys already present in backend seeds, and writes:
 *   - LandingHelpAI_backend/app/seeds/page_locale_bundles_seed.py
 *   - LandingHelpAI_frontend/scripts/page-locale-migration-status.json
 *
 * Usage:
 *   node scripts/export-local-page-bundles-to-ui-seed.mjs
 *   node scripts/export-local-page-bundles-to-ui-seed.mjs --dry-run
 *   node scripts/export-local-page-bundles-to-ui-seed.mjs --status
 *   node scripts/export-local-page-bundles-to-ui-seed.mjs --validate-only
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(__dirname, "..");
const BACKEND_ROOT = path.resolve(FRONTEND_ROOT, "..", "LandingHelpAI_backend");
const OUT_PY = path.join(BACKEND_ROOT, "app", "seeds", "page_locale_bundles_seed.py");
const OUT_STATUS = path.join(__dirname, "page-locale-migration-status.json");

const KOREAN_RE = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/;
const CJK_RE = /[\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/;
const LATIN_RE = /[A-Za-z]/;

/** @type {{ id: string, page: string, localeFile: string, importPath: string, getter: string, domains: string[] }[]} */
const PAGE_BUNDLES = [
  {
    id: "quote-detail",
    page: "quote-detail.html",
    localeFile: "src/assets/js/pages/quote-detail-locale.js",
    importPath: "../src/assets/js/pages/quote-detail-locale.js",
    getter: "getQuoteLocaleBundle",
    domains: ["common", "nav", "quote"],
  },
  {
    id: "invoice-detail",
    page: "invoice-detail.html",
    localeFile: "src/assets/js/pages/invoice-detail-locale.js",
    importPath: "../src/assets/js/pages/invoice-detail-locale.js",
    getter: "getInvoiceLocaleBundle",
    domains: ["common", "nav", "invoice"],
  },
  {
    id: "schedule",
    page: "schedule.html",
    localeFile: "src/assets/js/pages/schedule-page-locale.js",
    importPath: "../src/assets/js/pages/schedule-page-locale.js",
    getter: "getSchedulePageLocaleBundle",
    domains: ["common", "nav", "schedule"],
  },
  {
    id: "documents",
    page: "documents.html",
    localeFile: "src/assets/js/pages/documents-page-locale.js",
    importPath: "../src/assets/js/pages/documents-page-locale.js",
    getter: "getDocumentsPageLocaleBundle",
    domains: ["common", "nav", "documents"],
  },
];

function readFileSafe(absPath) {
  try {
    return fs.readFileSync(absPath, "utf8");
  } catch {
    return null;
  }
}

function pyEscape(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function isEnglishSource(text) {
  const t = String(text ?? "").trim();
  if (!t) return true;
  if (KOREAN_RE.test(t) || /[\u3040-\u30FF\u3400-\u9FFF]/.test(t)) return false;
  return LATIN_RE.test(t) || /^[\d\s.,:;+\-/%()'"{}\[\]→…]+$/.test(t);
}

function inferDomain(key) {
  return key.split(".", 1)[0] || "common";
}

function inferCategory(key) {
  const parts = key.split(".");
  if (parts.length < 2) return "ui";
  return parts[1];
}

function collectSeedKeysFromPythonSource(source) {
  /** @type {Set<string>} */
  const keys = new Set();
  if (!source) return keys;

  const seedKeyRe = /SeedStringKey\(\s*"[^"]+"\s*,\s*"([^"]+)"/g;
  let m;
  while ((m = seedKeyRe.exec(source)) !== null) {
    keys.add(m[1]);
  }

  const dictKeyRe = /"([a-z][a-z0-9_.]+)":/g;
  while ((m = dictKeyRe.exec(source)) !== null) {
    keys.add(m[1]);
  }

  return keys;
}

function loadExistingSeedKeys() {
  /** @type {Set<string>} */
  const keys = new Set();
  const seedFiles = [
    path.join(BACKEND_ROOT, "app", "seeds", "ui_strings_seed.py"),
    path.join(BACKEND_ROOT, "app", "seeds", "step6_en_fallbacks.py"),
    path.join(BACKEND_ROOT, "app", "seeds", "workflow_scene_strings_seed.py"),
  ];
  for (const abs of seedFiles) {
    for (const key of collectSeedKeysFromPythonSource(readFileSafe(abs))) {
      keys.add(key);
    }
  }
  return keys;
}

function localeFileHasKoObject(relPath) {
  const raw = readFileSafe(path.join(FRONTEND_ROOT, relPath));
  if (!raw) return false;
  return /\bconst\s+KO\s*=/.test(raw);
}

async function loadPageBundles() {
  /** @type {Map<string, { en: Record<string, string>, ko: Record<string, string> }>} */
  const bundles = new Map();
  for (const spec of PAGE_BUNDLES) {
    const mod = await import(pathToFileURL(path.join(__dirname, spec.importPath)).href);
    const getter = mod[spec.getter];
    if (typeof getter !== "function") {
      throw new Error(`${spec.localeFile}: missing export ${spec.getter}`);
    }
    const en = getter("en");
    const ko = getter("ko");
    bundles.set(spec.id, { en, ko });
  }
  return bundles;
}

function validateBundlePair(pageId, en, ko) {
  /** @type {{ key: string, issue: string }[]} */
  const issues = [];
  const allKeys = new Set([...Object.keys(en), ...Object.keys(ko)]);

  for (const key of [...allKeys].sort()) {
    const enVal = en[key];
    const koVal = ko[key];
    if (enVal == null) {
      issues.push({ key, issue: "missing EN entry in local bundle" });
      continue;
    }
    if (koVal == null) {
      issues.push({ key, issue: "missing KO entry in local bundle" });
      continue;
    }
    if (!isEnglishSource(enVal)) {
      issues.push({ key, issue: "EN value must be English source text (t() fallback rule)" });
    }
    if (KOREAN_RE.test(enVal)) {
      issues.push({ key, issue: "Korean must not appear in EN object" });
    }
    if (CJK_RE.test(koVal) && !KOREAN_RE.test(koVal) && !LATIN_RE.test(koVal)) {
      issues.push({ key, issue: "KO value looks like non-Korean CJK without Latin fallback" });
    }
  }

  if (issues.length) {
    const sample = issues
      .slice(0, 8)
      .map((i) => `  - ${i.key}: ${i.issue}`)
      .join("\n");
    throw new Error(`Validation failed for ${pageId}:\n${sample}${issues.length > 8 ? `\n  … +${issues.length - 8} more` : ""}`);
  }
}

function buildExportRows(bundles, existingKeys) {
  /** @type {{ key: string, en: string, ko: string, domain: string, category: string, pageId: string }[]} */
  const rows = [];
  /** @type {Map<string, string>} */
  const skippedExisting = new Map();
  /** @type {Map<string, string>} */
  const skippedConflicts = new Map();

  for (const [pageId, { en, ko }] of bundles.entries()) {
    for (const key of Object.keys(en).sort()) {
      const enVal = en[key];
      const koVal = ko[key] ?? enVal;
      if (existingKeys.has(key)) {
        skippedExisting.set(key, pageId);
        continue;
      }
      if (rows.some((r) => r.key === key)) {
        skippedConflicts.set(key, pageId);
        continue;
      }
      rows.push({
        key,
        en: enVal,
        ko: koVal,
        domain: inferDomain(key),
        category: inferCategory(key),
        pageId,
      });
    }
  }

  return { rows, skippedExisting, skippedConflicts };
}

function buildMigrationStatus(bundles, existingKeys, exportRows) {
  const exportedKeySet = new Set(exportRows.map((r) => r.key));
  /** @type {object[]} */
  const pages = [];

  for (const spec of PAGE_BUNDLES) {
    const { en, ko } = bundles.get(spec.id);
    const keys = Object.keys(en);
    const seededInCatalog = keys.filter((k) => existingKeys.has(k) || exportedKeySet.has(k));
    const pendingSeed = keys.filter((k) => !existingKeys.has(k));
    const exportedNow = keys.filter((k) => exportedKeySet.has(k));
    const koLocalKeys = Object.keys(ko).length;
    const hasKoObject = localeFileHasKoObject(spec.localeFile);

    let status = "pending";
    if (seededInCatalog.length === keys.length && !hasKoObject) {
      status = "ko_bundle_removed";
    } else if (seededInCatalog.length === keys.length) {
      status = "ready_to_drop_ko";
    } else if (seededInCatalog.length > 0) {
      status = "partial";
    }

    pages.push({
      id: spec.id,
      page: spec.page,
      localeFile: spec.localeFile,
      domains: spec.domains,
      totalKeys: keys.length,
      seededKeys: seededInCatalog.length,
      pendingSeedKeys: pendingSeed.length,
      exportedThisRun: exportedNow.length,
      koLocalObjectPresent: hasKoObject,
      koLocalKeyCount: koLocalKeys,
      enEmergencyFallbackKept: true,
      status,
      nextSteps:
        status === "ready_to_drop_ko"
          ? [
              "Verify runtime resolver returns all keys for ko via StringTranslation.",
              "Remove const KO from locale file; keep EN + invoicePageEnglishFallback pattern.",
              "Re-run audit-i18n-coverage.mjs --local-ko-bundles.",
            ]
          : status === "partial"
            ? [
                "Run export script and apply page_locale_bundles_seed.py to ui_strings_seed.",
                "Seed DB and verify runtime i18n on page with language=ko.",
              ]
            : [
                "Export remaining keys with this script.",
                "Merge generated seed into backend and apply migrations.",
              ],
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    policy: {
      tFallbackLanguage: "en",
      koBelongsIn: "StringTranslation.ko only (not local KO bundle long-term)",
      localKoBundle: "temporary until status is ready_to_drop_ko and runtime verified",
      localEnBundle: "emergency fallback until StringKey catalog has full coverage",
    },
    pages,
    summary: {
      pageCount: pages.length,
      readyToDropKo: pages.filter((p) => p.status === "ready_to_drop_ko").length,
      partial: pages.filter((p) => p.status === "partial").length,
      pending: pages.filter((p) => p.status === "pending").length,
      totalExportRows: exportRows.length,
    },
  };
}

function renderPythonModule(rows, migrationStatus) {
  const enLines = rows.map((r) => `    "${pyEscape(r.key)}": "${pyEscape(r.en)}",`);
  const koLines = rows
    .filter((r) => r.ko !== r.en)
    .map((r) => `    "${pyEscape(r.key)}": "${pyEscape(r.ko)}",`);

  const metaLines = migrationStatus.pages.map(
    (p) =>
      `    "${p.id}": {"page": "${p.page}", "locale_file": "${p.localeFile}", "status": "${p.status}", "total_keys": ${p.totalKeys}, "seeded_keys": ${p.seededKeys}},`,
  );

  return `"""Auto-generated page locale bundles for StringKey/StringTranslation seeding.

Source: LandingHelpAI_frontend/scripts/export-local-page-bundles-to-ui-seed.mjs
Do not edit manually — re-run the export script after locale bundle changes.

Migration status (see also scripts/page-locale-migration-status.json):
${migrationStatus.pages.map((p) => `- ${p.id}: ${p.status} (${p.seededKeys}/${p.totalKeys} seeded)`).join("\n")}
"""

from __future__ import annotations

# Per-page migration tracking (informational).
PAGE_LOCALE_BUNDLE_META: dict[str, dict[str, object]] = {
${metaLines.join("\n")}
}

# English source strings — canonical seed \`en\` column and frontend t(key, fallback).
PAGE_LOCALE_EN_FALLBACKS: dict[str, str] = {
${enLines.join("\n")}
}

# Korean translations — seed \`ko\` column only (not frontend local KO bundle long-term).
PAGE_LOCALE_KO_OVERRIDES: dict[str, str] = {
${koLines.join("\n")}
}
`;
}

function printStatus(migrationStatus) {
  console.log("=== Page locale → StringKey migration status ===");
  console.log(`Generated: ${migrationStatus.generatedAt}`);
  console.log();
  for (const p of migrationStatus.pages) {
    console.log(`${p.id} [${p.status}]`);
    console.log(`  page: ${p.page}`);
    console.log(`  locale: ${p.localeFile}`);
    console.log(`  keys: ${p.totalKeys} total | ${p.seededKeys} in seed | ${p.pendingSeedKeys} pending export`);
    console.log(`  KO local object: ${p.koLocalObjectPresent ? "yes (temporary)" : "no"}`);
    console.log(`  EN emergency fallback: ${p.enEmergencyFallbackKept ? "kept" : "n/a"}`);
    if (p.nextSteps?.length) {
      console.log("  next:");
      for (const step of p.nextSteps) console.log(`    - ${step}`);
    }
    console.log();
  }
  console.log("Summary:", migrationStatus.summary);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const validateOnly = args.has("--validate-only");
  const statusOnly = args.has("--status");

  const bundles = await loadPageBundles();
  for (const [pageId, { en, ko }] of bundles.entries()) {
    validateBundlePair(pageId, en, ko);
  }

  const existingKeys = loadExistingSeedKeys();
  const { rows, skippedExisting, skippedConflicts } = buildExportRows(bundles, existingKeys);
  const migrationStatus = buildMigrationStatus(bundles, existingKeys, rows);

  if (skippedConflicts.size) {
    console.warn(
      `Warning: ${skippedConflicts.size} duplicate keys across page bundles (first page wins): ${[...skippedConflicts.keys()].slice(0, 5).join(", ")}${skippedConflicts.size > 5 ? " …" : ""}`,
    );
  }

  if (statusOnly) {
    printStatus(migrationStatus);
    process.exit(0);
  }

  console.log(`Validated ${PAGE_BUNDLES.length} page bundles.`);
  console.log(`Existing seed keys loaded: ${existingKeys.size}`);
  console.log(`New keys to export: ${rows.length}`);
  console.log(`Skipped (already seeded): ${skippedExisting.size}`);

  if (validateOnly) {
    printStatus(migrationStatus);
    process.exit(0);
  }

  const pySource = renderPythonModule(rows, migrationStatus);

  if (!dryRun) {
    fs.writeFileSync(OUT_PY, pySource, "utf8");
    fs.writeFileSync(OUT_STATUS, `${JSON.stringify(migrationStatus, null, 2)}\n`, "utf8");
    console.log(`Wrote ${OUT_PY}`);
    console.log(`Wrote ${OUT_STATUS}`);
  } else {
    console.log(`[dry-run] Would write ${rows.length} keys to ${OUT_PY}`);
  }

  printStatus(migrationStatus);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
