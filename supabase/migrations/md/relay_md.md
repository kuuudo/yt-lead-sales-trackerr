# VSTRK Continuation Relay — 架構規格(整理版)
> 2026-09-29：MISS 時優先用 `redirect_links.upstream_domain`（source campaign ROOT）做第一跳探測；Path A / Path B 僅為 fallback。Track.tsx 尚未改。

> 本文件取代先前所有零散討論紀錄。內容整理自你提供的稽核/實作對話紀錄,**我沒有拿到最終版程式碼本身**,所以第 6 節「檔案異動總覽」是根據你的敘述整理,不是我自己重新驗證過的結果——尤其 Track.tsx 的狀態,對話紀錄裡出現前後矛盾的說法(先說改了,後說跟原始上傳版本逐位元組相同),我在第 6 節用警示框標出來,實作前務必自己核對一次現在 repo 裡的實際狀態。

---

## 1. 觸發點與決策起點

路由:`/r/:relayToken`,`relayToken` 是 **branded domain 自己的 relay token**(不是 redirect link token)。

整條 Relay 只有一個真相來源:`resolveRedirectToken(target)`。它回傳完整的 `redirect_link` row,包含 `promotion_id`、`asset_id`、`organization_id`——系統從這裡才知道要走 Path A 還是 Path B。

---

## 2. Phase 1–3(兩條路徑共用,不受 Path A/B 調整影響)

| Phase | 做的事 | 失敗/例外處理 |
|---|---|---|
| **Phase 1 — 網域驗證** | 用 `(hostname, relayToken)` 查 `branded_tracking_domains`,確認「這個網域 + 這個 relay token」組合合法 | 對不到 → 直接報錯結束,不進入後續邏輯 |
| **Phase 2 — 解析目標** | 讀 querystring 的 `target`(格式 `[A-Za-z0-9_-]{2,32}`)與 `gi`(group index,代表「探測到第幾個候選人了」) | 沒有 `target` → 純診斷模式,不跳轉;格式不符 → 拒絕 |
| **Phase 3 — Cookie precheck(HIT/MISS)** | 讀 `vt_token`(最近一次 redirect token)+ `vt_jid`(journey id,須為合法 UUID)。若 `vt_token` 存在,丟進 `isContinuationPrecheckHit(vt_token, target)`:解析 `vt_token` 對應舊 link 的 `destination_url` 反推 `video_id`,跟 `target` 的 `video_id` 比對 | 相等 = **HIT**;不相等或任一邊解析失敗 = **MISS** |

**HIT** → 組乾淨目標網址,把 `vt_token`/`vt_jid` 帶上,`window.location.replace` 跳轉,結束。**這條路徑完全不管 `promotion_id`,HIT 就是 HIT,不分 Path A/B。**

**MISS** → 進入第 3 節的分岔。

---

const candidateIndex = isSafeGroupIndex(rawGi); // 0,1,2 或 null
const upstreamAlreadyTried = params.get('up') === '1';

// 0) upstream_domain FIRST（edge-local source campaign ROOT）
if (targetLink.upstream_domain && !upstreamAlreadyTried) {
  const cand = await resolveUpstreamRootCandidate(
    targetLink.organization_id,
    targetLink.upstream_domain
  );
  // 有 verified host 且 ≠ 目前 host → bounce ?target=&up=1
  // 無 host / 同 host / 失敗 → fall through
}

if (targetLink.promotion_id && targetLink.asset_id) {
  // Path A — Promotion-specific Relay（fallback）
  // up=1 且 gi 缺時從 index 0 開始；否則維持原 gi 推進
} else if (!targetLink.promotion_id && targetLink.organization_id) {
  // Path B — Fallback root-domain 探測（fallback，邏輯不變）
} else {
  // exhausted → clean target + vt_probe=exhausted
}
```

**⚠️ Path A / Path B 在「`gi` 不存在時怎麼辦」這件事上,行為不同(見第 5.4 節)**——這是本次調整刻意引入的差異,不是疏漏,務必在文件裡明確記下來避免日後被誤改成一致。

優先看 `upstream_domain`（有值且尚未 `up=1`）做第一跳；之後判斷準則仍只看 `promotion_id` 是否有值,不看 `asset_id` 反查任何東西——`asset_id` 反查 campaign 已確認不可靠(同一個 `asset_id` 理論上可能出現在不同 campaign 的 redirect_link 裡,雖然目前資料庫是乾淨的,但這是設計上刻意迴避的陷阱,不能因為現在資料乾淨就假設永遠乾淨)。

---
## 3.5 upstream_domain 第一跳（2026-09-29）

被點的 `redirect_links` 列若有：

```text
upstream_domain = SOURCE VIDEO 的 Campaign tracking ROOT
（例：go.kaksidigitals.com → kaksidigitals.com）
## 4. Path A — Promotion-specific Relay(鎖定,未變動)

```
redirect_link.promotion_id / asset_id
  → promotions.assignment_id
  → assignment_assets (assignment_id + asset_id)   [assignment 時的狀態]
  → promotion_assets  (promotion_id + asset_id)    [此 promotion 專屬的即時設定]
  → 有效 sponsor id = promotion_assets.selected_sponsor_domain_id
                       ?? assignment_assets.selected_sponsor_domain_id
  → 有效 marketer id = promotion_assets.selected_marketer_domain_id   （唯一來源）
  → branded_tracking_domains（by id,status='verified'）
  → { hostname, relay_token, root_domain }
  → 候選順序:sponsor → marketer → vstrk（固定,非 null 才列入,vstrk 恆存在）
```

**鎖定規則,不重複討論:**
- `root_domain` 只用於 cookie scope,不用於組 Relay URL
- Relay URL 一律是 `https://{hostname}/r/{relay_token}`
- allow/use flag 只控制「能不能建立新連結」,不能用來擋掉已存在 cookie 的探測
- VSTRK 是固定平台候選(`www.vstrk.com` / `platform`),不查 `branded_tracking_domains`

實作於 `relayCandidates.ts`:`resolvePromotionRelayCandidates(promotionId, assetId)`,不受本次 Path B 調整影響。

---

## 5. Path B — Fallback root-domain 探測(本次調整核心)

### 5.1 為什麼需要這條路徑

`promotion_id` 為 null 時,無法用 `promotion_assets`/`assignment_assets` 找候選域名。目的改成:「這個訪客的 VSTRK cookie,目前存在哪個 root domain 上?」——依序探測,找到就沿用該 root domain 繼續 Relay。

### 5.2 候選人來源(已修正的邏輯)

**修正前的認知落差**:候選人分組/去重機制(`cookieParent.ts` 的 `buildProbeCandidates`)本身沒有 bug——它早就會把同 root domain 的多個 subdomain 收斂成一個候選,上限 3 組,tie-break 規則是「優先 `is_default`,否則 hostname 字母序取第一個」。**真正的問題是候選人「來源集合」選錯了**:舊版直接抓「這個 org 底下所有 verified 的 `branded_tracking_domains`」,完全沒有先過濾 `campaigns` 是否合格。

**修正後的來源鏈:**

```
organization_id
  → campaigns
      排除 archived_at IS NOT NULL
      排除 is_system = true 的系統帳號 campaign（見 5.3）
      排除 root_domain IS NULL
  → distinct root_domain（去重排序後取前 3 個）
  → 對每個 root_domain 查 branded_tracking_domains(status='verified')
      → 依 is_default 優先、否則 hostname 字母序,選一筆代表
  → 最多 3 個候選:{ hostname, relay_token, root_domain }
```

### 5.3 ONLY PROMOTE ASSET 排除規則(已解答,取代先前「無法判斷」的稽核結論)

已確認:這是每個帳號建立時**自動產生的系統 campaign**,`campaigns.is_system = true`,`campaign_name = 'ONLY PROMOTE ASSET'`,範例:

```
id = c6f42f2a-900c-4ea6-95f3-d6cbb352d2f5
campaign_name = ONLY PROMOTE ASSET
is_system = true
organization_id = 72d434c2-6e78-4d33-8761-0aa6e67f7f6c
```

**建議過濾條件用 `is_system = true`,不要用 `campaign_name = 'ONLY PROMOTE ASSET'` 字串比對。** 原因:
- `campaign_name` 是使用者可見的顯示文字,理論上可被改名(即使目前 UI 沒開放改名,未來也可能開放),字串比對脆弱
- `is_system` 是明確的分類欄位,語意清楚、不受改名影響

**待你確認的一個前提**:目前每個帳號是否**只有這一種** `is_system = true` 的 campaign?如果未來系統可能新增其他種類的系統 campaign(例如別的用途),用 `is_system = true` 排除就會連那些也一併排除掉,屆時需要更精確的欄位(例如加一個 `system_campaign_type`)。目前先假設「`is_system = true` ⇔ ONLY PROMOTE ASSET」成立。

### 5.4 root_domain 去重與上限

去重鍵改用 `branded_tracking_domains.root_domain`(資料庫既有欄位),**不再用 `cookieParent.ts` 的 `getCookieParent()` 演算法猜 eTLD+1**——因為 `root_domain` 早就在寫入時由 `getCookieParent()` 算好存進資料庫了(`addBrandedDomain()` 的既有邏輯),沒有必要在讀取時重算一次。

上限維持 `MAX_PROBE_GROUPS = 3`,在拿到 distinct `root_domain` 陣列後立刻 `.slice(0, 3)`。`ContinuationRelay.tsx` 的 `isSafeGroupIndex` 本來就把 `gi` 卡在 0~2,兩邊上限天然對齊。

### 5.5 URL 建構與跳轉推進 —— Path A/B 的關鍵差異

**Path B 不重用 `relayCandidates.ts` 的 `buildRelayCandidateUrl`**,`probeState.ts` 自己定義了獨立、最小化的型別與函式:

```ts
// probeState.ts,自成一體,不 import relayCandidates.ts
interface FallbackRelayCandidate {
  hostname: string;
  relay_token: string;
  root_domain: string;
}

function buildFallbackCandidateUrl(
  candidate: FallbackRelayCandidate,
  targetToken: string,
  candidateIndex: number
): string { /* 組 https://{hostname}/r/{relay_token}?target=...&gi=... ,外觀等同 buildRelayCandidateUrl */ }
```

**`gi` 不存在時的行為,Path A 與 Path B 不同,是刻意設計:**

| | `gi` 不存在時 |
|---|---|
| **Path A** | 視為「還沒開始探測」,直接 fallback 到乾淨目標,不嘗試任何候選 |
| **Path B** | 視為「鏈的起點」,直接嘗試 index 0 |

這個差異的目的是讓 **Track.tsx 完全不用改**:它現有機制(非 platform host 先試 `/r/platform`,不帶 `gi`;platform host 直接 MISS 進 `ContinuationRelay`)原封不動就能自動觸發 Path B 的 fallback chain,不需要 Track.tsx 自己先算出第 0 個候選人是誰。

`org` 這個 query 參數已確認不需要傳遞——`organization_id` 每一跳都從 `target` 重新解析(`resolveRedirectToken(target).organization_id`),不靠 URL 帶。這也比較符合 `probeState.ts` 檔頭註解的安全模型:「Client never supplies the next hostname」。

---

## 6. 檔案異動總覽(依你敘述整理的**最終**狀態)

| 檔案 | 狀態 | 內容 |
|---|---|---|
| `probeState.ts` | **改了** | Path B：`resolveOrganizationFallbackCandidates()`；另新增 `resolveUpstreamRootCandidate()`、`buildUpstreamProbeUrl()`（upstream 第一跳） |(campaigns → root_domain → 候選)+ 自建的 `FallbackRelayCandidate` 型別與 `buildFallbackCandidateUrl()`,零依賴 `relayCandidates.ts`。`loadProbeCandidates`、`buildProbeUrl`、`cookieParent.ts` 全部保留未刪 |
| `ContinuationRelay.tsx` | **改了** | MISS：先 `upstream_domain`（`up=1` 防重），再 Path A / Path B fallback |,呼叫上面的新函式;Path A 那個 if block 完全沒動 |
| `relayCandidates.ts` | ⚠️ **狀態有矛盾,待你核對** | 對話紀錄先說「加了一個 `fallback_root` role」,後又說「跟原始上傳版本逐位元組相同」。兩者不可能同時成立,實作前務必自己 diff 一次確認現況 |
| `Track.tsx` | **本步未改** | 初始 discovery 仍走 platform / loadProbeCandidates；upstream 第一跳僅在 ContinuationRelay。Track 對齊為後續 step | 對話紀錄先說「platform-host 分支換成新函式」,後又說「跟原始上傳版本逐位元組相同」。如果最終是**沒改**,代表 Track.tsx 仍在用舊的 `loadProbeCandidates`/`buildProbeUrl`(org 參數格式)發起第一跳——這件事之所以「應該沒關係」,前提是 5.5 節那個「`gi` 不存在時 Path B 視為鏈起點」的設計生效,讓 Track.tsx 發起的第一跳落地後,MISS 會自動被 `ContinuationRelay.tsx` 接手用新邏輯處理,**而不是要求 Track.tsx 自己產生正確的候選人清單**。這個推論成不成立,取決於 Track.tsx 那條「非 platform host 先試 `/r/platform`」的路徑,實際有沒有帶 `gi` 參數——這點我沒有 Track.tsx 原始碼,無法自己確認 |
| `continuationPrecheck.ts` | 未動 | Phase 3 HIT/MISS 判定邏輯,跟 Path A/B 選擇無關 |
| `cookieParent.ts` | 未動 | `getCookieParent`/`countCookieParentGroups` 仍被 `brandedDomains.ts` 的 onboarding 邏輯使用,與 Relay 無關 |

---

0. **Track.tsx 第一跳尚未吃 `upstream_domain`** — 訪客若先落到非 upstream host，仍可能多一次 platform/org probe，之後才進 ContinuationRelay 的 upstream 優先邏輯。

1. **`relayCandidates.ts` 與 `Track.tsx` 的實際狀態互相矛盾**(見第 6 節表格)——這是本次整理過程中發現、必須由你對照現在 repo 實際內容解決的問題,我無法用猜的方式在文件裡定案。
2. **`is_system = true` 是否等同 ONLY PROMOTE ASSET,是否唯一** ——目前假設成立,但沒有拿到 campaigns 完整 schema 佐證「未來不會有第二種 `is_system` campaign」。
3. **Track.tsx 第一跳是否真的帶 `gi` 參數**——沒有 Track.tsx 原始碼無法確認,這直接影響第 6 節裡「Track.tsx 不用改」這個結論是否站得住腳。
4. 本文件所有「最終狀態」描述都來自你提供的敘述文字,**不是我這次重新讀過程式碼後獨立驗證的結果**——套用前建議至少對 `probeState.ts`、`ContinuationRelay.tsx` 兩個「確定改了」的檔案跑一次 diff + typecheck。
