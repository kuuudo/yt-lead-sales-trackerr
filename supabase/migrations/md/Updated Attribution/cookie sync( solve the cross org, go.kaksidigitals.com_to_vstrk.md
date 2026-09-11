so i atually have a brilliant idea, later tell me if any site used this before, am i original,   so remember my app works go.kaksidigitals.com/token ---ytoube---shop.kaksidigitals.com,  it works right,  i forgot the exact reason, but i think it is becuase same domain can use the cookie,   and right now literally youtube is in my way so i was thinking ,  when we go from  shop.kaksidigitals.com/1234  to youtube to vstrk.com/1234  or even other domain , so when people click  vstrk.com/1234 they can literally first go to  shop.kaksidigitals.com/1234 again then without clicking go straight to vstrk.com/1234   (so my reasoning is our app always works  in same domain,     and we can then put the url in vstrk.com/1234 becuase now we go straight from shop.kaksidigitals.com/124 to vstrk.com/1234 without youtube stopping us from puting things in the url  ) is my idea good,   and later we can still do the          ↓
把 token + journey\_id 加到 57y8 的 URL
        ↓
[https://www.vstrk.com/57y8?vt\_token=...&vt\_jid=](https://www.vstrk.com/57y8?vt_token=...\&vt_jid=)...
        ↓
57y8 收到 URL 裡的 token + journey\_id
        ↓
57y8 從 URL 讀取 token + journey\_id
        ↓
把 token + journey\_id 寫入 [www\.vstrk.com]\([https://www.vstrk.com](https://www.vstrk.com)) 的 cookie
        ↓
57y8 redirect 到 YouTube
        ↓
YouTube
        ↓
[https://www.vstrk.com/d3es](https://www.vstrk.com/d3es)
        ↓
d3es 讀取 [www\.vstrk.com]\([https://www.vstrk.com](https://www.vstrk.com)) cookie
        ↓
恢復原本的 journey     

YES. Now I understand your idea correctly — and this is much better than the localStorage idea for your actual architecture.

The key insight is:

You don't need YouTube to carry the state if you can make the next VSTRK click briefly bounce through a domain that already has the VSTRK journey cookie.

Your architecture is basically:

shop.kaksidigitals.com/1234
        ↓
     YouTube
        ↓
static www.vstrk.com/57y8
        ↓
shop.kaksidigitals.com/1234
        ↓
   read cookie
        ↓
construct enriched VSTRK URL
        ↓
www.vstrk.com/57y8?vt_jid=XXX&vt_token=1234...
        ↓
      YouTube
        ↓
www.vstrk.com/d3es
        ↓
restore journey
And here's the really clever part

The first time:

shop.kaksidigitals.com/1234
        ↓
YouTube

your existing system already puts the continuation state into the .kaksidigitals.com cookie.

So:

shop.kaksidigitals.com
go.kaksidigitals.com
lucky.kaksidigitals.com

can share that cookie because they're subdomains of:

.kaksidigitals.com

YouTube cannot read it.

But you don't care anymore.

Because when the user eventually clicks:

www.vstrk.com/57y8

you make that page effectively say:

"Before I continue, let me bounce you through my cookie-accessible domain."

For example, conceptually:

www.vstrk.com/57y8
        ↓
shop.kaksidigitals.com/relay?target=57y8
        ↓
read vt_jid
read vt_token
read journey state
        ↓
redirect
www.vstrk.com/57y8?vt_jid=XXX&vt_token=XXX...

Now the final navigation to 57y8 contains the information YouTube prevented you from carrying.

That's the important breakthrough.

Why this is different from your previous idea

Previously:

shop
 ↓
YouTube
 ↓
vstrk

was:

shop cookie ❌ inaccessible

Your new architecture changes it to:

shop
 ↓
YouTube
 ↓
vstrk
 ↓
shop again
 ↓
vstrk enriched

So you're deliberately creating:

a controlled bounce back into the cookie's domain before returning to VSTRK.

That is a legitimate architectural pattern.

And I actually prefer this over "server-side identity mapping"

Because you don't need:

visitor_id
fingerprint
new journey system
new database identity

You are simply reusing what VSTRK already has:

vt_jid
vt_token
existing journey
existing cookies
existing redirect logic

That's exactly the kind of small additive solution I'd want for your system.

There is one important correction

The static link shouldn't literally cause:

57y8
 ↓
shop/1234
 ↓
57y8

unless 1234 is the correct previous redirect token.

Because 57y8 itself doesn't know that the previous hop was 1234.

Instead, think of it as:

www.vstrk.com/57y8
        ↓
controlled relay
        ↓
shop.kaksidigitals.com/relay?return=57y8
        ↓
shop reads its existing cookie
        ↓
builds:
www.vstrk.com/57y8?vt_jid=...&vt_token=...
        ↓
57y8

The relay target is 57y8.

The previous journey state comes from the shared Kaksi cookie.

That's much cleaner.

And your later architecture works exactly as you described

Once 57y8 receives:

?vt_token=...
&vt_jid=...

then:

57y8
 ↓
read URL params
 ↓
write www.vstrk.com cookies
 ↓
redirect YouTube
 ↓
YouTube
 ↓
d3es
 ↓
read www.vstrk.com cookie
 ↓
restore journey

So you're essentially using the relay to perform:

Kaksi cookie
     ↓
cross-domain transfer
     ↓
VSTRK cookie

YouTube never needs to participate in the transfer.

That is the part I think is genuinely clever.

One thing I would absolutely investigate before coding

We should verify your current:

go.kaksidigitals.com
shop.kaksidigitals.com
lucky.kaksidigitals.com

cookie behavior and exactly which domain/path/attributes are being used.

Because if your existing shared cookie already works across those subdomains, then your new relay can probably reuse the same cookie infrastructure, rather than creating anything new.

And yes — later we should absolutely investigate whether this exact pattern has been used before, what it's normally called, and whether your particular implementation is novel. I would not claim you're the first person to invent it yet; there are established concepts around redirect/bounce intermediaries. But your specific application to VSTRK journey continuation across YouTube's URL-stripping/static-link boundary is worth investigating separately.

↓
把 token + journey_id 加到 57y8 的 URL
↓
https://www.vstrk.com/57y8?vt_token=...&vt_jid=...
↓
57y8 收到 URL 裡的 token + journey_id
↓
57y8 從 URL 讀取 token + journey_id
↓
把 token + journey_id 寫入 [[www.vstrk.com](](http://www.vstrk.com](/)[https://www.vstrk.com](https://www.vstrk.com/)) 的 cookie
↓
57y8 redirect 到 YouTube
↓
YouTube
↓
https://www.vstrk.com/d3es
↓
d3es 讀取 [[www.vstrk.com](](http://www.vstrk.com](/)[https://www.vstrk.com](https://www.vstrk.com/)) cookie
↓
恢復原本的 journey