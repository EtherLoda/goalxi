"""
Migrate `club.settingsPage` / `club.settings` / `club.training` / `club.bench`
/ `club.audit` (and the dead `club.nav`) out of the `club` block and into a
new top-level `settings` block with the namespace shape that the new
`/settings/{team,user,site}` pages and components expect.

Run from repo root:  python scripts/migrate-settings-i18n.py
"""

import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
TARGETS = [REPO / "web" / "messages" / "en.json",
           REPO / "web" / "messages" / "zh.json"]

# Key paths to move from `club` to `settings.team.*`.
MOVED_KEYS = ["settingsPage", "settings", "training", "bench", "audit"]
DEAD_KEYS = ["nav"]  # not referenced by any code; safe to drop.

# New keys added to support the new settings shell, sidebar nav, and the
# two stub pages. Locale pair (en, zh).
NEW_KEYS = {
    "en": {
        "nav": {
            "label": "Settings sections",
            "team": "Team",
            "user": "User",
            "site": "Site",
        },
        "team": {
            "fields": {
                "jerseyColors": "Jersey Colors",
                "jerseyColorPrimary": "Primary",
                "jerseyColorSecondary": "Secondary",
                "jerseyColorTertiary": "Tertiary",
                "jerseyPreview": "Preview",
            },
        },
        "user": {
            "page": {
                "eyebrow": "User",
                "title": "User Settings",
                "subtitle": "Manage your profile, avatar, and password.",
                "comingSoon": "Profile editing and password change will land in the next release.",
            },
        },
        "site": {
            "page": {
                "eyebrow": "Site",
                "title": "Site Settings",
                "subtitle": "Language and timezone preferences for this app.",
                "comingSoon": "Language and timezone controls will land in the next release.",
            },
        },
    },
    "zh": {
        "nav": {
            "label": "设置分区",
            "team": "球队",
            "user": "用户",
            "site": "站点",
        },
        "team": {
            "fields": {
                "jerseyColors": "球衣配色",
                "jerseyColorPrimary": "主色",
                "jerseyColorSecondary": "客色",
                "jerseyColorTertiary": "第三色",
                "jerseyPreview": "预览",
            },
        },
        "user": {
            "page": {
                "eyebrow": "用户",
                "title": "用户设置",
                "subtitle": "管理个人资料、头像和密码。",
                "comingSoon": "个人资料编辑和修改密码将在下一版本上线。",
            },
        },
        "site": {
            "page": {
                "eyebrow": "站点",
                "title": "站点设置",
                "subtitle": "本应用的语言和时区偏好。",
                "comingSoon": "语言和时区控件将在下一版本上线。",
            },
        },
    },
}


def deep_merge(dst, src):
    """Merge src into dst in-place. Lists are replaced; dicts recurse."""
    for k, v in src.items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            deep_merge(dst[k], v)
        else:
            dst[k] = v


def migrate(path: Path) -> None:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    locale = "zh" if path.name.startswith("zh") else "en"
    club = data.get("club", {})

    # Pull out the moved keys and drop the dead ones.
    moved = {}
    for key in MOVED_KEYS:
        if key in club:
            moved[key] = club.pop(key)
    for key in DEAD_KEYS:
        club.pop(key, None)

    # Compose the new `settings` block from the moved keys + new keys.
    # Renames:
    #   settingsPage → team.page
    #   settings    → team.fields
    #   training    → team.training
    #   bench       → team.bench
    #   audit       → team.audit
    settings = {}
    if "settingsPage" in moved:
        settings.setdefault("team", {})["page"] = moved["settingsPage"]
    if "settings" in moved:
        team_fields = settings.setdefault("team", {}).setdefault("fields", {})
        team_fields.update(moved["settings"])
    for key in ("training", "bench", "audit"):
        if key in moved:
            settings.setdefault("team", {})[key] = moved[key]

    deep_merge(settings, NEW_KEYS[locale])

    data["settings"] = settings

    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"OK {path.name}: club={list(club.keys())} settings={list(settings.keys())}")


def main() -> None:
    for p in TARGETS:
        migrate(p)


if __name__ == "__main__":
    main()
