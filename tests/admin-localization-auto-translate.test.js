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

test("auto translate button runs chained locales when All is selected", () => {
  assert.match(
    PAGE_JS,
    /function resolveAutoTranslateTargetLanguages\(\) \{[\s\S]*?if \(!selected\) \{[\s\S]*?languages: \[\.\.\.AUTO_TRANSLATE_TARGET_LANGUAGES\]/
  );
  assert.match(
    PAGE_JS,
    /function onMissingAutoTranslateClick\(\) \{[\s\S]*?resolveAutoTranslateTargetLanguages\(\)[\s\S]*?if \(!targets\.ok\) \{[\s\S]*?showAutoTranslateTargetLanguageError/
  );
  assert.doesNotMatch(PAGE_JS, /select_target_language_before_auto_translate/);
});

test("auto translate sends one target language code per API batch", () => {
  assert.match(PAGE_JS, /const targetLanguageCodes = \[language\]/);
  assert.match(
    PAGE_JS,
    /adminI18nStringsApi\.autoTranslateMissing\(\{[\s\S]*?targetLanguageCodes,/
  );
  assert.match(
    PAGE_JS,
    /for \(let languageIndex = 0; languageIndex < languages\.length; languageIndex \+= 1\)/
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
  assert.match(PAGE_JS, /localization\.messages\.auto_translate_all_languages_started/);
  assert.match(PAGE_JS, /localization\.messages\.auto_translate_language_progress/);
  assert.match(PAGE_JS, /localization\.messages\.auto_translate_language_batch/);
  assert.match(PAGE_JS, /localization\.messages\.auto_translate_finished/);
  assert.match(PAGE_JS, /localization\.messages\.auto_translate_failed_summary/);
  assert.match(PAGE_JS, /localization\.messages\.auto_translate_save_failed_headline/);
  assert.match(PAGE_JS, /localization\.messages\.auto_translate_save_failed_item/);
});

test("auto translate surfaces database save failures distinctly", () => {
  assert.match(PAGE_JS, /function isSaveFailedRecord\(record\)/);
  assert.match(PAGE_JS, /failure_kind/);
  assert.match(PAGE_JS, /localization\.messages\.auto_translate_save_failed_headline/);
  assert.match(
    PAGE_JS,
    /showAutoTranslateResult\(\{[\s\S]*?totalSaveFailed/
  );
});

test("auto translate api errors do not surface raw stack traces to page alert", () => {
  const catchBlock = PAGE_JS.match(
    /catch \(err\) \{[\s\S]*?console\.error\("\[admin-localization\] auto-translate batch failed"[\s\S]*?setLocalizedPageAlert\([\s\S]*?auto_translate_failed/
  );
  assert.ok(catchBlock, "auto-translate catch should log to console and show localized alert");
  assert.doesNotMatch(catchBlock[0], /err\.stack/);
  assert.doesNotMatch(catchBlock[0], /setPageAlert\(message/);
});
