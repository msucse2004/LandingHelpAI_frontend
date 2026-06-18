import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
  return readFileSync(path.join(FRONTEND_ROOT, relPath), "utf8");
}

const PAGE_JS = read("src/assets/js/pages/admin-localization.js");
const PAGE_HTML = read("src/pages/admin-localization.html");

test("missing translations tab loads table only and does not auto-translate", () => {
  const activateBlock = PAGE_JS.match(/function activatePanel\(panelId\) \{[\s\S]*?\n\}/);
  assert.ok(activateBlock, "activatePanel should exist");
  const body = activateBlock[0];
  assert.match(body, /panelId === "panel-missing"/);
  assert.match(body, /void loadMissingTable\(\)/);
  assert.doesNotMatch(body, /autoTranslateMissing/);
});

test("missing refresh button loads table only and does not auto-translate", () => {
  assert.match(PAGE_JS, /missingRefreshBtn\?\.addEventListener\("click", \(\) => \{\s*void loadMissingTable\(\);\s*\}\)/);
  const refreshHandler = PAGE_JS.match(
    /missingRefreshBtn\?\.addEventListener\("click",[\s\S]*?\}\);/
  );
  assert.ok(refreshHandler);
  assert.doesNotMatch(refreshHandler[0], /autoTranslateMissing/);
});

test("auto translate button requires a single target language before running", () => {
  assert.match(
    PAGE_JS,
    /function onMissingAutoTranslateClick\(\) \{[\s\S]*?resolveAutoTranslateTargetLanguage\(\)[\s\S]*?if \(!target\.ok\) \{[\s\S]*?showAutoTranslateTargetLanguageError/
  );
  assert.match(
    PAGE_JS,
    /localization\.messages\.select_target_language_before_auto_translate/
  );
});

test("auto translate sends exactly one target language code", () => {
  assert.match(PAGE_JS, /const targetLanguageCodes = \[target\.language\]/);
  assert.match(
    PAGE_JS,
    /adminI18nStringsApi\.autoTranslateMissing\(\{[\s\S]*?targetLanguageCodes,/
  );
  assert.doesNotMatch(
    PAGE_JS.match(/async function runAutoTranslateMissingChained[\s\S]*?adminI18nStringsApi\.autoTranslateMissing/)?.[0] || "",
    /AUTO_TRANSLATE_TARGET_LANGUAGES/
  );
});

test("auto translate button disables while a run is active", () => {
  assert.match(
    PAGE_JS,
    /async function onMissingAutoTranslateClick\(\) \{[\s\S]*?setMissingAutoTranslateBtnDisabled\(true\)[\s\S]*?finally \{[\s\S]*?setMissingAutoTranslateBtnDisabled\(false\)/
  );
});

test("missing translations html wires refresh and auto translate controls separately", () => {
  assert.match(PAGE_HTML, /id="missingRefreshBtn"/);
  assert.match(PAGE_HTML, /id="missingAutoTranslateBtn"/);
  assert.match(PAGE_HTML, /id="missingFilterLanguage"/);
  assert.match(PAGE_HTML, /data-panel="panel-missing"/);
});

test("auto translate status messages use i18n keys", () => {
  assert.match(PAGE_JS, /localization\.messages\.auto_translate_started/);
  assert.match(PAGE_JS, /localization\.messages\.auto_translate_batch/);
  assert.match(PAGE_JS, /localization\.messages\.auto_translate_finished/);
  assert.match(PAGE_JS, /localization\.messages\.auto_translate_failed_summary/);
});

test("auto translate api errors do not surface raw stack traces to page alert", () => {
  const catchBlock = PAGE_JS.match(
    /catch \(err\) \{[\s\S]*?console\.error\("\[admin-localization\] auto-translate batch failed"[\s\S]*?setLocalizedPageAlert\([\s\S]*?auto_translate_failed/
  );
  assert.ok(catchBlock, "auto-translate catch should log to console and show localized alert");
  assert.doesNotMatch(catchBlock[0], /err\.stack/);
  assert.doesNotMatch(catchBlock[0], /setPageAlert\(message/);
});
