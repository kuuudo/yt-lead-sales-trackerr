回答你的焦慮 + MVP 鎖定規則 + 文件更新要點 + 明天用的 prompt

先講你最擔心的：go.ali.com → ali.com/newsletter-thankyou
可以工作，而且本來就是這樣設計的。




















階段Host靠什麼A→B→C→Newsletter tracking 點擊全程 go.ali.com同一 origin → localStorage journey 延續Newsletter 目的地 / thank-youali.com/...不同 origin 沒關係 → 靠 URL 上的 vt_*（含 vt_ej_id）+ 你貼的 global script / thank-you pixel
重點：

Journey 連續性只要求 VSTRK Track 的每一跳在同一個 tracking hostname（例如都是 go.ali.com）。
轉換頁本來就常常是客戶自己的站（ali.com），不需要也是 go.ali.com。
Track 導向 newsletter 時會把 vt_sid / vt_vid / vt_ej_id / vt_journey 等掛在 destination URL；thank-you pixel 從 query 或 localStorage 讀出再 POST /api/pixel。
若中間還經過 ali.com 某頁且裝了你那段 global script，它會把 vt_* 寫進 ali.com 的 localStorage，thank-you 即使 URL 被清掉參數仍可能讀得到。

所以：
textgo.ali.com/123 → go.ali.com/134 → go.ali.com/3425(newsletter token)
        ↓
ali.com/newsletter 或 ali.com/newsletter-thankyou  + pixel
同 origin 的是 tracking 鏈；thank-you 在 apex 是預期行為，不是失敗條件。
（前提：最後一跳 Track 有成功帶上 vt_ej_id 等參數到客戶站；同 origin A→B→C→Newsletter 你已驗證過 journey 列，attribution 閉環若要「購買 FK 到 snapshot」再確認 pixel 有沒有吃到 events_journey_id。）

MVP 鎖定規則（寫進文件用）
已驗證 / 可停手的

同 exact hostname 上的 A→B→C→（Newsletter terminal node）→ 同一 journey_id、snapshot-per-click events_journey ✅
跨不同 tracking origin 的連續 journey → MVP 不做（已知限制，非 bug）
Tier-3（YouTube 描述靜態連結、無 VSTRK JS）→ 硬邊界，維持文檔原意
推廣 Asset ≠ 換 promoter 的域名；穩定 URL 綁 Asset/建立時的 tracking_hostname
Phase 7 legacy cleanup → 仍須另行批准

Tracking domain（產品規則，不必先大改 journey code）

































規則說明連續 journey = 單一 exact origingo.ali.com 整段 OK；go.ali.com→go.nike.com 斷不強制「全公司只能一個域名」org 可有多個 branded domain建議：單一 funnel / 公開 Asset 鏈鎖定一個 hostname每條 redirect_links 永久 snapshot tracking_hostname不建議 MVP 硬鎖「一個 campaign 只能一個 domain」過嚴；真正要防的是同一條內容旅程混 host可選更嚴：一個 campaign 一個 default tracking domain，新連結預設都用它降低誤用，仍允許多 domain 存在{slug}.vstrk.com 品牌子域僅當該客戶 整段 funnel 都用同一子域 才保 journey；不要和 www.vstrk.com 混用
與 code 的關係

Track.tsx / redirects / journey 引擎：同 origin 路徑可先視為完成，不必再為跨域改一輪。
vt_ej_id → thank-you → pixel：機制已存在；若要確定性 pixel_purchase → events_journey，用一次實測確認閉環即可，不要和跨域問題綁在一起重做。
pixel_purchases 是否加 events_journey_id 欄位：文檔原設計是 lookup 在 pixel body + attributions；加欄位是可選強化，非 journey 延續前提。


文件狀態列建議改成（貼到文首）
Markdown**Status (MVP lock — 2026-09-08):**
V1 superseded. V2 edge model implemented and proven on same-origin hops.
V3 `events_journey` + `vt_ej_id` implemented and proven for Tier 1/2
(same exact tracking hostname), including real-world
A → B → C → Newsletter (terminal node, same journey_id) on a single host
(e.g. www.vstrk.com).

**MVP intentionally deferred:** continuous journey across different tracking
origins (e.g. go.ali.com → go.nike.com, or www.vstrk.com → go.customer.com).
This is a known localStorage origin boundary, not a regression.

**Tier 3** (YouTube/static description → external redirect without VSTRK JS)
remains a hard boundary (§19D-Tier3).

**Tracking-domain product rules (MVP):**
- Continuity requires one exact hostname for all Track hops in a funnel.
- Multiple branded domains per org allowed; each redirect_link snapshots one hostname.
- Do not rewrite a promoted asset’s public URL onto the promoter’s different origin.
- Customer conversion pages (e.g. ali.com/thank-you) may differ from the tracking
  host (go.ali.com); attribution uses vt_* URL/pixel handoff, not tracking-host localStorage.
- Optional later: org-branded `slug.vstrk.com` only if the entire funnel stays on that host.
- Phase 7 legacy cleanup still not approved.
建議在文末加一節 §22 MVP locks & domain policy（內容用上面表格即可），§19 補一句：同 hostname 上 Newsletter terminal + thank-you 在客戶 apex 屬 Tier-2 參數交接，與 Tier-3 不同。

明天用的 prompt（可直接貼）
textRead 3_FORWARD_VALIDATED_ATTRIBUTION_JOURNEY.md (updated MVP locks) and do NOT change code unless I explicitly approve.

MVP locks already decided:
1. Same exact tracking hostname → journey + events_journey work (proven A→B→C→Newsletter).
2. Cross tracking-origin continuous journey is DEFERRED (not a bug to “fix” with cookies/probabilistic matching).
3. Tier-3 YouTube static description remains hard boundary.
4. Promote asset = reuse asset’s stable tracking URL/host; never rewrite to promoter’s different origin.
5. Multiple branded domains per org OK; each redirect_links row permanently snapshots tracking_hostname.
6. Do NOT require one-domain-per-entire-company; prefer one origin per funnel/asset public chain.
7. Customer thank-you on apex (ali.com) while tracking on go.ali.com is EXPECTED; vt_* + pixel handoff.
8. Phase 7 cleanup still not approved.

Tasks for this session (analysis only first):
A. Confirm whether createRedirectLink / promotion / Track New Content always bind hostname from the asset/campaign link being created (not the promoter’s unrelated default when promoting someone else’s asset).
B. List any UI/path that could accidentally mix hosts in one funnel.
C. Optional small verification plan: same-origin Newsletter hop sets vt_ej_id and thank-you pixel sends events_journey_id (no cross-domain work).
D. Do not redesign journey, cookies, or vt_sid.

Wait for approval before any code change.

一句總結

go.ali.com 整段 tracking + ali.com thank-you + pixel → 設計上就是要能通。
MVP：同 host 旅程已過關；跨 tracking 域名連續 journey 先放著。
不必為了跨域再改 Track/journey；attribution 閉環用 vt_ej_id 實測確認即可。
域名規則：鎖的是「一條 funnel 一個 exact origin」，不是「全公司只能一個 domain」。
can you update my 3_FORWARD_VALIDATED_ATTRIBUTION_JOURNEY    and can you write a new md (for tracking domain,) new rule lockDone. Two files are in /home/workdir/artifacts/:
1. Updated 

Status rewritten for MVP lock (2026-09-08)
Same-host A→B→C→Newsletter proven
Cross-tracking-origin continuous journey deferred
Conversion host ≠ tracking host called out as OK
Points to the new domain doc + §22

§13 Phase 7 note updated (Newsletter terminal + cross-origin deferred)
New §22 MVP Locks — proven scope, deferred items, domain summary table, code posture, future-session rules

2. New 
Locked rules including:









































IDRuleR1Continuity = exact hostnameR2Multiple domains per org allowedR3One campaign → one domain not requiredR4One funnel/asset chain → one hostname requiredR5redirect_links.tracking_hostname is permanentR6Promote = keep asset URL/hostR7–R9Defaults, *.vstrk.com, customer domainsR10No journey-engine rewrite for domain policy alone
Also covers: origin vs org, thank-you on ali.com while tracking on go.ali.com, promote vs cross-origin journey, verification checklist.

Your anxiety case (again, fixed in both docs):
textgo.ali.com/… → go.ali.com/… → go.ali.com/newsletter-token
        ↓
ali.com/newsletter-thankyou + pixel
→ Supported. Journey needs same tracking host; thank-you may be apex.
Copy these into your repo when ready (attachments/ still has the old journey file only).