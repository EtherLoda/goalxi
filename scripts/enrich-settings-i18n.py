"""
Add the i18n keys used by the User profile / Password change / Site
language / Site timezone pages and components added in commit 2.
Run from repo root:  python scripts/enrich-settings-i18n.py
"""

import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
TARGETS = [REPO / "web" / "messages" / "en.json",
           REPO / "web" / "messages" / "zh.json"]

NEW_KEYS = {
    "en": {
        "user": {
            "page": {
                "sections": {
                    "profile": "Profile",
                    "security": "Security",
                },
            },
            "profile": {
                "title": "Profile",
                "subtitle": "Your display name, avatar, and bio.",
                "nickname": "Nickname",
                "nicknameHint": "2-50 characters. Shown in the forum and match chatter.",
                "avatar": "Avatar URL",
                "avatarHint": "HTTPS only. Use a trusted CDN (e.g. cdn.goalxi.com).",
                "avatarInvalid": "Avatar URL must be a valid HTTPS link.",
                "bio": "Bio",
                "bioHint": "Up to {max} characters. ({current} used)",
                "bioTooLong": "Bio too long.",
                "saved": "Saved.",
                "saving": "Saving...",
                "save": "Save",
            },
            "security": {
                "title": "Security",
                "subtitle": "Change your password. Other devices will be signed out.",
                "changePassword": "Change password",
                "lastChanged": "Last changed: {date}",
                "lastChangedUnknown": "Last changed: unknown",
            },
            "passwordDialog": {
                "title": "Change password",
                "subtitle": "Enter your current password, then pick a new one (8+ characters).",
                "current": "Current password",
                "new": "New password",
                "confirm": "Confirm new password",
                "currentRequired": "Current password is required.",
                "tooShort": "New password must be at least 8 characters.",
                "mismatch": "Passwords do not match.",
                "wrongCurrent": "Current password is incorrect.",
                "submit": "Change password",
                "submitting": "Changing...",
                "cancel": "Cancel",
                "success": "Password changed. Other devices have been signed out.",
            },
        },
        "site": {
            "page": {
                "sections": {
                    "language": "Language",
                    "timezone": "Timezone",
                },
            },
            "language": {
                "title": "Language",
                "subtitle": "The translation used across the app.",
                "en": "English",
                "zh": "中文 (Chinese)",
                "saved": "Saved.",
                "saving": "Saving...",
                "switching": "Switching language...",
            },
            "timezone": {
                "title": "Timezone",
                "subtitle": "Times are shown in this zone. Server-side events still run in UTC.",
                "detect": "Detect from browser",
                "currentPreview": "Current time: {time}",
                "saved": "Saved.",
                "saving": "Saving...",
            },
        },
    },
    "zh": {
        "user": {
            "page": {
                "sections": {
                    "profile": "资料",
                    "security": "安全",
                },
            },
            "profile": {
                "title": "资料",
                "subtitle": "昵称、头像和个人简介。",
                "nickname": "昵称",
                "nicknameHint": "2-50 字符,显示在论坛和比赛中。",
                "avatar": "头像 URL",
                "avatarHint": "仅支持 HTTPS,推荐使用可信 CDN (如 cdn.goalxi.com)。",
                "avatarInvalid": "头像 URL 必须是有效的 HTTPS 链接。",
                "bio": "个人简介",
                "bioHint": "最多 {max} 字符(已用 {current})",
                "bioTooLong": "简介过长。",
                "saved": "已保存。",
                "saving": "保存中...",
                "save": "保存",
            },
            "security": {
                "title": "安全",
                "subtitle": "修改密码,其他设备会被强制登出。",
                "changePassword": "修改密码",
                "lastChanged": "上次修改:{date}",
                "lastChangedUnknown": "上次修改:未知",
            },
            "passwordDialog": {
                "title": "修改密码",
                "subtitle": "输入当前密码,然后选择新密码(至少 8 个字符)。",
                "current": "当前密码",
                "new": "新密码",
                "confirm": "确认新密码",
                "currentRequired": "请输入当前密码。",
                "tooShort": "新密码至少 8 个字符。",
                "mismatch": "两次输入的新密码不一致。",
                "wrongCurrent": "当前密码错误。",
                "submit": "修改密码",
                "submitting": "修改中...",
                "cancel": "取消",
                "success": "密码已修改,其他设备已登出。",
            },
        },
        "site": {
            "page": {
                "sections": {
                    "language": "语言",
                    "timezone": "时区",
                },
            },
            "language": {
                "title": "语言",
                "subtitle": "全站使用的翻译语言。",
                "en": "English",
                "zh": "中文",
                "saved": "已保存。",
                "saving": "保存中...",
                "switching": "切换语言中...",
            },
            "timezone": {
                "title": "时区",
                "subtitle": "时间按此时区显示。服务器端事件仍按 UTC 跑。",
                "detect": "从浏览器自动检测",
                "currentPreview": "当前时间:{time}",
                "saved": "已保存。",
                "saving": "保存中...",
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


def migrate(path: Path) -> None:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    locale = "zh" if path.name.startswith("zh") else "en"
    deep_merge(data.setdefault("settings", {}), NEW_KEYS[locale])
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"OK {path.name}: settings.user={list(data['settings']['user'].keys())} settings.site={list(data['settings']['site'].keys())}")


def main() -> None:
    for p in TARGETS:
        migrate(p)


if __name__ == "__main__":
    main()
