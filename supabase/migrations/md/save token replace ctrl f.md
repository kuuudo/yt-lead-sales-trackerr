Use Surgical Patch Mode.

然後附：

Find the exact target with Ctrl+F / exact string. Make the smallest possible change. Do not rewrite or regenerate the file. Use an exact replacement. Then run a diff and confirm only the intended lines changed.



3. 更重要的是：Claude 這次到底做了什麼？

這個其實是你問的最有價值的地方。

你以前的 workflow 是：

「Claude，這個檔案很大，請不要亂改。Ctrl+F 找 X，貼附近 50 行給我。」

這叫我們一直說的：

Caveman Mode / surgical investigation

它很好，但現在 Claude 示範了一個更進階的版本。

以前

假設 Videos.tsx 有 2,000 行。

你叫 Claude：

改這一行。

Claude 很容易做成：

讀整個檔案
↓
理解整個檔案
↓
重新產生整個檔案
↓
回傳 2,000 行

這就很浪費。

這次 Claude 做的是另一種模式

它知道：

我只需要改：

disabled={saving || hasBlockingPromotionIssue}

成：

disabled={saving || resolvingPromotionContext || hasBlockingPromotionIssue}

所以它做：

找 exact string
       ↓
surgical replacement
       ↓
diff
       ↓
確認只有 1 行 changed
       ↓
輸出 patched file

這個關鍵詞就是：

Surgical Edit

更精確一點可以叫：

Surgical / Minimal Patch

或者：

Targeted Edit + Diff Verification
4. 這可以取代你的 Caveman Mode 嗎？

我會說：不要完全取代。

而是升級成：

Caveman Mode → Surgical Patch Mode

你的舊方法仍然非常有用，尤其是：

你不知道程式在哪
需要 investigation
不想讓 Claude 自己猜
大型架構修改
需要先看證據

這時候：

Ctrl+F
→ 找 keyword
→ 看附近 code
→ 給 Claude
→ Claude 分析

仍然是最安全的方法。

但是當你已經知道 exact line / exact change，就不要再叫 Claude 重寫整個檔案。

改成：

Surgical Patch Mode
5. 你以後可以直接對 Claude 說這個 Buzzword

我建議你建立一個固定 phrase：

Use Surgical Patch Mode.

然後附：

Find the exact target with Ctrl+F / exact string. Make the smallest possible change. Do not rewrite or regenerate the file. Use an exact replacement. Then run a diff and confirm only the intended lines changed.

這基本上就是你這次 Claude 做的事情。

你甚至可以建立你的新 workflow：

CAVEMAN MODE
= Investigation

SURGICAL PATCH MODE
= Known exact fix

DIFF VERIFICATION
= Safety check
6. 我會把你的 workflow 升級成這樣

以後我們不要一直「全部丟給 Claude」。

Phase A — Investigation

Caveman Mode

Ctrl+F
↓
找到關鍵詞
↓
貼附近 code
↓
Claude trace architecture
Phase B — Decision

我們先確認：

PASS / FAIL

然後決定最小修正。

Phase C — Implementation

Surgical Patch Mode

exact target
↓
exact replacement
↓
NO rewrite
↓
NO refactor
↓
diff
↓
confirm changed lines
Phase D — Verification

Claude 回報：

File changed: X

Old:
...

New:
...

Diff:
1 line changed

No other files changed.
Phase E — Lock the decision

如果這是一個重要 architecture decision：

.md

把它記下來。

下一次：

Read this architecture decision first. Treat it as locked. Do not re-investigate unless code contradicts it.