"""Generate Step 6 EN fallbacks dict for ui_strings_seed integration."""
import re
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[1]
OUT = Path(__file__).resolve().parents[2] / "LandingHelpAI_backend" / "app" / "seeds" / "step6_en_fallbacks.py"

DASHBOARD_KO = {
    "dashboard.empty.recent_updates": "아직 새 업데이트가 없습니다.",
    "dashboard.empty.recent_messages": "새 메시지가 없습니다.",
    "dashboard.empty.documents": "문서가 없습니다.",
    "dashboard.empty.cases": "진행 중인 문의가 없습니다.",
    "dashboard.empty.quote_waiting_title": "아직 도착한 견적이 없습니다",
    "dashboard.empty.quote_waiting_text": "파트너가 제안을 제출하면 이곳에서 비교할 수 있습니다.",
    "dashboard.idle.hero.title": "지금은 진행 중인 서비스가 없습니다",
    "dashboard.idle.hero.cta_cases": "서비스 문의하기",
    "dashboard.hero.offers_arrived_title": "차량 견적이 도착하고 있어요",
    "dashboard.hero.waiting_offers_title": "견적을 기다리는 중입니다",
    "dashboard.hero.partner_selected_title": "파트너 선택이 완료되었습니다",
    "dashboard.hero.in_progress_title": "서비스가 진행 중입니다",
    "dashboard.cta.compare_quotes": "견적 비교하기",
    "dashboard.cta.view_quote_status": "견적 상태 보기",
    "dashboard.cta.open_messages": "메시지함 열기",
    "dashboard.badge.selected": "선택됨",
    "dashboard.card.status_title": "내 진행 상태",
    "dashboard.link.messages": "메시지함",
}


def extract_t(path: Path, prefixes):
    text = path.read_text(encoding="utf-8")
    pat = re.compile(
        r't\(\s*"((?:'
        + "|".join(re.escape(p) for p in prefixes)
        + r')[a-z0-9_.]+)"\s*,\s*"((?:[^"\\]|\\.)*)"'
    )
    out = {}
    for m in pat.finditer(text):
        out[m.group(1)] = m.group(2).replace("\\n", "\n")
    for m in re.finditer(r'localizedStatus\(\s*"([^"]+)"\s*,\s*"((?:[^"\\]|\\.)*)"', text):
        out[m.group(1)] = m.group(2)
    return out

keys = {}
keys.update(extract_t(FRONTEND / "src/assets/js/pages/dashboard-logic.js", ("dashboard.",)))
keys.update(extract_t(FRONTEND / "src/assets/js/pages/dashboard.js", ("dashboard.",)))
keys.update(extract_t(FRONTEND / "src/assets/js/pages/messages.js", ("messages.", "common.messages.")))
keys.update(
    extract_t(
        FRONTEND / "src/assets/js/pages/signup.js",
        ("auth.signup.role_label.",),
    )
)
keys["common.service_flow.category_selected_count_dynamic"] = "{count} selected"

lines = [
    '"""Step 6 JS dynamic UI — English fallbacks extracted from frontend t() calls."""',
    "",
    "STEP6_EN_FALLBACKS: dict[str, str] = {",
]
for k in sorted(keys):
    en = keys[k].replace("\\", "\\\\").replace('"', '\\"')
    lines.append(f'    "{k}": "{en}",')
lines.append("}")
lines.append("")
lines.append("STEP6_KO_OVERRIDES: dict[str, str] = {")
for k, ko in sorted(DASHBOARD_KO.items()):
    ko_esc = ko.replace("\\", "\\\\").replace('"', '\\"')
    lines.append(f'    "{k}": "{ko_esc}",')
lines.append("}")

OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"Wrote {len(keys)} EN fallbacks, {len(DASHBOARD_KO)} KO overrides")
