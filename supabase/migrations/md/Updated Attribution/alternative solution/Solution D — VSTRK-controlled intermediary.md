🥈 Solution C — Server-side intermediary

例如：

B
 ↓
VSTRK
 ↓
server records identity
 ↓
YouTube
 ↓
static VSTRK URL
 ↓
VSTRK
 ↓
resolve identity
 ↓
C

這個可以做。

但問題是：

使用者從 YouTube 回來時，server 怎麼知道這個人就是剛才 B 的那個人？

你還是需要某種 browser-carried identifier。

所以最後往往還是會回到：

cookie
URL parameter
some browser storage

之一。

🥉 Solution D — VSTRK-controlled intermediary

這個也可以。

例如：

YouTube
   ↓
store.kaksidigitals.com/uONR
   ↓
VSTRK resolves something
   ↓
C

但是如果 uONR 是完全 static，而且沒有任何 browser identity 可以拿來 lookup：

uONR → ??? → which journey?

問題還是存在。

所以它本身不是魔法解決方案。