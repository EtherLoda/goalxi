"""
Drop the `settings.team.training` / `settings.team.bench` /
`settings.team.audit` sub-trees (their UI is gone in this
commit) and add the new `settings.team.lockedFields` keys the
read-only identity section needs.
"""

import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
TARGETS = [REPO / "web" / "messages" / "en.json",
           REPO / "web" / "messages" / "zh.json"]

DROPPED_SUBTREES = ("training", "bench", "audit")
DROPPED_SECTIONS = ("training", "bench", "audit")  # inside page.sections

NEW_KEYS = {
    "en": {
        "team": {
            "page": {
                # `training`, `bench`, `audit` removed from sections
                "sections": {"info": "Identity"},
            },
            "lockedFields": {
                "sectionLabel": "Set at registration",
                "hint": "Country, city, and founding year are set when you claim your team and cannot be changed afterwards.",
            },
        },
    },
    "zh": {
        "team": {
            "page": {
                "sections": {"info": "身份"},
            },
            "lockedFields": {
                "sectionLabel": "注册时设定",
                "hint": "国家、城市和成立年份在认领球队时设定,之后无法修改。",
            },
        },
    },
}


def deep_merge(dst, src):
    for k, v in src.items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            deep_merge(dst[k], v)
        else:
            dst[k] = v


def prune(d, names):
    for n in names:
        d.pop(n, None)


def migrate(path: Path) -> None:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    locale = "zh" if path.name.startswith("zh") else "en"

    team = data.setdefault("settings", {}).setdefault("team", {})
    # Drop the old sub-trees.
    prune(team, DROPPED_SUBTREES)
    # Drop the old `sections.{training,bench,audit}` keys but
    # keep the existing `info` translation.
    page = team.setdefault("page", {})
    if "sections" in page:
        prune(page["sections"], DROPPED_SECTIONS)
    # Merge in the new `lockedFields` sub-tree + the trimmed
    # `sections` shape.
    deep_merge(team, NEW_KEYS[locale]["team"])

    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(
        f"OK {path.name}: settings.team={list(team.keys())} "
        f"page.sections={list(page.get('sections', {}).keys())}"
    )


def main() -> None:
    for p in TARGETS:
        migrate(p)


if __name__ == "__main__":
    main()
