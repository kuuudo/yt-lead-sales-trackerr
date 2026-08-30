Step 0(強烈建議先做)— 存下這 35 筆的 id,作為 rollback 清單
sql
WITH null_links AS (
  SELECT id AS redirect_link_id, asset_id, created_at AS redirect_created_at
  FROM redirect_links
  WHERE promotion_id IS NULL AND asset_id IS NOT NULL
),
candidates AS (
  SELECT nl.redirect_link_id, p.id AS candidate_promotion_id, p.created_at AS candidate_promotion_created_at
  FROM null_links nl
  JOIN promotion_assets pa ON pa.asset_id = nl.asset_id
  JOIN promotions p ON p.id = pa.promotion_id
  JOIN assignment_collaborators ac ON ac.id = p.assignment_collaborator_id
  WHERE ac.status = 'active' AND p.created_at <= nl.redirect_created_at
),
counts AS (
  SELECT nl.redirect_link_id, COUNT(DISTINCT c.candidate_promotion_id) AS candidate_count
  FROM null_links nl LEFT JOIN candidates c ON c.redirect_link_id = nl.redirect_link_id
  GROUP BY nl.redirect_link_id
)
SELECT ARRAY_AGG(redirect_link_id) AS rollback_id_list
FROM counts
WHERE candidate_count >= 2;

把這個結果(一個 35 個 UUID 的陣列)複製貼到你自己的筆記裡。之後想復原就是:
| rollback_id_list                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ["104dd0e5-1d1a-47ad-8906-19bbf0b91c09","124fa8f6-24f0-422f-90ce-ca7783c0baf0","1b7f20af-594f-44ac-ae1b-4f480eb6e825","22086892-d7b1-47b0-a45f-570927cc16e6","2b916509-3ae6-4347-9f60-51c8eeed70b5","3216cbb5-0a07-4e58-8060-4d6088fcc823","3448ce67-98da-4c49-be70-fbed866dbd8f","355a3f6d-ef04-4c6b-ba57-c6cb7af9171b","389c8e59-3085-4003-9044-f6c1b0b72783","4ce1d96a-b036-4aae-b946-23a58e99b750","54893100-0bf9-4988-9588-bfe5af03fc67","5df47f6e-055f-4ebd-ba18-47ffdaa20efd","5f46da36-5523-44b0-8c95-456c250b1e45","66d2aa68-c790-4f82-a085-6abcc59cecf7","6b333198-f2a7-4257-b1e1-4781c3723a9c","8ae10b25-b0b0-4ae6-b5cf-38f23fdb27b5","902cc14c-890d-46ee-a2d8-90a5a5bbdb70","910e2ff1-c4ec-4141-b90e-f73636fc7d1c","97af170d-e157-49ea-ba41-63308cf5f4c6","9c9a7ba8-2ce8-4dbb-b3bc-98a29e7c83ff","aa6b40ac-79c4-427a-b0be-512f8b7d091d","b67dd3ec-13fa-4511-9364-7bf648fe5def","bfc7a016-1bf5-4e76-9082-fa69ab711836","cf857748-c9fb-447d-8015-0493c8878592","d290045f-d9c4-4e56-9cab-40cf21b905fc","d5f450be-c5fe-4bed-af1c-d683e835ce95","da104456-1eb5-482c-a33a-eede75cd0c68","e77e0693-ac63-4d05-b38b-aa3a6a726440","eb7053a8-8826-45c3-bff5-6393f48a80b6","ebffd9a2-04f0-4d92-9a50-ec454cda7524","ec83e43a-b75f-4235-918a-22ac746e7cb8","ed51fbbc-3f91-42a8-86d3-cee011376153","edc81b08-0943-4371-8c16-dc26bca30397","f663c423-a42e-409d-bfa3-08310cd52be4","fadf328d-08a2-48dc-a040-0922685aa3cd"] |


-----------------------------------------------

sql
-- ROLLBACK(需要時才跑)
UPDATE redirect_links
SET promotion_id = NULL
WHERE id = ANY(ARRAY['貼上你存的 35 個 id']::uuid[]);
Step 1 — Preview SQL
sql
WITH null_links AS (
  SELECT id AS redirect_link_id, asset_id, video_id, created_at AS redirect_created_at
  FROM redirect_links
  WHERE promotion_id IS NULL AND asset_id IS NOT NULL
),
candidates AS (
  SELECT
    nl.redirect_link_id,
    nl.asset_id,
    nl.video_id,
    nl.redirect_created_at,
    p.id AS candidate_promotion_id,
    p.created_at AS candidate_promotion_created_at
  FROM null_links nl
  JOIN promotion_assets pa ON pa.asset_id = nl.asset_id
  JOIN promotions p ON p.id = pa.promotion_id
  JOIN assignment_collaborators ac ON ac.id = p.assignment_collaborator_id
  WHERE ac.status = 'active'
    AND p.created_at <= nl.redirect_created_at
),
ranked AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY redirect_link_id
      ORDER BY candidate_promotion_created_at DESC, candidate_promotion_id DESC
    ) AS rn,
    COUNT(*) OVER (PARTITION BY redirect_link_id) AS candidate_count
  FROM candidates
),
agg_candidates AS (
  SELECT
    redirect_link_id,
    ARRAY_AGG(candidate_promotion_id ORDER BY candidate_promotion_created_at DESC, candidate_promotion_id DESC)
      AS all_candidate_promotion_ids
  FROM candidates
  GROUP BY redirect_link_id
)
SELECT
  r.redirect_link_id,
  r.asset_id,
  r.video_id,
  r.redirect_created_at,
  r.candidate_count,
  ac2.all_candidate_promotion_ids,
  r.candidate_promotion_id        AS proposed_promotion_id,
  r.candidate_promotion_created_at AS proposed_promotion_created_at
FROM ranked r
JOIN agg_candidates ac2 ON ac2.redirect_link_id = r.redirect_link_id
WHERE r.rn = 1
  AND r.candidate_count >= 2
ORDER BY r.redirect_created_at DESC;

排序邏輯完全照你要的:candidate_promotion_created_at DESC, candidate_promotion_id DESC,rn = 1 取排序後第一個當 proposed_promotion_id。candidate_count >= 2 確保只有你確認過的那 35 筆會出現。跑完先確認回傳筆數 = 35,再往下一步。

Step 2 — Backfill UPDATE(在你確認 Preview = 35 筆之後才跑)
sql
WITH null_links AS (
  SELECT id AS redirect_link_id, asset_id, created_at AS redirect_created_at
  FROM redirect_links
  WHERE promotion_id IS NULL AND asset_id IS NOT NULL
),
candidates AS (
  SELECT
    nl.redirect_link_id,
    p.id AS candidate_promotion_id,
    p.created_at AS candidate_promotion_created_at
  FROM null_links nl
  JOIN promotion_assets pa ON pa.asset_id = nl.asset_id
  JOIN promotions p ON p.id = pa.promotion_id
  JOIN assignment_collaborators ac ON ac.id = p.assignment_collaborator_id
  WHERE ac.status = 'active'
    AND p.created_at <= nl.redirect_created_at
),
ranked AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY redirect_link_id
      ORDER BY candidate_promotion_created_at DESC, candidate_promotion_id DESC
    ) AS rn,
    COUNT(*) OVER (PARTITION BY redirect_link_id) AS candidate_count
  FROM candidates
),
to_update AS (
  SELECT redirect_link_id, candidate_promotion_id AS proposed_promotion_id
  FROM ranked
  WHERE rn = 1 AND candidate_count >= 2
)
UPDATE redirect_links rl
SET promotion_id = tu.proposed_promotion_id
FROM to_update tu
WHERE rl.id = tu.redirect_link_id
  AND rl.promotion_id IS NULL
  AND rl.asset_id IS NOT NULL;

這條的 WHERE rl.promotion_id IS NULL AND rl.asset_id IS NOT NULL 是雙重保險——即使 to_update CTE 算出來的清單有誤,這兩個條件仍然會擋掉任何非 NULL 或 asset_id IS NULL 的 row,不會被誤更新。跑完後 Postgres 會回報 UPDATE 35,務必先確認這個數字剛好是 35,不是就先別繼續。

Step 3 — 驗證 SQL

A. 確認這 35 筆已經全部脫離 NULL:

sql
-- 重新跑一次分類,理論上這次 "2+ candidates" 這組應該完全消失(0 筆或查無),
-- 因為它們已經不再符合 null_links 的條件(promotion_id 不再是 NULL)
WITH null_links AS (
  SELECT id AS redirect_link_id, asset_id, created_at AS redirect_created_at
  FROM redirect_links
  WHERE promotion_id IS NULL AND asset_id IS NOT NULL
),
candidates AS (
  SELECT nl.redirect_link_id, p.id AS candidate_promotion_id
  FROM null_links nl
  JOIN promotion_assets pa ON pa.asset_id = nl.asset_id
  JOIN promotions p ON p.id = pa.promotion_id
  JOIN assignment_collaborators ac ON ac.id = p.assignment_collaborator_id
  WHERE ac.status = 'active' AND p.created_at <= nl.redirect_created_at
),
counts AS (
  SELECT nl.redirect_link_id, COUNT(DISTINCT c.candidate_promotion_id) AS candidate_count
  FROM null_links nl LEFT JOIN candidates c ON c.redirect_link_id = nl.redirect_link_id
  GROUP BY nl.redirect_link_id
)
SELECT
  CASE WHEN candidate_count = 0 THEN '0 candidates'
       WHEN candidate_count = 1 THEN '1 candidate'
       ELSE '2+ candidates' END AS classification,
  COUNT(*) AS row_count
FROM counts
GROUP BY 1
ORDER BY 1;

預期結果:0 candidates = 28(不變)、1 candidate = 46(不變)、2+ candidates 這一列應該完全消失(不再有任何 row 落在這個分類,因為它們的 promotion_id 已經不是 NULL 了)。 如果 0 candidates 或 1 candidate 的數字跟原本不一樣,代表這次 UPDATE 動到了不該動的 row,要立刻停下來檢查,不要繼續往 Analytics 頁面確認。

B. 直接鎖定原本那 35 個 id,確認每一筆都有值(用 Step 0 存的清單):

sql
SELECT
  COUNT(*) AS total_targeted,
  COUNT(*) FILTER (WHERE promotion_id IS NOT NULL) AS now_filled,
  COUNT(*) FILTER (WHERE promotion_id IS NULL) AS still_null
FROM redirect_links
WHERE id = ANY(ARRAY['貼上你 Step 0 存的 35 個 id']::uuid[]);

預期:total_targeted = 35、now_filled = 35、still_null = 0。

三步都跑完、A/B 兩個驗證都符合預期之後,再去 Promotion Analytics 頁面看問題是否消失。如果消失了,先不要急著把這個當成最終結論——因為這 35 筆填的值本身就不是可驗證的歷史真相,只能證明「NULL 這個現象本身會造成 Analytics 異常」,不能證明「這個特定的 promotion 分配是正確的」。等你確認完現象,記得把 Step 0 存的 id 清單留著,診斷結束後可以決定要不要用 ROLLBACK 那條 SQL 把這 35 筆退回 NULL、換一個更長期的方案(例如你之前提過的、真正要求使用者選擇的 UI 流程)。

SELECT
  COUNT(*) AS total_targeted,
  COUNT(*) FILTER (WHERE promotion_id IS NOT NULL) AS now_filled,
  COUNT(*) FILTER (WHERE promotion_id IS NULL) AS still_null
FROM redirect_links
WHERE id = ANY(ARRAY[
  '104dd0e5-1d1a-47ad-8906-19bbf0b91c09',
  '124fa8f6-24f0-422f-90ce-ca7783c0baf0',
  '1b7f20af-594f-44ac-ae1b-4f480eb6e825',
  '22086892-d7b1-47b0-a45f-570927cc16e6',
  '2b916509-3ae6-4347-9f60-51c8eeed70b5',
  '3216cbb5-0a07-4e58-8060-4d6088fcc823',
  '3448ce67-98da-4c49-be70-fbed866dbd8f',
  '355a3f6d-ef04-4c6b-ba57-c6cb7af9171b',
  '389c8e59-3085-4003-9044-f6c1b0b72783',
  '4ce1d96a-b036-4aae-b946-23a58e99b750',
  '54893100-0bf9-4988-9588-bfe5af03fc67',
  '5df47f6e-055f-4ebd-ba18-47ffdaa20efd',
  '5f46da36-5523-44b0-8c95-456c250b1e45',
  '66d2aa68-c790-4f82-a085-6abcc59cecf7',
  '6b333198-f2a7-4257-b1e1-4781c3723a9c',
  '8ae10b25-b0b0-4ae6-b5cf-38f23fdb27b5',
  '902cc14c-890d-46ee-a2d8-90a5a5bbdb70',
  '910e2ff1-c4ec-4141-b90e-f73636fc7d1c',
  '97af170d-e157-49ea-ba41-63308cf5f4c6',
  '9c9a7ba8-2ce8-4dbb-b3bc-98a29e7c83ff',
  'aa6b40ac-79c4-427a-b0be-512f8b7d091d',
  'b67dd3ec-13fa-4511-9364-7bf648fe5def',
  'bfc7a016-1bf5-4e76-9082-fa69ab711836',
  'cf857748-c9fb-447d-8015-0493c8878592',
  'd290045f-d9c4-4e56-9cab-40cf21b905fc',
  'd5f450be-c5fe-4bed-af1c-d683e835ce95',
  'da104456-1eb5-482c-a33a-eede75cd0c68',
  'e77e0693-ac63-4d05-b38b-aa3a6a726440',
  'eb7053a8-8826-45c3-bff5-6393f48a80b6',
  'ebffd9a2-04f0-4d92-9a50-ec454cda7524',
  'ec83e43a-b75f-4235-918a-22ac746e7cb8',
  'ed51fbbc-3f91-42a8-86d3-cee011376153',
  'edc81b08-0943-4371-8c16-dc26bca30397',
  'f663c423-a42e-409d-bfa3-08310cd52be4',
  'fadf328d-08a2-48dc-a040-0922685aa3cd'
]::uuid[]);

| total_targeted | now_filled | still_null |
| -------------- | ---------- | ---------- |
| 35             | 35         | 0          |


not doen yet

剩下 NULL：28 筆沒有 candidate、46 筆只有 1 candidate