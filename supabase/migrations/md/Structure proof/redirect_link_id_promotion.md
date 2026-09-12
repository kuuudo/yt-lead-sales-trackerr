1. Shared Asset + 只有 1 個 Promotion → ✅ PASS

這是你最想確認的部分。

現在流程是：

Shared Asset
   ↓
resolvePromotionContextForAsset()
   ↓
找到 1 個 Promotion
   ↓
自動選擇這個 Promotion
   ↓
generateAssetRedirectLinks()
   ↓
promotionId = 該 Promotion ID
   ↓
createRedirectLink()
   ↓
redirect_links.promotion_id = NOT NULL

所以你剛才問的：

「如果這個 Asset 只有一個 Promotion，會不會自動把 promotion_id 放進 redirect_links？」

答案：會。

而且使用者不需要再手動選。

2. Shared Asset + 多個 Promotions → ✅ PASS

如果同一個 Asset 有：

Asset A
 ├── Promotion P1
 ├── Promotion P2
 └── Promotion P3

UI 會要求使用者選一個。

選擇之後：

chosenPromotionByAssetId
        ↓
assetsWithContext
        ↓
generateAssetRedirectLinks()
        ↓
promotionId = 選中的 Promotion

而且 Save button 在還沒選 Promotion 前會被 disabled。

所以：

多 Promotion 也 OK。

3. Shared Asset + 0 Promotion → 有 Gate，但有一個 race condition ⚠️

這就是 Claude 找到唯一真正的問題。

你的產品規則是：

Shared Asset 沒有 Promotion 是非法狀態。

目前 UI 確實有擋住它。

等 Promotion resolution 完成後：

options = []
        ↓
hasBlockingPromotionIssue = true
        ↓
Save disabled

所以正常情況：

Shared Asset + 0 Promotion → 不會產生 redirect。

但是有一個非常短的非同步時間差：

使用者選 Shared Asset
        ↓
開始 async resolvePromotionContextForAsset()
        ↓
此時 promotionContextByAssetId 還沒有這個 Asset
        ↓
hasBlockingPromotionIssue 看不到它
        ↓
如果使用者剛好立刻按 Save
        ↓
promotionContext = undefined
        ↓
promotionId = null

所以 Claude 的結論是：

正常完成 resolution 後：PASS。

resolution 尚未完成的 race window：有漏洞。

4. My Asset / Assigned Asset → ✅ PASS

這也符合我們的架構。

My / Assigned Asset 不需要 Promotion，因此：

My / Assigned Asset
       ↓
promotionContext = undefined
       ↓
promotion_id = NULL

這是故意的，不是 bug。

所以：

Own Asset       → promotion_id NULL ✅
Assigned Asset  → promotion_id NULL ✅
Shared Asset    → promotion_id 必須有值 ✅

這個 distinction 已經很漂亮了。


# Redirect Link → Promotion Identity (Phase 1 — Locked)

Status: **Confirmed architecture.** Reference only — no implementation here.

## 1. Redirect token identity
`redirect_links.token` has a UNIQUE database constraint.

```
token → exact redirect_links row
```

## 2. Promotion identity
`redirect_links.promotion_id` identifies the exact Promotion tied to that redirect link.

```
token → redirect_links → promotion_id → exact Promotion
```

## 3. Shared Asset rule
A Shared Asset MUST belong to a Promotion.

- Exactly 1 Promotion → auto-selected.
- Multiple Promotions → user selects one.
- The selected Promotion's ID is written to `redirect_links.promotion_id`.
- A Shared Asset with no Promotion is not a valid product state.

## 4. My / Assigned Asset rule
My Asset and Assigned Asset do not require a Promotion. Their redirect links may
legitimately have `promotion_id = NULL`.

## 5. Same Asset, multiple Promotions
The same Asset may belong to multiple Promotions. The Asset is never duplicated
to represent this — `promotion_id` on the redirect link carries the distinction.

```
Asset A
├── Promotion P1 → Redirect Token AAAA
└── Promotion P2 → Redirect Token BBBB
```

## 6. Race-condition protection
Promotion resolution is asynchronous. Save is disabled while
`resolvingPromotionContext === true`, preventing a Shared Asset from being
saved before its Promotion resolves.

## Architectural decision
**Asset duplication is NOT required for Promotion identity.** Promotion
identity is already represented by `redirect_links.promotion_id`.

## Future Relay dependency (reference only — not designed yet)
```
token → redirect_links → promotion_id
```
- `promotion_id` non-null → Relay can resolve the exact Promotion.
- `promotion_id` null → My/Assigned/owner-style flow (no Promotion).

Relay logic itself is out of scope — Phase 2.