A3. 兩個和 Team 無關、但收費前必須處理的嚴重問題

1. organization_members 的 INSERT policy 只檢查 user_id = auth.uid()，沒有限制 organization_id 和 role。 這表示任何登入者理論上可以把自己加進任何 organization，並把 role 設成 owner。而幾乎所有業務表的 policy 都信任這張表，所以一旦成立，就是跨租戶的完整讀寫。要知道目標 org 的 UUID，而 redirect_links 是公開可讀且帶 organization_id，所以這個值不難取得。這是我從 policy 文字推論的，請你用兩個一般測試帳號實際驗證。

A3. 兩個和 Team 無關、但收費前必須處理的嚴重問題

1. organization_members 的 INSERT policy 只檢查 user_id = auth.uid()，沒有限制 organization_id 和 role。 這表示任何登入者理論上可以把自己加進任何 organization，並把 role 設成 owner。而幾乎所有業務表的 policy 都信任這張表，所以一旦成立，就是跨租戶的完整讀寫。要知道目標 org 的 UUID，而 redirect_links 是公開可讀且帶 organization_id，所以這個值不難取得。這是我從 policy 文字推論的，請你用兩個一般測試帳號實際驗證。