我先對目前可檢視的程式碼做最後一輪針對性查證，再寫報告，避免把推測寫成事實。

VSTRK Analytics Attribution Master Handoff Report

證據標記：

CONFIRMED：本對話中直接讀到的程式碼或 console log。
PARTIAL：只證明一半。
UNKNOWN：未檢視或沒有證據。
PROPOSED：我的建議，尚未驗證。
INFERENCE：由證據推論，不是直接觀察。

本報告基於 5 個已讀檔案（AllAssetsAnalytics.tsx、InDepthAnalytics.tsx、Dashboard.tsx、analyticsEngine.ts、assetAnalyticsEngine.ts）、6 個 attribution 相關檔案（getAssetAnalyticsRows.ts、resolveJourneyStart.ts、resolveStripePurchaseJourneys.ts、resolvePixelPurchaseJourneys.ts、resolvePixelPurchaseEventId.ts、journey.ts）、你的 F12 log、你提供的資料庫證據，以及專案目錄樹。沒有執行任何程式碼或 SQL，也沒有修改任何東西。

對前幾輪的更正：

我先前說 Pixel 路徑「CORRECT」，那只是「接線正確、邏輯正確」，執行期是否成功我沒有證據（見 6-F 的 getJourneysForEvent 風險）。
我先前說「Discord 影片那列的 2 筆 $2 與 2 筆 Stripe 一致」「兩列 $197 幾乎一定來自 Pixel」，這兩句是推論，不是證據。
1. Executive Summary

要建立的東西：「一筆轉換（conversion）最多只有一個 canonical 歸屬 owner」。轉換包含 sales call、consultation、direct purchase、newsletter，以及未來的類型。所有分析頁面（AllAssets、InDepth、Dashboard、Promotion、Marketer、Campaign、未來圖表）都消費同一份歸屬結果，不各自決定營收算給誰。

已存在且已確認可運作：

services/attribution/ 的三段解析：Stripe（session + token → checkout event → journey_id）、Pixel（event_id → journey_id）、resolveJourneyStarts（journey → TRUE START）。
Stripe 路徑有資料層級的證據（見第 4 節）：2 筆 Stripe 購買都解析出 TRUE START，並通過 AllAssets 的 identity 檢查。
AllAssets 把 owner map 傳入 assetAnalyticsEngine，引擎會改寫購買的 video_id、把購買從非 owner 資產移出。
結構點擊（來自 events）與營收歸屬（改寫購買的 video_id）是分離的。

部分驗證：

Pixel 路徑：接線已確認（event_id 欄位有被選取、傳入 resolver、結果進 owner map）。沒有任何執行期證據，因為沒有 Pixel 專屬 log，且你的已知 Pixel 樣本只有單步 journey（見第 4 節）。

確認的問題（程式碼層級）：

InDepth 和 Dashboard 完全沒有 attribution，營收直接用 purchase.video_id。
InDepth 和 Dashboard 的購買沒有日期過濾（AllAssets 有）。
同一筆購買的 owner 會隨 activeSource 切換而改變（見 6-B）。
owner map 內嵌在 AllAssets 專用邏輯裡，沒有獨立可重用的層（見 6-A）。
「direct」路徑在資產層級沒有明確的唯一 owner 定義（見 6-C）。

最重要的架構缺口： 缺少一個「conversion → owner」的共用結果（不依賴 AllAssets 的 identity 範圍），以及 direct 的資產 owner 定義。

建議的下一步： 先驗證 Pixel 路徑的執行期是否成功（成本極低，見第 11 節的 First Action），再抽出共用的 owner 決策函式。

2. Canonical Business Rules

已確定（你已明講）：

有有效 journey 證據 → TRUE START 是唯一 owner。沒有 → purchase.video_id 是 owner。
一筆轉換最多一個 owner。不做多觸點歸屬。
結構點擊與 hop（A→B、B→C、C→D）保持獨立，永遠留在各自的影片。
營收 / 轉換歸屬遵守上面規則；點擊不遵守。
同一個 canonical owner 不得因為使用者切換來源篩選（total / stripe / pixel）而改變。這是你要求的不變式。
任何一頁在同一篩選範圍下，對同一筆轉換必須得到同一個 owner。

已實作的轉換類型行為（CONFIRMED，analyticsEngine.ts）：

Pixel：只有 purchase 和 consultation 且金額大於 0 才算營收；sales_call 進估計通話營收（EV，只有 Pixel）；newsletter 只計數。
Stripe：revenue_type 為 offer、consultation、sales_call、newsletter，各自歸入對應指標。
Pixel 的轉換計數沒有去重（程式碼註解寫「intentional」）；營收只做「Pixel 對 Stripe 的跨來源 session 去重」。

journey 證據缺失、模糊、無效或無法解析時（CONFIRMED，程式碼）： 都退回直接歸屬（owner map 沒有該筆）。

Stripe 狀態：no_session、no_token、no_checkout_event、checkout_not_matched、no_events_journey、ambiguous_journey。
Pixel 狀態：no_event_id、no_events_journey、ambiguous_journey。
START 解析狀態：no_journey_rows、no_path_row、snapshot_invalid、link_missing、video_missing。
另外，START 的 (video, asset) 不在檢視者的 identities 裡時（skippedNoIdentity），AllAssets 也退回直接歸屬。這是 AllAssets 專屬的過濾。

需要你決定的規則（不要由我自行發明）：

resolved_path_only（journey 只有一步，START 就是路徑根）是否算「TRUE START」？目前和 resolved_with_upstream_hop 在 owner map 裡完全同等處理。
hop_via_asset（靠「某影片自己的資產被某個落地頁連結指向」推出的上游 hop）是否算有效證據？resolver 已實作，但檔頭註解只寫了 destination_url 一種證明。你的 journey 9ff81ccc 就是這種。
direct 的資產 owner 用什麼規則（見 6-C）。
START 影片不在該頁範圍內時，InDepth 和 Dashboard 該怎麼處理（丟掉、算給 owner、保留直接歸屬）。
擁有 owner 的購買可以豁免組織檢查（scopeToAsset 內寫了「Attribution is org-independent」）。這是否是你要的跨組織可見性？
「campaign」在 Campaign Analytics 要用哪一種（見 6-E）。
3. 目前架構與資料流
text
資料庫
  events / events_journey / redirect_links / videos / assets /
  stripe_purchases / pixel_purchases / campaign_element_assets / asset_resources

AllAssetsAnalytics.tsx
  → services/asset/getAssetAnalyticsRows.ts
      ├─ 抓 redirect_links（組織範圍 + 共享資產）→ identities (video, asset)
      ├─ 抓 events（asset_id、日期窗內）
      ├─ 抓 stripe_purchases（token 或 session，日期窗內）
      ├─ 抓 pixel_purchases（session，日期窗內）
      ├─ resolveStripePurchaseJourneys → (journey_id → resolveJourneyStarts)
      ├─ owner map：stripeOwnerByPurchaseId（約 598–621 行）
      ├─ owner map：pixelOwnerByPurchaseId（約 630–668 行，經 resolvePixelPurchaseJourneys）
      └─ 每個資產呼叫 lib/assetAnalyticsEngine.computeAssetAnalytics
            ├─ scopeToAsset（套用 owner：改寫 video_id、移出非 owner 資產）
            ├─ computeAssetMetrics / computeRelationships
            └─ processVideoMetrics（來自 analyticsEngine，公式共用）
  → 依 (video, asset) identity 組成表格列

InDepthAnalytics.tsx、Dashboard.tsx
  → 自己 supabase 查 events / stripe_purchases / pixel_purchases / redirect_links
  → lib/analyticsEngine.getAnalyticsEngine → processVideoMetrics
  → 營收以 purchase.video_id 分組，沒有 journey、沒有 owner
元件	實際職責	是否 canonical 流程	備註
resolveJourneyStart.ts	journey_id → TRUE START（含上游 walk）	是，核心決策	另提供 fetchRowsByIn、chunkArray 給其他檔案共用
resolveStripePurchaseJourneys.ts	Stripe 購買 → journey_id → START	是	有資料層級證據
resolvePixelPurchaseJourneys.ts	Pixel event_id → journey_id → START	是	僅程式碼層級；逐筆序列呼叫，任何一筆出錯整批退回空 map
resolvePixelPurchaseEventId.ts	補回缺失的 event_id（只回傳，不寫庫）	否，未引用	已確認沒有任何已讀檔案 import 它
journey.ts	讀 events_journey（最新一列為準）	部分：被 Pixel resolver 用	與 resolveJourneyStart 的路徑規則不同（見第 6 節）
getAssetAnalyticsRows.ts	組裝 identities、抓資料、建 owner map、驅動引擎	是，但混合了全域與 AllAssets 專屬邏輯	殘留兩段 TEMP 診斷
assetAnalyticsEngine.ts	以資產為單位的範圍、owner 套用、關係、指標	是	檔頭明說不處理 promotion、marketer 歸屬
analyticsEngine.ts	以影片為單位的指標公式（processVideoMetrics）、各種 builder	否（沒有 journey 邏輯）	grep 確認沒有 journey、event_id、conversion_id
AllAssetsAnalytics.tsx	UI；呼叫 getAssetAnalyticsRows	是	
InDepthAnalytics.tsx	UI + 自己查資料 + getAnalyticsEngine	否，繞過	event_id 被選了又丟掉
Dashboard.tsx	同上（檔案路徑待確認，見第 5 節）	否，繞過	
orgAnalyticsFacts.ts	NOT INSPECTED	UNKNOWN	你說它已含 event_id，我沒看到
4. Evidence Inventory
4-1 Stripe

瀏覽器 log（本對話可見）：

text
[AssetAnalyticsRows] counts {pixelPurchases: 19, stripePurchases: 2}
[AssetAnalyticsRows] stripe-journey status {resolved: 2}
[AssetAnalyticsRows] stripe owner overrides {applied: 2, resolvedWithStart: 2, skippedNoIdentity: 0}
[AssetAnalyticsRows] test purchase 992fbb1f {
  checkoutCandidateCount: 1,
  checkoutEventId: "92aec1d0-4e74-4dd5-8721-5bd5fd973d68",
  journeyId: "3fac8ee5-32de-484c-a219-010eb36d304a",
  purchaseId: "992fbb1f-bc3b-4274-98d9-c18612863c82",
  status: "resolved",
  startVideoId: "f7c0d6b4-09ce-4f86-b20b-9d41685a48e6",
  startAssetId: "4cf5135b-6c85-4f7d-aa82-bbd4efa70530",
  start: { status: 'resolved_with_upstream_hop', startRedirectLinkId: '5b46bb05-69bd-4d4d-b46b-a35cefd6c205', … }
}
stripe-journey-start: 3148.57 ms；query G (archive context): 1675.70 ms

已證明：

Layer 1 與 Layer 2 在真實資料上對 992fbb1f 運作正常，結果與預期（f7c0d6b4 / 4cf5135b）一致。
範圍內 2 筆 Stripe 都有解析出 START，且都通過 identity 檢查，所以 owner map 有 2 筆。

沒有證明：

owner 真的出現在 AllAssets 畫面上哪一列（需要 UI 對照）。
InDepth 和 Dashboard 的行為（它們沒有這條路徑）。
另外一筆 Stripe 的內容（log 只印了 992fbb1f）。

你提供的 token mGVj、session 5f5bc3f6-…、checkout link 551b73f5-… 在本對話的 log 裡沒有直接出現，我只能標為「你提供」。

原始 SQL： 本對話沒有，無法還原，不捏造。不需要重跑。

4-2 TEMP 診斷（journey 9ff81ccc）
text
status: resolved_with_upstream_hop
journeyId: 9ff81ccc-15a3-4b5d-a7ff-dcd201eaf504
pathRootRedirectLinkId: cd108a21-ea9e-4a8c-ab21-13c8ffe189ff
startRedirectLinkId: 12443b85-68ef-4b6c-a6a8-ae68f95ffbab（也是唯一的 upstream hop）
startVideoId: 6821ee2d-1ef1-46ad-92f0-430b57328ea2
startAssetId: 2783c3aa-9f98-4ec0-a057-d10079a94903
diagnostics: ['hop_via_asset:12443b85-…']

已證明： resolveJourneyStarts 對這條 journey 運作正常，START 是靠資產路徑推出的。
沒有證明： 這來自程式碼寫死的呼叫，與任何購買無關，所以不能證明營收有套用該 owner。它也不能代表這條 journey 對應到哪筆購買。

4-3 Pixel

你提供的資料（資料庫層級）：

項目	值
pixel_purchases.id	088470aa-9e4f-4ff3-bdf6-94c7a4a3a83a
event_id	c8e74f44-07ff-4bc2-9847-33ca903f7f1d
events_journey_id	2bbd2b24-290d-4bcb-85a4-851c0a57dc9f
video_id / asset_id	19ded023-ae85-4af2-a2e9-f4b42fffc69f / f28e2a0b-6858-42cc-ae42-a144bef6d85d
event_type / amount	newsletter / 0
conversion_id	f7dfa281-2108-44d4-8d05-1e2899c249c3
對應 event	session 6b048855-9786-41f1-b838-326505a9c62f、campaign 6796ed7f-2226-4c6d-82f7-d293236b9a63、redirect link ec90da90-252b-4e0c-9177-c89369095d12（newsletter 類型，bridge token c5EE，URL https://www.vstrk.com/BQcBid）
對應 events_journey	row 2bbd2b24-…，journey_id f25782b7-065b-4be2-85d6-e25f9ce3ffdf，event_ids 含該 event，快照 1 步，destination_video_id 為 null

已證明： 資料庫橋 pixel_purchases.event_id → events_journey.event_ids → journey_id 存在（資料層級）。

沒有證明：

程式碼在執行期走通這條橋。
最終歸屬 owner 正確：這個樣本是 1 步 journey，就算解析成功，START 也只會是路徑根影片，與 pixel_purchases.video_id 相同。它無法區分 Scenario 2 與 Scenario 1。
這是 newsletter、金額 0，與 $197 案例無關。
4-4 已執行過的 SQL（你提供，結果由你確認；本對話無法獨立確認）
sql
SELECT id, event_id, events_journey_id, video_id, asset_id, event_type, amount, conversion_id, created_at
FROM public.pixel_purchases
WHERE id = '088470aa-9e4f-4ff3-bdf6-94c7a4a3a83a';
sql
SELECT ej.id AS events_journey_id, ej.journey_id, ej.event_ids, ej.journey_snapshot
FROM public.events_journey ej
WHERE ej.event_ids @> '["c8e74f44-07ff-4bc2-9847-33ca903f7f1d"]'::jsonb;

由第二個查詢可推論： events_journey.event_ids 是 jsonb（@> …::jsonb 能執行）。這對 6-F 的風險很重要。不需要重跑。

4-5 其他先前觀察（INFERENCE，需要驗證）
AllAssets 兩列 $197（Instantly ai、80+ n8n）、InDepth 的 IG Reel 一筆 $197、80+ n8n 在 InDepth 顯示 $0。是否同一筆購買：UNKNOWN。
可以確定的只有：如果 AllAssets 那兩列的資產是同一個 asset_id，它們不可能是同一筆購買（同一資產內一筆購買只會歸在一支影片下）。
兩列 $197 是否來自 Pixel：INFERENCE（範圍內 Stripe 只有 2 筆，Pixel 有 19 筆）。
5. Complete Code Inventory

狀態說明： ✅ 已檢視；⛔ NOT INSPECTED。

分類	路徑	職責	狀態	是否需改	備註與風險
事實/資料存取	services/analytics/orgAnalyticsFacts.ts	你說是共用事實層	⛔	UNKNOWN	需檢視，可能是 canonical 資料層
Stripe 歸屬	services/attribution/resolveStripePurchaseJourneys.ts	購買 → journey → START	✅	否	Layer 1 錯誤會整批退回直接歸屬；.or() 與 fallback 查詢格式不同
Pixel 歸屬	…/resolvePixelPurchaseJourneys.ts	event_id → journey → START	✅	否（可能需修穩健性）	逐筆序列、任何失敗回空 map
Pixel event_id 補回	…/resolvePixelPurchaseEventId.ts	補缺失的 event_id	✅	否	未被引用；寫入端使用
journey 重建	…/resolveJourneyStart.ts	TRUE START	✅	小幅（選更多欄位）	LINK_COLUMNS 沒有 promotion_id、campaign_id、organization_id
journey 讀取	lib/journey.ts	最新列為準	✅	否	與 resolveJourneyStart 路徑規則不同；getJourneysForEvent 用 .contains('event_ids',[eventId])（見 6-F）
資產/影片	services/asset/getAssetAnalyticsRows.ts	組裝、owner map	✅	是（抽出）	約 598–668 行；TEMP 診斷殘留；AssetPixelPurchaseRow 型別沒有 event_id
指標	lib/analyticsEngine.ts	影片層指標公式	✅	否（可能需接收已歸屬資料）	無 journey 邏輯
指標	lib/assetAnalyticsEngine.ts	資產層範圍、owner 套用	✅	小幅（owner 來源改共用）	
整合	pages/AllAssetsAnalytics.tsx	UI	✅	小幅	沒有使用返回的 stripeJourneyByPurchaseId
整合	pages/InDepthAnalytics.tsx	UI + 查詢	✅	是	無日期過濾、無 owner
整合	pages/Dashboard.tsx	UI + 查詢	✅	是	目錄樹同時有 pages/Dashboard.tsx、pages/Dashboard2.tsx、lib/Dashboard.tsx；你上傳的是哪一個需要確認
其他分析	見下		⛔	UNKNOWN	全部 NOT INSPECTED

NOT INSPECTED（來自目錄樹，必須在後續階段檢視）：

頁面：TopPromotions、TopMarketers、TopRankings、Tree、CampaignJourneyMap、PromotionJourneyMap、PromotionJourneyVolumeChart、AllCampaignAnalytics、AllPromotionsAnalytics、CampaignAnalytics、IndividualPromotionAnalytics、MarketerAnalytics、AssetAnalytics、AssetDetail、VideoDetail、Videos、Analytics、AnalyticsTest、Workspace。
小工具：components/analytics/widgets/DashboardWidget、InDepthAnalyticsWidget、KPIWidget，以及 lib/dashboardWidgetPageCache、inDepthAnalyticsWidgetPageCache。這些很可能是另一份 Dashboard 與 InDepth 的資料來源，是潛在的繞過點。
引擎與服務：lib/promotionAnalyticsEngine、promotionAnalytics、campaignElementAnalyticsEngine、journeyAnalyticsEngine、journeyGraph、metricsForFactBag、analyticsProcessor、widgetAnalytics、attributeConversion、downstreamForRow、upstreamForRow、assetJourney、promotionJourney；services/analytics/buildPromotionMetricRows；services/asset/getAssetAnalytics、getAssetAnalyticsBatch；services/promotion/getPromotionAnalytics、getMarketerAnalytics、getTopMarketersAnalytics、getTopPromotionsAnalytics；services/journey/journeyDownstreamResolver；services/attribution/resolveBridgeAttribution、resolvePixelConversionProvenance。
其中 attributeConversion.ts、resolveBridgeAttribution.ts、journeyAnalyticsEngine.ts 的名稱顯示它們可能是另一套歸屬邏輯，必須確認誰在使用。
6. 瓶頸與未解問題
A. owner 解析內嵌在 AllAssets（CONFIRMED）
部分	內容	性質
Stripe（約 598–621 行）	取 status==='resolved' 且有 startVideoId 和 startAssetId	全域決策
同上	identityKeys.has(video::asset) 與 assetTypeById.has(asset)	AllAssets 專屬過濾
Pixel（約 630–668 行）	呼叫 resolvePixelPurchaseJourneys，取 START	全域決策
同上	雙重記錄規則（Pixel 的 purchase/consultation 若 session 與某筆 Stripe 相同，就跟 Stripe 的 owner）	全域決策，但依賴 activeSource
同上	pxIdentityKeys、assetTypeById	AllAssets 專屬
引擎 scopeToAsset	依 activeSource 忽略 Stripe owner 或 Pixel owner；非 owner 資產移出；total 模式下連同 session 相同的 Pixel 一起移出	AllAssets 專屬

PROPOSED 抽出方式： 把「呼叫三個 resolver + 雙重記錄規則 + 狀態對應」原樣搬到 services/attribution/ 下的共用函式，輸出每筆轉換的 owner 與原因，不含 identity 過濾和 activeSource；AllAssets 在其上再套 identity 過濾。這是搬移，不是新演算法。

B. activeSource 一致性（CONFIRMED，程式碼層級；未用資料驗證）

getAssetAnalyticsRows.ts 內有這行：else if (activeSource !== 'pixel') return; // Stripe twin keeps legacy attribution。

行為：Pixel 的 purchase/consultation 與某筆 Stripe 購買同 session，但該 Stripe 沒有 owner 時：

pixel 模式 → Pixel 用自己的 owner。
total 模式 → 不給 owner，走直接歸屬。

同一筆 Pixel 轉換會因為篩選不同而得到不同 owner，違反你的不變式。另外，scopeToAsset 在 pixel 模式忽略 Stripe owner、在 stripe 模式忽略 Pixel owner，這部分可以接受（只決定「是否計入」），但上面那個分支是 owner 本身在變。

相關邊緣： 雙重記錄比對只看「已載入的 Stripe 購買」。這些購買受日期窗與範圍影響，所以 owner 也可能隨日期範圍改變（INFERENCE，邊緣情況）。

不變式： canonical owner 只由轉換本身與證據決定；activeSource 只決定這筆轉換是否計入該指標。

C. 資產層級的 direct owner（CONFIRMED 行為，資料影響 UNKNOWN）
影片層：resolvePurchaseVideoId，優先用 purchase.video_id，沒有再用購買的 redirect link 的 video_id。
資產層：購買進入某資產範圍的條件是（a）Stripe 的 redirect_link_token 符合該資產的連結 token，或（b）session 出現在該資產的事件裡；Pixel 只有 session 條件。進入後以影片分組，再與 (video, asset) identity 比對。
結論：沒有 owner 的購買，只要 session 或 token 對得上多個資產，且影片同時推廣這些資產，就可能出現在多個 (video, asset) 列。結構上可能發生，是否真的發生需要資料驗證。

PROPOSED 的安全選項（需你選）：

Pixel 用 pixel_purchases.asset_id（你提供的列有此欄，但目前所有查詢都沒選它）；Stripe 用購買前最近一筆符合 video_id 的事件的 asset_id。
不指派資產 owner（資產欄位為空），只做影片層歸屬；資產頁只計算有明確資產證據的轉換。
只有該影片在該 session 內僅碰過一個資產時才指派，否則為空。

不要假設每支直接影片只對應一個全域唯一資產。

D. Marketer 與 promotion 歸屬
resolveJourneyStart.ts 的 LINK_COLUMNS 是 id, token, video_id, asset_id, link_type, destination_url, tracking_hostname，沒有 promotion_id、campaign_id、organization_id（CONFIRMED）。
getAssetAnalyticsRows.ts 的 REDIRECT_LINKS_COLUMNS 有這些欄位，但只涵蓋檢視者範圍內的連結，START 連結可能不在其中。
購買本身也有 promotion_id 和 campaign_id（直接歸屬時有用）。
redirect_links.organization_id 在有 promotion 的連結上是資產擁有者的組織，不是 marketer 的組織（程式碼註解）。
marketer 如何從 promotion 對應：NOT INSPECTED（getPromotionAnalytics、getMarketerAnalytics）。
redirect_links.promotion_id 在 START 連結上是否可靠：UNKNOWN，需要用你的真實 START 連結驗證（SQL 見第 9 節）。

PROPOSED： 歸屬結果帶 startRedirectLinkId，promotion、marketer 由該連結查表取得，不要從影片 id 推。

E. Campaign 語意

目前程式碼裡至少有這幾種：

Asset Campaign：LOCKED 定義，依資產類型對應（video → videos.campaign_id；campaign_element → campaign_element_assets.campaign_id；resource → asset_resources.campaign_id），絕不取自 redirect_links.campaign_id。
Link Campaign：redirect_links.campaign_id（INFERENCE，由 UI 欄位名稱推論）。
Content Campaign：UI 有此欄；我推測是影片的 campaign，需驗證。
購買自己的 campaign_id：第四種。

owner_campaign_id 在定義前有歧義。PROPOSED： 不存單一欄位，歸屬結果保留 ownerVideoId、ownerAssetId、startRedirectLinkId，由消費端按需要的語意查表；購買的 campaign_id 保留為原始事實。

F. 轉換身分與去重
Stripe：stripe_purchases.id、session_id、token。程式碼沒有選取或使用 conversion_id；Stripe 是否有此欄：UNKNOWN。
Pixel：id、session_id、event_id、events_journey_id，加上你提供的 asset_id、conversion_id。所有已讀程式碼完全沒有使用 conversion_id（grep 確認）。
現有去重（CONFIRMED）：Pixel 的 purchase/consultation 且金額大於 0，若同一影片分組內 session 已有 Stripe 列就略過；Pixel 內部不去重（註解說明是寫入端的責任）；計數不去重。
注意：現有邏輯和 AllAssets 的雙重記錄規則已經假設「同 session = 同一筆」，這與你要求「不要只因同 session 就判定重複」有張力。是否為同一筆商業轉換需要資料驗證，這也是 $197 調查的一部分。
風險：Stripe 與 Pixel 若落在不同影片分組（各自的直接歸屬不同、或 owner 不同），跨來源去重會失效。
G. 日期、組織、來源（CONFIRMED）
項目	AllAssets	InDepth / Dashboard
購買日期過濾	是（created_at 在窗內）	否（連 created_at 都沒選）
事件日期過濾	是	是
組織範圍	identities 來自組織範圍 + 共享資產；購買有 organization_id 檢查，但有 owner 的購買豁免	以組織的 videos / campaigns 為範圍
Pixel 範圍	session 在資產事件內	只用 campaign_id IN (…)，campaign_id 為空但有 video_id 的 Pixel 列會被漏掉（INFERENCE，由查詢推論）
來源篩選	activeSource	同（在引擎內處理）

組織豁免可能造成跨組織可見性，這是設計決定，需要你確認（第 2 節第 5 項）。

H. 其他頁面

確認繞過： 只有 InDepth、Dashboard。其餘全部 NOT INSPECTED（清單見第 5 節）。

額外發現
getJourneysForEvent 用 .contains('event_ids', [eventId])。supabase-js 會把陣列轉成 cs.{uuid}。你的 SQL 顯示 event_ids 是 jsonb，jsonb 應傳 JSON 字串（cs.["uuid"]，Stripe 的 fallback 就是這樣寫）。**如果這在 jsonb 欄位上失敗，resolvePixelPurchaseJourneys 會捕捉錯誤，回傳空 map，所有 Pixel 悄悄退回直接歸屬。**這是 UNKNOWN 的風險，不是確認的 bug。驗證方法：看 console 有沒有 [resolvePixelPurchaseJourneys] failed (legacy behaviour kept)，或確認其他頁面使用 getJourneysForEvent 是否正常。
AssetPixelPurchaseRow 型別沒有 event_id，但 getAssetAnalyticsRows.ts 讀 p.event_id。執行期正常（欄位有被選取），型別層級需用 tsc 確認。
journey.ts（最新列為準）與 resolveJourneyStart（略過 checkout 列再取最新）對「journey 路徑」的定義不同。CampaignJourneyMap 若用 journey.ts，路徑結構可能與 START 解析不一致。
getAssetAnalyticsRows.ts 有兩段 TEMP 診斷（992fbb1f 的 log 與寫死 journey 的 resolveJourneyStarts），後者每次載入多一次查詢。
效能：Stripe 解析 3.1 秒；Pixel 是逐筆序列（每筆至少 2 個查詢，19 筆約 38+ 查詢）。
7. Proposed Canonical Architecture

建議：共用純函式 + 薄服務，不建新引擎，也不重寫 resolver。

text
Layer 0  原始事實        stripe_purchases / pixel_purchases / events / redirect_links /
                         events_journey（現有查詢）
Layer 1  Canonical 歸屬  services/attribution/ 新增一個共用函式
                         輸入：Stripe 與 Pixel 購買列（含 id、session、token、event_id、
                         video_id、type、amount、created_at）
                         輸出：每筆轉換 → { source, sourceRecordId, conversionId,
                         conversionType, amount, occurredAt, ownerVideoId, ownerAssetId,
                         startRedirectLinkId, journeyId, attributionReason }
                         內部：呼叫現有三個 resolver + 現有雙重記錄規則
                         規則：與 activeSource、identity、頁面範圍完全無關
Layer 2  頁面範圍與篩選  各頁自己決定：日期、組織、來源、identity 範圍、
                         START 在範圍外怎麼辦
Layer 3  指標聚合        analyticsEngine.processVideoMetrics（公式共用）
Layer 4  視覺化          各頁面
結構事實（events 的點擊與 hop）  獨立，不經 Layer 1

選項評估：

抽成共用純函式 + 薄服務：最小改動，推薦。
併入 orgAnalyticsFacts.ts：需要先檢視該檔才能判斷。
新引擎：不需要，因為指標公式已共用（assetAnalyticsEngine 已經呼叫 processVideoMetrics）。

attributionReason 建議細分（PROPOSED）： true_start_upstream、true_start_path_root、direct、unresolved，這樣第 2 節那個待決定的 resolved_path_only 問題可以日後再決定，不必現在鎖死。

欄位補充： ownerPromotionId、ownerMarketerId、各 campaign 不放進第一版，由 startRedirectLinkId 查表得到（見 6-D、6-E）。

如何讓新圖表自動繼承： 新圖表只取 Layer 1 的結果加上自己的範圍篩選，不碰 Stripe、Pixel、events_journey。

8. 分階段實作路線

Phase 0：證據與架構凍結

目的：不再重複調查。
做：驗證 Pixel 執行期是否成功（第 11 節 First Action）；檢視 orgAnalyticsFacts.ts；確認上傳的 Dashboard 是哪個檔案。
驗收：知道 Pixel owner 數量，且 getJourneysForEvent 是否在 jsonb 上正常。
不要改：任何程式碼。
DONE：6-F 的風險被證實或排除。

Phase 1：Canonical 歸屬基礎

檔案：getAssetAnalyticsRows.ts（抽出）、services/attribution/ 新增共用函式、resolveJourneyStart.ts（LINK_COLUMNS 多選欄位，非破壞性）。
改動：抽出 Stripe 與 Pixel 的 owner 決策；去掉 activeSource 對 owner 的影響；明確 direct、unresolved 狀態；direct 資產 owner 的政策（需你選）；轉換身分與去重規則。
驗收：AllAssets 的數字在 total、stripe、pixel 三種來源下，對同一筆轉換的 owner 完全一致；992fbb1f 仍解析到 f7c0d6b4 / 4cf5135b。
風險：雙重記錄規則的行為會改變（現在隨 activeSource 變）。
不要改：Stripe 的 Layer 1、2；TRUE START 演算法；Scenario 1、2。
DONE：getAssetAnalyticsRows.ts 只剩呼叫共用函式 + identity 過濾；測試通過。

Phase 2：Tier 1 整合（AllAssets、InDepth、Dashboard）

改動：InDepth 和 Dashboard 選取 id、保留 event_id、呼叫共用函式、改寫購買的 video_id 後再進 getAnalyticsEngine；對齊日期過濾（需要選 created_at）；處理 START 在範圍外（需你決定）。
驗收：同一組織、同一篩選下，三頁對同一筆轉換 owner 一致。
風險：Dashboard 與 InDepth 的快取（dashboardPageCache、inDepthAnalyticsPageCache）需要同步失效。
DONE：第 10 節「三頁 owner 一致」測試通過。

Phase 3：Promotion 與 Marketer 分析

先檢視：promotionAnalyticsEngine、getPromotionAnalytics、getMarketerAnalytics、getTopPromotionsAnalytics、getTopMarketersAnalytics、TopPromotions、TopMarketers、TopRankings。
改動：promotion、marketer 由 startRedirectLinkId 查表；不從影片推。
DONE：promotion 與 marketer 的營收等於該轉換 owner 對應的歸屬。

Phase 4：Campaign 分析與結構視覺化

先決定 campaign 語意。檢視 CampaignAnalytics、Tree、CampaignJourneyMap、PromotionJourneyMap。
結構圖維持使用結構事實；若需營收，消費 Layer 1。處理 journey.ts 與 resolveJourneyStart 的路徑規則差異。
DONE：campaign 營收可從歸屬結果導出，不重新發明規則。

Phase 5：驗證與清理

端對端 SQL 驗證、瀏覽器驗證、跨頁對帳、日期/來源/組織篩選測試。
移除 TEMP 診斷；Pixel 改批次查詢；檢查效能。
9. 驗證計畫與 SQL 附錄

欄位名稱來自程式碼或你提供的證據。標示 DRAFT 的需先確認 schema。amount 的型別可能是文字或數字，所以以下查詢都加了 ::numeric。

編號	用途	狀態
Q1	Pixel 單筆（4-4 第一個查詢）	ALREADY RUN，不需重跑
Q2	event_id → events_journey（4-4 第二個查詢）	ALREADY RUN，不需重跑
Q3	Stripe 轉換 → checkout → journey	NEW，DRAFT
Q4	Pixel event_id 對應 journey 數量（找 0 個或多個）	NEW，DRAFT
Q5	Pixel 缺 event_id 的比例	NEW
Q6	START 連結的關聯欄位	NEW
Q7	單一 session 觸碰哪些資產	NEW
Q8	$197 對帳	NEW（獨立任務）
Q9	Stripe 與 Pixel 同 session 清單	OPTIONAL
sql
-- Q3  NEW — DRAFT — VERIFY SCHEMA FIRST（以你的已知 Stripe 樣本開始）
select sp.id as purchase_id, sp.token, sp.session_id, sp.video_id as direct_video_id, sp.created_at,
       e.id as checkout_event_id, e.created_at as checkout_at,
       ej.journey_id
from stripe_purchases sp
join events e on e.session_id = sp.session_id and e.event_type = 'checkout'
join redirect_links rl on rl.id = e.redirect_link_id and rl.token = sp.token
left join events_journey ej on ej.event_ids @> jsonb_build_array(e.id::text)
where sp.id = '992fbb1f-bc3b-4274-98d9-c18612863c82';
sql
-- Q4  NEW — DRAFT — 加組織與日期範圍，避免全表掃描
-- 0 = 沒有 journey；>1 = 模糊；兩者都會走直接歸屬
select pp.id, pp.event_type, pp.amount::numeric as amount, pp.event_id,
       count(distinct ej.journey_id) as distinct_journeys
from pixel_purchases pp
left join events_journey ej on ej.event_ids @> jsonb_build_array(pp.event_id::text)
where pp.organization_id = '<ORG_ID>'
  and pp.created_at >= '<START>' and pp.event_id is not null
group by pp.id, pp.event_type, pp.amount, pp.event_id
having count(distinct ej.journey_id) <> 1;
sql
-- Q5  NEW
select event_type, count(*) as total, count(*) filter (where event_id is null) as null_event_id
from pixel_purchases where organization_id = '<ORG_ID>' group by event_type;
sql
-- Q6  NEW — DRAFT（用你 log 裡兩個已知 START 連結）
select id, video_id, asset_id, promotion_id, campaign_id, organization_id, link_type, token
from redirect_links
where id in ('5b46bb05-69bd-4d4d-b46b-a35cefd6c205', '12443b85-68ef-4b6c-a6a8-ae68f95ffbab');
sql
-- Q7  NEW — 直接歸屬的資產是否有多個候選
select asset_id, video_id, count(*) as event_count
from events
where session_id = '5f5bc3f6-f08b-4517-b83d-fb618eb07a30' and asset_id is not null
group by asset_id, video_id;
sql
-- Q8  NEW — 獨立的 $197 對帳任務，不是架構的阻礙
select 'pixel' as src, id, event_type, amount::numeric as amount, video_id, asset_id,
       session_id, event_id, created_at
from pixel_purchases where amount::numeric = 197 and organization_id = '<ORG_ID>'
union all
select 'stripe', id, null, amount::numeric, video_id, null, session_id, null, created_at
from stripe_purchases where amount::numeric = 197 and organization_id = '<ORG_ID>'
order by created_at desc;
sql
-- Q9  OPTIONAL — 只在懷疑 Pixel 與 Stripe 重複時才用
select sp.id as stripe_id, pp.id as pixel_id, sp.session_id,
       sp.amount::numeric as stripe_amount, pp.amount::numeric as pixel_amount,
       sp.video_id as stripe_video, pp.video_id as pixel_video
from stripe_purchases sp
join pixel_purchases pp on pp.session_id = sp.session_id
where sp.organization_id = '<ORG_ID>';

已知可重用的 ID：

Stripe：992fbb1f-bc3b-4274-98d9-c18612863c82、journey 3fac8ee5-32de-484c-a219-010eb36d304a、START 影片 f7c0d6b4-09ce-4f86-b20b-9d41685a48e6、資產 4cf5135b-6c85-4f7d-aa82-bbd4efa70530。
Pixel：088470aa-9e4f-4ff3-bdf6-94c7a4a3a83a、event c8e74f44-07ff-4bc2-9847-33ca903f7f1d。
資產路徑 journey：9ff81ccc-15a3-4b5d-a7ff-dcd201eaf504。
10. 回歸與驗收測試矩陣
測試	目前證據	狀態
有效 TRUE START（Stripe）	992fbb1f log	通過（資料層級）
有效 TRUE START（Pixel，多步 journey）	無	待驗證
沒有 journey 證據 → 直接影片	程式碼確認（owner map 沒有該筆就走舊路徑）	程式碼層級通過；無資料案例
journey 模糊	程式碼確認走舊路徑	無資料案例
journey 無效或解析失敗	程式碼確認走舊路徑	無資料案例
Pixel 與 Stripe 來源篩選下 owner 一致	6-B 程式碼顯示不一致	已知失敗（程式碼層級）
一筆轉換不會出現在多個 owner 影片	AllAssets 有 owner 的購買：程式碼保證；無 owner 的購買：跨資產可能	部分
三頁 owner 一致	InDepth、Dashboard 無 attribution	已知失敗
direct 資產 owner 唯一	6-C 顯示可能多個	待驗證
同影片多個 promotion	無	待驗證
Campaign 營收歸屬	未檢視	待驗證
日期過濾一致	6-G 顯示不一致	已知失敗
組織隔離	有 owner 豁免	待你決定
點擊數獨立於營收歸屬	程式碼確認（owner map 只改購買，不碰 events）	通過（程式碼層級）
owner 關聯資料缺失	程式碼確認退回舊路徑	無資料案例
Pixel 與 Stripe 可能重複	去重只看 session 且依影片分組	待驗證（Q9）
11. 新對話交接說明

CURRENT STATE

Stripe 歸屬在資料層級已驗證（2 筆，992fbb1f 與預期一致）。
Pixel 接線已確認，執行期未驗證。
InDepth 與 Dashboard 繞過歸屬，且購買沒有日期過濾。
同一筆 Pixel 轉換的 owner 會隨 activeSource 改變（程式碼層級）。
結構點擊與營收歸屬是分離的。

DO NOT REPEAT

不要重跑 Q1、Q2。
不要再從頭分析 InDepth 與 Dashboard 為什麼沒有歸屬，已確認。
不要重新設計 attribution，或建立 analyticsEngine2。
不要把 $197 當成架構的阻礙。

DO NOT CHANGE

Scenario 1 與 Scenario 2 規則。
resolveJourneyStart 的 TRUE START 演算法。
Stripe 的 Layer 1、2。
結構點擊保持獨立。

OPEN DECISIONS（只有這些需要你的輸入）

direct 的資產 owner 政策（6-C 三個選項）。
resolved_path_only 與 hop_via_asset 是否算 TRUE START（目前都算）。
START 影片在 InDepth 與 Dashboard 範圍外時的處理。
有 owner 的購買是否可以跨組織可見。
Campaign Analytics 使用哪一種 campaign（可以延到 Phase 4）。

FIRST ACTION
在瀏覽器 console 查有沒有 [resolvePixelPurchaseJourneys] failed (legacy behaviour kept) 這行錯誤（重新整理 AllAssets 後搜尋 resolvePixelPurchaseJourneys）。這一步零成本，直接決定 Pixel 路徑是否真的在運作，也決定 Phase 1 要不要先修 getJourneysForEvent 的查詢格式。

IMPLEMENTATION ORDER
Phase 0 → 1 → 2 → 3 → 4 → 5。

FILES TO REQUEST（只列尚未檢視且下一步需要的）

Phase 0：orgAnalyticsFacts.ts、確認上傳的 Dashboard.tsx 是 pages/ 還是 lib/ 下的。
Phase 2 前：dashboardPageCache.ts、inDepthAnalyticsPageCache.ts、DashboardWidget.tsx、InDepthAnalyticsWidget.tsx。
Phase 3 前：promotionAnalyticsEngine.ts、getPromotionAnalytics.ts、getMarketerAnalytics.ts、getTopPromotionsAnalytics.ts、getTopMarketersAnalytics.ts、metricsForFactBag.ts、buildPromotionMetricRows.ts。
Phase 4 前：CampaignJourneyMap.tsx、Tree.tsx、journeyGraph.ts、attributeConversion.ts、resolveBridgeAttribution.ts、journeyAnalyticsEngine.ts。

assetAnalyticsEngine.ts、analyticsEngine.ts 與六個 attribution 檔案已在本對話中檢視過，但新對話看不到，所以新對話開始時仍需重新上傳它們（至少 getAssetAnalyticsRows.ts、assetAnalyticsEngine.ts、analyticsEngine.ts、resolveJourneyStart.ts、resolvePixelPurchaseJourneys.ts、journey.ts），或把本報告連同這些檔案一起貼入。