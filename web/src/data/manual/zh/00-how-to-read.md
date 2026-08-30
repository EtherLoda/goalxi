---
order: 0
slug: how-to-read
title: 如何阅读这本手册
status: full
lastUpdated: 2026-08-30
relatedChapters: []
relatedEntries: []
---

# 如何阅读这本手册

这本手册是 GoalXI 玩家的**完整参考文档**,覆盖游戏的所有主要系统。它跟 [智能助手 FAQ](../data/help/faq.zh.json) 是两套互补的内容:

- **本手册** —— 长文,按章节组织,适合**系统翻阅**和深度学习
- **智能助手 FAQ** —— 短问答,适合**快速问一个具体问题**(intent + answer + followUp)

两者通过每章的 `relatedEntries` 字段互相链接,翻手册时能跳到 FAQ,问问题时能跳回手册。

## 怎么读

**新玩家** —— 从头读前 5 章(1-5),理解游戏循环和球员/阵容/比赛基础。然后跳到感兴趣的章节。

**老玩家** —— 当 `相关章节:` 在某处提示,或翻 `index.json` 找特定主题。

**写新章节的人** —— 读下面的 frontmatter 规则 + conventions。

## Frontmatter 字段

每章 markdown 文件的开头都有 `---` 包裹的 YAML 块,告诉脚本/工具这篇文件的元信息:

| 字段 | 必填 | 说明 | 示例 |
|---|---|---|---|
| `order` | ✓ | 章节在手册里的顺序(数字) | `1` |
| `slug` | ✓ | 内部 ID(英文短横线),用于 cross-reference | `game-intro` |
| `title` | ✓ | 显示标题(按 locale 用中/英) | `游戏介绍` / `Game Introduction` |
| `status` | ✓ | 完整度状态 | `full` / `partial` / `stub` / `not-applicable` |
| `lastUpdated` | ✓ | 最后更新日期 | `2026-08-30` |
| `relatedChapters` | - | 跨章引用(章节 order 数组) | `[2, 3, 4, 5, 14, 17, 18]` |
| `relatedEntries` | - | 跨 FAQ 引用(FAQ entry id 数组) | `[pwi-vs-overall, ...]` |

**`status` 含义**:
- `full` —— 内容完整,可以直接发布
- `partial` —— 部分内容,后续会补
- `stub` —— 仅占位,实际内容待写
- `not-applicable` —— Hattrick 章节但 GoalXI 不做该功能(标注原因)

**`relatedChapters` / `relatedEntries`** 用于在文档之间互相跳转。**新章节必填这两个字段**,否则视为"孤岛"。

## 写作约定(锁住的)

这两条规则**跨整个手册执行**,任何新章节必须遵守,跟 `CLAUDE.md` 里"Player-facing help"两条规则一致:

### 1. 不透露引擎内部(`noInternalNumbers`)

不写:
- 位置权重数字(如 `pace: 16, dribbling: 12`)
- PWI 公式、GK save 公式、EXP 公式
- 升级成本曲线(sigmoid / linear 等)
- 伤病系数、specialty 倍率
- 引擎阈值常量(`PROMOTION_REVEAL_THRESHOLD` 等)

可以写:
- 玩家**玩几场就能观察**的游戏机制(经验倍率 5x,等级 1-20,战术 deadline 10 分钟)
- tier 标签(`L0 None` → `L20 Beyond Compare`)
- 相对定性比较("W 头牌是 pace + dribbling")

### 2. 对比/优先级条目必须覆盖全部 10/9 项技能(`noSilentOmission`)

涉及技能的对比或优先级条目(outfield 10 项 / GK 9 项)**全部覆盖**:
- 头牌技能(2-3 项)—— 明确说
- 重要技能 —— 明确说
- 次要技能 —— 明确说
- **几乎不影响技能** —— 也要说,标到"几乎不影响"档 + 1 句话原因

不能**隐式跳过**任何技能。玩家阅读时要知道"为什么 pace 对 W 重要,但 defending 对 W 几乎没用"。

## 文件结构

```
web/src/data/manual/
├── index.json              # 章节 + 附录 索引(双语)
├── zh/
│   ├── 00-how-to-read.md   # 本文件(zh 版)
│   ├── 01-game-intro.md    # 第 1 章
│   └── ...
└── en/
    ├── 00-how-to-read.md
    ├── 01-game-intro.md
    └── ...
```

- 章节文件:`{order:02d}-{slug}.md`(如 `01-game-intro.md`)
- 附录文件:`A{order}-{slug}.md`(如 `A1-weekly-cycle.md`)

## 加新章节的 checklist

1. 在 `web/src/data/manual/{zh,en}/` 下创建 `{NN}-{slug}.md`
2. 填写 frontmatter 7 字段(尤其是 `relatedChapters` / `relatedEntries`)
3. 写内容,遵守上面的两条约定
4. **zh + en 同步**(同结构,只翻译内容,不翻译 frontmatter 的 `slug` / `order` / `status` / `relatedChapters` / `relatedEntries` 这些结构字段)
5. 更新 `index.json`(加新章节条目)
6. 在 `CLAUDE.md` "Player-facing help"规则下,本手册默认继承 `noInternalNumbers` + `noSilentOmission` 两条

## 当前覆盖范围

完整内容见 `index.json` 文件。当前 26 章 + 2 附录的状态:

- ✓ **full**:第 1 章(其他章节陆续推)
- △ **partial**:暂未应用
- ☐ **stub**:第 2-26 章大部分(规划中,按章节逐个推)
- ✗ **not-applicable**:第 12/16/21/22/24/25 章(GoalXI 不做这些功能)

## 跟智能助手 FAQ 的关系

| 维度 | 手册(本文件) | FAQ |
|---|---|---|
| 形式 | 长文 markdown,按章节 | 短问答 JSON,按 intent |
| 用途 | 系统翻阅,深度学习 | 快速回答一个具体问题 |
| 入口 | `/manual/zh/01-game-intro.md` | 智能助手聊天框 |
| 风格 | 完整解释 + 例子 + 最佳实践 | 直接答案 + 跳转链接 |
| 引擎内部 | 不暴露 | 不暴露 |
| 跨链接 | `relatedEntries` 指向 FAQ | `followUp` 指向手册章节 |

**两者必须一致**:同一概念在手册和 FAQ 里描述必须相同。如果改了手册,对应的 FAQ 也要同步;反过来也一样。

## 维护流程

1. **改游戏代码** → 检查影响哪些章节 + 哪些 FAQ
2. **改手册** → 同步改 FAQ 的对应 entry,跑跨 locale 一致性检查
3. **改 FAQ** → 同步改手册的对应章节
4. **commit** 必须在 `feat/game-manual` 或 `feat/help-kb-player` 分支上,**不要直接在 main 上散 commit**
5. **跨语言镜像**:每次章节变更都要同时改 zh + en,不能只改一边

## 疑问

如果你在写章节时遇到边界情况(比如某章是 Hattrick 有但 GoalXI 部分有,某章是 GoalXI 特有 Hattrick 没有),看 `index.json` 里那章的 `status` 字段 + `notApplicableReason`(如果填了),或者直接看 `CLAUDE.md` 的"Player-facing help"规则。

---

**接下来**:[第 1 章:游戏介绍](01-game-intro.md) — GoalXI 是什么 + 怎么玩 + 怎么赢
