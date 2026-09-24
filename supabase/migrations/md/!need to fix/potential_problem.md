我沒有改任何程式碼。這次讀了你新給的檔案(設計文件 8、舊的 types 和 columns),也回頭追了頁面裡的身分解析,有幾個結果會改變前一輪的計畫。

1. 舊 Grok 檔案:不是純歷史,已經在用了
目前頁面已經從 analytics-lego/assetAnalyticsTypes 和 assetAnalyticsColumns 匯入東西,所以這兩個檔案已經是運作中的 LEGO,不是要不要沿用的問題。
assetAnalyticsColumns.ts(欄位清單、預設顯示、排序捷徑)跟目前行為一致,可以保留,而且直接沿用 analyticsEngine 的 TABLE_COLUMNS,符合單一來源。
assetAnalyticsTypes.ts 你給我的這份比頁面實際用到的舊:頁面的列裡有 content_owner_marketer_name、created_via_creative、creative_promotion_id、creative_promotion_title、element_type,型別檔沒有,頁面是靠轉型帶過去。第一步先讓型別檔跟現況一致。
allassetanalytic_splitpt1_3243-3103.md 你沒有上傳,我沒讀到,先不影響計畫。
設計文件 8 有幾處已經過時:寫「14 欄只有 total_revenue 有值」和「processVideoMetrics 不能直接用」,這兩點現在已經解決了。但「營收真相/重複計算模型:尚未開始」仍然成立。
2. Marketer 身分:設計文件跟你這次的描述有出入
你貼的欄位(assignment_id, user_id, invitation_id, status, joined_at)是 assignment_collaborators 的欄位,不是 assignments。頁面裡 assignments 查的是 id, created_by_user_id, organization_id,created_by_user_id 是贊助者。
設計文件(標記為已鎖定的資料模型)寫的鏈是:Sponsor = promotions.owner_user_id;Marketer = promotions.assignment_collaborator_id → assignment_collaborators.user_id → profiles。
所以應該是「Marketer = assignment_collaborators.user_id,經由 promotion 連到」,不是 assignments.user_id。你的業務描述沒錯,只是欄位名稱說成了另一張表。
頁面現在的「Content Owner / Content Marketer」是 videos.user_id(影片建立者),在 creative 模式下顯示名稱換成贊助者、另存 content_owner_marketer_name。它多半等於行銷人員,但不是同一個定義,兩者可能不一致。
建議:每一筆事實的 marketer 依 promotion_id → promotions.assignment_collaborator_id → assignment_collaborators.user_id 決定;content_owner_id 只留作顯示,不當聚合 key。
3. 現有 Promotion 分組的風險

頁面把每一列的 promotion_id 設成 promotionIds[0],也就是只取第一個。一個(asset, 影片)配對如果對到多個 promotion,其他的被丟掉。設計文件也標示 Promotion 篩選「正確性未證實,不可簽核」,而且歷史資料裡有 redirect_links.promotion_id 為空的紀錄。

所以 Promotion 聚合是整個計畫最脆弱的一環。分組 key 必須來自事實本身標的 promotion_id,空的進「未歸屬」桶,不能靠這個只取第一個的欄位。

4. 旅程貢獻與跨 Promotion:不要當成「誰得功勞」

建議把指標分三類,各自有明確規則:

事實類(可加總): 點擊、Thank You 次數、營收。依標的 promotion 歸屬,去重後相加。這是現在已有的。
旅程進展類(不可加總): 用 events_journey 算。每個 marketer 統計「他的內容參與過的旅程」的 A→B、A→B→C、A→B→C→D 各有幾條,以及走到結果(Thank You)的有幾條。單位是 journey_id 的去重數,不是金額。
參與營收(標示為參與,不是功勞): 完整追蹤到營收的旅程,營收顯示給每一位參與的 marketer,標明「參與旅程的營收」。

關鍵規則:第 2、3 類不能跨 marketer 相加成總數(同一條旅程會出現在多位 marketer 名下),所以組織總數要從去重後的旅程或事實算,不是把各 marketer 的列加起來。這樣就能同時呈現 A→B 的價值,又不會重複記帳。

5. 每個東西的單一來源
項目	單一來源
營收/點擊/RPC 公式	analyticsEngine.ts 的 processVideoMetrics
聚合後的 RPC	同上(aggregateCampaignMetrics 是第二份,之後併入)
link 類型對照	一份共用對照表(現在有三份)
Marketer 身分	assignment_collaborators.user_id(經 promotion)
Promotion 歸屬	事實上標的 promotion_id
旅程貢獻	events_journey
分組聚合	新的分組層,從去重事實出發
欄位、篩選、排序	共用 view 層
6. 最終計畫

現在不要動: 公式、CLICK_EVENT_MAP、mapLinkTypeToRevenueType、pixel 的 15% 歸屬、computeAssetMetrics(直到 Asset Clicks 欄搬走)、InDepth、旅程圖、redirect_links.promotion_id 的歷史資料。

新對話第一階段,一次一塊,每塊都驗證:

建立快照基準(見下)。
讓 assetAnalyticsTypes.ts 跟現況一致(只補欄位)。
把 hook 裡的身分解析(owners、sponsors、creative、assignment 標題)搬成獨立 service,行為完全不變。順手移除 hook 裡寫死影片 id 的除錯 console.log(我看到約 470 到 490 行)。
篩選與排序抽成純函式。
toTableMetrics、Webmood 搬進共用 view 層。
事實加上 id(選填,不改行為)。
link 類型對照表放一份,resolver 與頁面改用它。

驗證方式: 動手前固定日期範圍,三種來源各存一份快照:每一列的(asset_id, video_id, 14 欄、Asset Clicks、content_owner、promotion_id)。每搬一塊重新產生,逐格比對,有差就退回。另加一個對帳:所有列加起來加未歸屬,要等於原始資料筆數。

PromotionAnalytics: 分組函式 groupFacts(facts, key=promotion_id),依 id 去重後呼叫 processVideoMetrics,空的 promotion 進「未歸屬」。之前必須先證明「promotion → asset → 影片 → 事實」這條鏈(設計文件 G 節要求的)。

MarketerAnalytics: 同一個 groupFacts,key 換成 assignment_collaborators.user_id。旅程進展與參與營收用第 4 點的第 2、3 類,獨立成欄位群組,標示不可跨人加總。

7. 我需要的東西

現在已經存在的第二條分析路徑我沒看過,它們正是最可能出現重複公式的地方:getTopPromotionsAnalytics.ts(含 getPromotionLevelMetricsForOrg)、TopMarketers/TopPromotions 的 service、promotionAnalyticsEngine.ts、campaignElementAnalyticsEngine.ts、journeyAnalyticsEngine.ts。新對話開始前請一併上傳,不然聚合層可能又多出一套平行公式。