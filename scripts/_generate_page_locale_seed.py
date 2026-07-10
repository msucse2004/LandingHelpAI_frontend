#!/usr/bin/env python3
"""Generate page_locale_bundles_seed.py when Node.js is unavailable.

Prefer: node scripts/export-local-page-bundles-to-ui-seed.mjs
"""

from __future__ import annotations

import json
import re
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[1]
BACKEND = FRONTEND.parent / "LandingHelpAI_backend"
OUT_PY = BACKEND / "app" / "seeds" / "page_locale_bundles_seed.py"
OUT_STATUS = Path(__file__).resolve().parent / "page-locale-migration-status.json"

PAGE_SPECS = [
    ("quote-detail", "quote-detail.html", "src/assets/js/pages/quote-detail-locale.js", ["common", "nav", "quote"]),
    ("invoice-detail", "invoice-detail.html", "src/assets/js/pages/invoice-detail-locale.js", ["common", "nav", "invoice"]),
    ("schedule", "schedule.html", "src/assets/js/pages/schedule-page-locale.js", ["common", "nav", "schedule"]),
    ("documents", "documents.html", "src/assets/js/pages/documents-page-locale.js", ["common", "nav", "documents"]),
]

KOREAN_RE = re.compile(r"[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]")
KEY_RE = re.compile(r'"([a-z][a-z0-9_.]+)":\s*(?:"((?:\\.|[^"\\])*)"|(\{))', re.MULTILINE)


def py_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def extract_object_block(source: str, const_name: str) -> str:
    marker = f"const {const_name} = {{"
    start = source.find(marker)
    if start < 0:
        raise ValueError(f"missing {marker}")
    i = start + len(marker) - 1
    depth = 0
    while i < len(source):
        ch = source[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return source[start : i + 1]
        i += 1
    raise ValueError(f"unclosed {const_name} object")


def decode_js_string(raw: str) -> str:
    return (
        raw.replace("\\n", "\n")
        .replace("\\t", "\t")
        .replace('\\"', '"')
        .replace("\\'", "'")
        .replace("\\\\", "\\")
    )


def parse_js_string_object(block: str) -> dict[str, str]:
    out: dict[str, str] = {}
    i = 0
    while i < len(block):
        m = KEY_RE.search(block, i)
        if not m:
            break
        key = m.group(1)
        if m.group(3) == "{":
            i = m.end()
            continue
        raw = m.group(2) or ""
        out[key] = decode_js_string(raw)
        i = m.end()
    return out


def load_bundle(rel_path: str) -> tuple[dict[str, str], dict[str, str]]:
    source = (FRONTEND / rel_path).read_text(encoding="utf-8")
    en = parse_js_string_object(extract_object_block(source, "EN"))
    ko = parse_js_string_object(extract_object_block(source, "KO"))
    return en, ko


def collect_seed_keys() -> set[str]:
    keys: set[str] = set()
    seed_files = [
        BACKEND / "app/seeds/ui_strings_seed.py",
        BACKEND / "app/seeds/step6_en_fallbacks.py",
        BACKEND / "app/seeds/workflow_scene_strings_seed.py",
    ]
    dict_key_re = re.compile(r'"([a-z][a-z0-9_.]+)":')
    seed_key_re = re.compile(r'SeedStringKey\(\s*"[^"]+"\s*,\s*"([^"]+)"')
    for path in seed_files:
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        keys.update(dict_key_re.findall(text))
        keys.update(seed_key_re.findall(text))
    return keys


def is_english_source(text: str) -> bool:
    t = text.strip()
    if not t:
        return True
    if KOREAN_RE.search(t):
        return False
    return bool(re.search(r"[A-Za-z]", t))


def main() -> None:
    existing = collect_seed_keys()
    rows: list[tuple[str, str, str, str]] = []
    pages_meta: list[dict] = []

    for page_id, page_html, rel_path, domains in PAGE_SPECS:
        en, ko = load_bundle(rel_path)
        for key, en_val in sorted(en.items()):
            if key not in ko:
                raise ValueError(f"{page_id}: missing KO for {key}")
            if not is_english_source(en_val):
                raise ValueError(f"{page_id}: EN not English for {key}")
            if existing.__contains__(key):
                continue
            if any(r[0] == key for r in rows):
                continue
            rows.append((key, en_val, ko[key], page_id))

        keys = list(en.keys())
        exported_keys = {r[0] for r in rows}
        seeded = [k for k in keys if k in existing or k in exported_keys]
        has_ko = bool(re.search(r"\bconst\s+KO\s*=", (FRONTEND / rel_path).read_text(encoding="utf-8")))
        status = "pending"
        if len(seeded) == len(keys) and not has_ko:
            status = "ko_bundle_removed"
        elif len(seeded) == len(keys):
            status = "ready_to_drop_ko"
        elif seeded:
            status = "partial"

        pages_meta.append(
            {
                "id": page_id,
                "page": page_html,
                "localeFile": rel_path,
                "domains": domains,
                "totalKeys": len(keys),
                "seededKeys": len(seeded),
                "pendingSeedKeys": len(keys) - len(seeded),
                "exportedThisRun": len([k for k in keys if k not in existing]),
                "koLocalObjectPresent": has_ko,
                "koLocalKeyCount": len(ko),
                "enEmergencyFallbackKept": True,
                "status": status,
            }
        )

    en_lines = [f'    "{py_escape(k)}": "{py_escape(en)}",' for k, en, _, _ in rows]
    ko_lines = [f'    "{py_escape(k)}": "{py_escape(ko)}",' for k, en, ko, _ in rows if ko != en]
    meta_lines = [
        f'    "{p["id"]}": {{"page": "{p["page"]}", "locale_file": "{p["localeFile"]}", "status": "{p["status"]}", "total_keys": {p["totalKeys"]}, "seeded_keys": {p["seededKeys"]}}},'
        for p in pages_meta
    ]

    py_source = (
        '"""Auto-generated page locale bundles for StringKey/StringTranslation seeding.\n\n'
        "Source: LandingHelpAI_frontend/scripts/export-local-page-bundles-to-ui-seed.mjs\n"
        "(or scripts/_generate_page_locale_seed.py when Node is unavailable)\n"
        '"""\n\n'
        "from __future__ import annotations\n\n"
        "PAGE_LOCALE_BUNDLE_META: dict[str, dict[str, object]] = {\n"
        + "\n".join(meta_lines)
        + "\n}\n\n"
        "PAGE_LOCALE_EN_FALLBACKS: dict[str, str] = {\n"
        + "\n".join(en_lines)
        + "\n}\n\n"
        "PAGE_LOCALE_KO_OVERRIDES: dict[str, str] = {\n"
        + "\n".join(ko_lines)
        + "\n}\n"
    )
    OUT_PY.write_text(py_source, encoding="utf-8")

    status_payload = {
        "generatedAt": __import__("datetime").datetime.now(__import__("datetime").UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "policy": {
            "tFallbackLanguage": "en",
            "koBelongsIn": "StringTranslation.ko only (not local KO bundle long-term)",
            "localKoBundle": "temporary until status is ready_to_drop_ko and runtime verified",
            "localEnBundle": "emergency fallback until StringKey catalog has full coverage",
        },
        "pages": pages_meta,
        "summary": {
            "pageCount": len(pages_meta),
            "readyToDropKo": sum(1 for p in pages_meta if p["status"] == "ready_to_drop_ko"),
            "partial": sum(1 for p in pages_meta if p["status"] == "partial"),
            "pending": sum(1 for p in pages_meta if p["status"] == "pending"),
            "totalExportRows": len(rows),
        },
    }
    OUT_STATUS.write_text(json.dumps(status_payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(rows)} keys to {OUT_PY}")


if __name__ == "__main__":
    main()
