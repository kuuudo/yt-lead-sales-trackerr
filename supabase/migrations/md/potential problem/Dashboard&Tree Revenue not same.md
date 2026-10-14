結論先講
兩邊數字不一致是預期會發生的：它們不是同一套加總維度。



































Tree (campaignMonthlySnapshots)Dashboard (analyticsEngine + canonical owners)主要用途每個 Campaign 一張月／期間快照每個 Video 的營運報表Campaign 怎麼算進去只看 purchase 列上的 campaign_id先找「屬於這個 Campaign 的 videos」，再把該影片的 engine 指標加總campaign_id 為 null不計入任何 Campaign（已寫死 if (!campaignId) continue）只要 video 有 campaign，仍可能算進該 CampaignRevenueFormal paid（amount > 0 的 formal 列）Hybrid Total（Stripe + Pixel，engine 規則）Purchases / Newsletter / Calls主要靠 purchase 的 link_type / event_type主要靠 purchase_thankyou、newsletter_thankyou、call_booking_thankyou 等 engine 欄位（含事件路徑）
所以：同一 Campaign + All Time，Tree 的 $3,697 / 26 / 10 / 46 / 21 和 Dashboard 的 $3,981.4 / 16 / 10 / 9 不必相等——不是單純 bug，是兩套算法。

為什麼對不上（對應你兩組截圖）
1. Campaign 歸屬鍵不同（最大原因）
Tree（你貼的 computeCampaignMonthMetrics）：
TypeScriptconst campaignId = (p.campaign_id as string | null) ?? null;
if (!campaignId) continue;  // null → 整筆丟掉
Dashboard：選 Campaign → 過濾 videos.campaign_id === selected → 用 canonical video_id 跑 getAnalyticsEngine → 加總那些影片的列。
因此會出現：

purchase 的 campaign_id = A，但 TRUE START 把 revenue 掛到 另一支影片（可能 campaign B 或 null）→ Tree 算 A，Dashboard 算影片所屬 campaign
purchase campaign_id null，但 video 屬於該 campaign → Tree 不算，Dashboard 可能算
反過來：purchase 有 campaign_id，影片已換 campaign / 已刪 → Tree 仍算，Dashboard 可能不算

這直接解釋 Revenue 和各計數同時偏掉，不是只差一點四捨五入。
2. 「Purchases / Newsletter / Sales Calls」定義不同






























指標TreeDashboard 卡片Direct PurchasesStripe offer（+ amount>0）+ Pixel event_type=purchasepurchase_thankyou（engine）NewsletterPixel newsletter 筆數newsletter_thankyouSales CallsPixel sales_call（Stripe sales_call 刻意不加 booking 計數）call_booking_thankyouConsultationsStripe consultation + Pixel consultation表上 Consultations 欄，KPI 卡片沒有對等的一張
所以你會看到 Tree Newsletter 46 vs Dashboard 10——一邊在數 pixel newsletter 列，一邊在數 thankyou／engine 轉換，本來就不是同一個東西。
3. Revenue 組成不同

Tree：formal paid only；註解寫明 不加 estimated call EV；Newsletter 通常 amount=0 不進 revenue。
Dashboard Total (Hybrid)：engine 的 hybrid，可能含不同 Pixel／Stripe 合併方式，且是 影片加總 再 campaign 過濾。

$3,697 vs $3,981.4、$1,796 vs $3,439.4 量級差，符合「不同列集合 + 不同加總鍵」，不是顯示 bug。
4. Snapshot 快取
Tree 是 snapshot-first（getOrRefreshCampaignMonthMetrics）。沒按 Update 時可能還是舊 provisional。Dashboard 是當次 fetch + page cache。比對前請在 Tree 按一次 Update 再比。

campaign_id 為 null 要不要算？
Tree 現況：不算——符合你說的「null 不該進某個 Campaign」。
Dashboard 現況：可能算——因為是「影片屬於這個 Campaign」，不是「purchase.campaign_id = 這個 Campaign」。
若產品規則是：
只有 purchase（或 last-entry link）上明確有 campaign_id 的 conversion 才進該 Campaign
那 Tree 的 null 排除是對的；Dashboard 若也要同一規則，就要改成依 formal conversion 的 campaign 關聯 加總，而不是只靠 video.campaign_id。
若產品規則是：
這個 Campaign 底下所有影片的營運數字（Dashboard 式）
那 Dashboard 是對的；Tree 用 purchase.campaign_id 就會少算／錯算。

該以誰為 Source of Truth？
依你們整條 Canonical Attribution 主線（All Assets / InDepth / Dashboard / Partner）：
營運與「同一筆 formal conversion」的真相 → Dashboard / analyticsEngine + resolveConversionOwners。
Tree 的 campaignMonthlySnapshots 應是：
同一套 formal 資格與分類規則，只多一層 Campaign 彙總
而不是另一套獨立定義。
實務建議：

Video 級、Hybrid、Leaderboard → 繼續以 Dashboard 為準。
Tree 的 Campaign 五指標 → 應對齊 formal conversion 集合，並把 Campaign 歸屬規則寫死成一條（建議與你已確認的一致）：
有 purchase.campaign_id（或 engine 已解析的 campaign）→ 進該 Campaign
campaign_id null → 不進任何 Campaign 卡片（可另做「Unassigned」若需要）

計數名稱要對齊：若 Tree 的「Purchases」要等於 Dashboard「Direct Purchases」，必須用 同一套 thankyou／event_type 定義，不能一邊 link_type、一邊 thankyou 還期望相等。

目前 兩邊都不該被說成「錯了」——是產品上還沒強制「Campaign 報表 = Dashboard 的 rollup」。數字對不齊是 設計落差，不是單一顯示錯誤。

建議對齊順序（若要修）

鎖定 Campaign 歸屬：只用 formal conversion 上的 campaign（purchase / last-entry），null 不進 Campaign。
Tree 的五個計數改為與 processVideoMetrics / Dashboard KPI 同一分支（或直接從 engine 輸出再按 campaign 分組）。
Tree Revenue = 同一 formal paid 集合按 campaign 加總（與 monthly ranking total 一致）。
Dashboard 若要顯示「Campaign 合計」，也改讀同一 rollup，避免再各算各的。

在改程式前需要你拍板的只有一句：
Campaign 報表要以「purchase/conversion 上的 campaign_id」為準，還是以「影片所屬 campaign」為準？
你之前的方向（null 不算、membership 不是功勞）偏向 前者 → 以修 Tree／共用 rollup 去對齊 formal rules 為主，而不是把 Tree 硬改成現在的 Dashboard 影片加總。
我這邊沒跑你的 DB；上表是依你提供的 Tree、Dashboard、campaignMonthlySnapshots 原始碼對照。若要實作對齊，指定採用哪一種 Campaign 歸屬後再改最小 patch 即可。