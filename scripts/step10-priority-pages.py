#!/usr/bin/env python3
"""Step 10: quick i18n wiring check for priority pages."""
from __future__ import annotations

import re
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[1]
PAGES = [
    "src/pages/login.html",
    "src/pages/signup.html",
    "src/pages/forgot-password.html",
    "src/pages/survey-start.html",
    "src/pages/dashboard.html",
    "src/pages/messages.html",
    "src/pages/invoice-detail.html",
    "src/pages/documents.html",
    "src/pages/admin-localization.html",
    "src/pages/partner-dashboard.html",
    "src/pages/partner-bid-request.html",
]
KO = re.compile(r"[\uAC00-\uD7AF]")


def strip_scripts_styles(html: str) -> str:
    html = re.sub(r"<script[\s\S]*?</script>", "", html, flags=re.I)
    return re.sub(r"<style[\s\S]*?</style>", "", html, flags=re.I)


def main() -> None:
    print("=== Step 10 priority page wiring ===")
    for rel in PAGES:
        p = FRONTEND / rel
        if not p.exists():
            print(f"{rel}: MISSING")
            continue
        raw = p.read_text(encoding="utf-8", errors="replace")
        body = strip_scripts_styles(raw)
        texts = [x.strip() for x in re.findall(r">([^<>{}\n]+)<", body) if len(x.strip()) >= 2]
        ko_text = [x for x in texts if KO.search(x)]
        ko_attrs = [
            m.group(1)
            for m in re.finditer(r'(?:placeholder|title|aria-label)="([^"]+)"', body)
            if KO.search(m.group(1))
        ]
        has_domains = "data-lhai-i18n-domains" in raw
        has_boot = any(
            s in raw
            for s in (
                "public-page-language-boot",
                "app-page-i18n-boot",
                "app-header.js",
            )
        )
        i18n_bindings = len(re.findall(r"data-i18n", raw))
        lang_attr = re.search(r'<html[^>]*\blang="([^"]+)"', raw)
        print(
            f"{rel}: lang={lang_attr.group(1) if lang_attr else '?'} "
            f"domains={has_domains} boot={has_boot} data-i18n~={i18n_bindings} "
            f"ko_text_nodes={len(ko_text)} ko_attrs={len(ko_attrs)}"
        )
        if ko_text[:2]:
            print(f"  ko_text_sample: {ko_text[:2]}")
        if ko_attrs[:2]:
            print(f"  ko_attr_sample: {ko_attrs[:2]}")


if __name__ == "__main__":
    main()
