---
title: "How to Track Affiliate Sales and Results From Every Marketer, Influencer, or Partner"
seo_title: "Track Affiliate Sales With Partner Tracking Links | VSTRK"
description: "Give every affiliate, influencer, or marketer their own tracking link, then compare clicks, leads, and revenue by person across platforms."
status: published
primary_keyword: "track affiliate sales"
card_summary: "Give each marketer, creator, or partner an individual tracking link, then compare the clicks, leads, bookings, and revenue each person generates."
related: []
---

<!-- EDITOR NOTES (delete before publishing): (1) Price ($15 USD per week) was confirmed by the founder; the 3-day free trial with no credit card required appears on the VSTRK landing page. (2) The nine-platform list (Instagram, X, YouTube, LinkedIn, Facebook, Reddit, TikTok, Threads, Twitch) was confirmed by the founder; the landing page source names eight of them and does not name Twitch. (3) This article intentionally does NOT state which attribution model VSTRK uses or how credit is split when several promoters touch one customer. Add that only after it is confirmed. (4) Stripe is described only as "supports Stripe integration" plus the founder-confirmed point that newsletter signups are not counted as paid revenue; refund, subscription and delayed-payment handling are intentionally not described. (5) External references were not all re-fetched in this session; re-check the Google, Modash, Upfluence, Cometly and FTC links before publishing. (6) /2x was confirmed as linkable by the founder; the hiring use-case page under /m/use-cases/ is still listed as a draft, so it is not linked here. (7) This file replaces the placeholder content at /m/features/partner-tracking-links/; confirm the renderer drops the page's noindex tag when status is published. -->

# How to Track Affiliate Sales and Results From Every Marketer, Influencer, or Partner

To track affiliate sales by person, give every affiliate, influencer, marketer, or partner their own tracking link to the same destination, record what visitors do after they click, and connect each lead, booking, purchase, and payment back to the link that sent the visitor. Without a separate link per person, every visit looks the same, and you can't tell who deserves credit.

This guide is for business owners, founders, and marketing leads who already have, or are about to have, several people promoting the same sales page, product page, video, or offer. It explains why one shared link stops working, how individual tracking links work, how to read the results, and four practical scenarios: comparing marketers on one sales page, measuring purchases and revenue, handing a successful video to other promoters, and understanding customer journeys that cross platforms. We make VSTRK, so one section describes how its partner tracking links work. Everything before it is useful whichever tool you use.

## What are partner tracking links?

A partner tracking link is a unique URL given to one person (an affiliate, influencer, creator, agency, teammate, or other promoter) that leads to a destination you want promoted. When someone clicks it, the click is recorded against that person. If the visitor later becomes a lead, books a call, or buys, that outcome can be connected back to the same link.

The destination can be almost anything you want visitors to reach:

- A sales page or landing page
- A product or checkout page
- A consultation or sales-call booking page
- A newsletter signup page
- A video or post you want other people to promote

The promoter then shares the link wherever they publish: TikTok, Instagram, YouTube, Facebook, LinkedIn, X, Reddit, Threads, Twitch, a newsletter, or anywhere else a link can be placed. You can then compare what each person's promotion produced.

The important word is *produced*. Counting clicks is the easy part. The useful question is which people send visitors who become leads, bookings, customers, and revenue.

## Why one shared link is not enough

Imagine you give nine marketers the same URL. Traffic arrives, and a few people book calls. Which marketer sent them? You can't tell from the link, because the link is identical for everyone.

When people share one generic URL, you lose the ability to distinguish:

- **Which marketer generated a visit.** The visit has no owner.
- **Which partner generated a conversion.** A booking or purchase can't be traced to a person.
- **Which channel performed better.** You can't compare a marketer's YouTube results with another's Instagram results.
- **Which promotion produced revenue.** High traffic and high sales can come from different people, and you can't see the difference.

You can fall back on platform dashboards, but each platform reports its own views and engagement, and none of them reports what happened on your website afterward.

### How the common approaches differ

There are several ways to give each person an identifiable link. They solve different parts of the problem.

| Approach | What it identifies | Where it works well | Where it falls short |
|---|---|---|---|
| UTM parameters on a shared URL | A source, medium, campaign, and optional content label you choose | Free, works anywhere, readable in web analytics | Only as good as your naming discipline; you still need to connect it to leads and revenue |
| A generic short link | Where a click came from, if you make one per person | Easy to share; shows click counts | Often stops at clicks and doesn't show what visitors did next |
| An affiliate network link | A specific affiliate within a network's program | Built for running affiliate programs at scale | Tied to the network's setup, terms, and onboarding |
| A promo code | The person whose code was used at checkout | Works even when the link is lost or the sale happens elsewhere | Doesn't show where the shopper came from, and codes get shared |
| An individual tracking link | A specific person (and, if you set it up that way, a specific piece of content) | Connects each person's clicks to later conversions and revenue | Needs setup, and no tracking method sees every customer |

UTM parameters are worth understanding even if you use a dedicated tool, because the same logic sits underneath most link tracking. Google's documentation says the source, medium, and campaign parameters should always be included and that their values are case sensitive, so `TikTok` and `tiktok` appear as separate rows in reports ([Google Analytics Help](https://support.google.com/analytics/answer/10917952)). Inconsistent naming is one of the most common ways partner data gets split into pieces nobody can read.

Each method also has known weak points. Guides on affiliate tracking from Modash point out, for example, that UTM-based tracking can lose the connection when a person returns through another channel, switches devices, or clears cookies, and that promo codes show who drove a sale but not where the shopper came from ([Modash](https://www.modash.io/blog/affiliate-conversion-tracking)). Combining an individual link with a promo code is a common way to cover both gaps.

## How partner tracking links work

Whatever tool you use, the mechanics follow the same steps:

1. **Choose the destination.** Decide what you want promoted: a sales page, a product page, a booking page, or a video.
2. **Create a separate link for each promoter.** Each link points to the same destination but carries an identifier for one person.
3. **Share the links.** Each promoter gets only their own link, along with a short brief: what to promote, any rules, and how you will measure results.
4. **Promoters publish.** They place the link in their content or profile, on the platforms they choose.
5. **Record the click.** When a visitor clicks, the system notes which link was used.
6. **Record the outcome.** A signup, lead, booking, purchase, or payment is recorded as a conversion.
7. **Connect the outcome to the link.** Results are grouped by link, so you can compare people.

A simple identifier in a URL might look like this:

```
https://example.com/book?utm_source=tiktok&utm_medium=partner&utm_campaign=spring-launch&utm_content=marketer-a
```

A dedicated tracking tool usually generates this kind of identifier for you, often behind a shorter link, so promoters don't have to build URLs by hand.

### The numbers to look at

Once results are separated by person, a few simple measures do most of the work:

- **Clicks:** how many people followed the link.
- **Conversion rate:** conversions divided by clicks. It shows how well a person's visitors went on to act.
- **Revenue per click:** revenue divided by clicks. Upfluence's help documentation uses the same idea under the name earnings per click, alongside conversion rate, as a way to compare creators ([Upfluence Help Center](https://help.upfluence.co/en/articles/8685313-how-to-use-a-single-link-to-track-both-sales-and-traffic)).
- **Average order value:** revenue divided by purchases. Two partners can bring the same number of customers and very different revenue.
- **Revenue per person:** the total attributable to each promoter over the period you're measuring.

Keep leads, bookings, and purchases separate. A newsletter signup, a booked consultation, and a paid order are different outcomes, and mixing them into one "conversions" number hides which people bring you the outcome you care about.

## Track every marketer separately across platforms

### Scenario A: Several marketers promote the same sales page

Suppose a company has one sales page for consultations and gives nine marketers their own tracking links. Each promotes the same page, on whichever platform suits them. The table below shows three of them.

**Illustrative example. These are hypothetical numbers, not data from any real account or VSTRK customer.**

| Marketer | Promotion | Clicks | Bookings | Conversion rate |
|---|---|---|---|---|
| Marketer A | 10 TikTok videos | 10 | 5 | 50% |
| Marketer B | 9 YouTube videos | 40 | 20 | 50% |
| Marketer C | Instagram | 25 | 8 | 32% |

What the business can learn from this:

- **Clicks measure reach to your page, not quality.** Marketer B sent four times as many visitors as Marketer A.
- **Bookings show who produces meaningful outcomes.** B produced the most bookings in total.
- **Conversion rate shows traffic quality.** A and B converted the same share of visitors. C converted fewer, which could mean the audience is less ready to book, or that the content promised something the page didn't deliver.
- **Small numbers need caution.** Ten clicks is too few to conclude that TikTok visitors convert better than Instagram visitors. Treat early results as signals, and keep collecting data before you reward or drop anyone.

The same table should also make you ask about **how each person promotes**. Marketer A sent only ten clicks from ten videos. That may point to a weak call to action, a placement problem (such as a link that is hard to find), or simply a small audience. A good comparison leads to questions you can ask the marketer, not just a ranking.

### One link per marketer is not one link per video

There is a technical distinction that matters here. If a marketer uses a single link across ten TikTok videos, that link can identify the marketer's overall results. It does not automatically tell you which of the ten videos produced each conversion, because every click arrives through the same link.

If you want to compare individual posts or videos, each one needs its own identifier: a separate link, or a separate content label such as the `utm_content` value in the example above. This works in two layers:

1. **A link (or label) per person**, so you can compare marketers.
2. **A link (or label) per piece of content**, so you can compare posts and videos within a marketer's work.

The second layer costs a little more setup, so decide in advance whether you need it. For a short test with a new marketer, per-person links are usually enough. When you're deciding which of a proven marketer's videos deserve more promotion, per-content links are worth it. Either way, name things consistently, such as `marketer-a-tiktok-video-04`, so the data stays readable.

## Track more than clicks: leads, bookings, and revenue

### Scenario B: Direct purchases and revenue

Now suppose the business wants to know not only who generated clicks but who generated purchases and revenue. It shares its product purchase page with three marketers, each with their own link.

**Illustrative example. These are hypothetical numbers, not data from any real account or VSTRK customer.**

| Marketer | Clicks | Purchases | Conversion rate | Revenue | Revenue per click |
|---|---|---|---|---|---|
| Marketer A | 100 | 8 | 8% | $800 | $8.00 |
| Marketer B | 200 | 5 | 2.5% | $500 | $2.50 |
| Marketer C | 80 | 12 | 15% | $1,200 | $15.00 |

Read the table from left to right and the story changes at each column:

- **By clicks alone,** Marketer B looks like the winner with 200.
- **By purchases,** Marketer C leads with 12, despite sending the fewest visitors.
- **By conversion rate,** C converts 15% of its visitors, against 2.5% for B.
- **By revenue,** C earned $1,200, more than twice B's $500.

The person generating the most traffic isn't always the person generating the most revenue. Traffic is an input. Revenue is the result you're paying for. A business that rewarded or scaled up promoters by click count would put its effort behind the weakest performer in this example.

In this table every purchase is $100, so revenue follows purchases. In real data it often doesn't. Cometly's guidance on affiliate tracking makes the point that an affiliate bringing many low-value customers can deliver less revenue than one bringing fewer customers who spend more, which is why tracking revenue and average order value per affiliate, not just conversions, matters ([Cometly](https://www.cometly.com/post/tracking-affiliate-marketing-performance)).

### Connecting payment data

The revenue column is only trustworthy if it comes from real payment records. A click counter can tell you someone visited. It can't tell you what they paid. To report revenue by promoter, a tracking tool has to connect to your payment processor (Stripe, for example) so that a payment can be matched to the visit and link that preceded it.

Two practical rules help here:

- **Keep the outcomes separate.** Leads, newsletter signups, consultations, and sales calls are valuable, but they are not paid revenue. Count paid revenue only from actual payments, and report the other outcomes next to it.
- **Check how your tool treats edge cases.** Before you base decisions or payments on revenue numbers, find out how the tool handles refunds, subscriptions, repeat purchases, and payments that happen days after the click.

## Turn your best-performing content into a promotion asset

### Scenario C: Hand a proven video to other promoters

A creator, business owner, or marketer often already has a video that works. It has produced sales page visits, consultation bookings, leads, or direct purchases. The obvious next question is whether other people could help promote it.

Here is how that can work without losing visibility:

1. **Pick the winner.** Look at what the video has already produced, using results you've tracked rather than views.
2. **Treat it as a promotion asset.** The video, or the page it leads to, becomes something other people are invited to promote.
3. **Give each promoter their own tracking link.** Each person promotes the same asset through their own posts, and each link identifies who sent the traffic.
4. **Compare the promoters** using the same measures as before: clicks, leads, bookings, purchases, revenue.

Expanding distribution this way doesn't mean giving up visibility. Without individual links, more promoters means more traffic you can't explain. With them, every new promoter is another row in the comparison.

Be clear about what is shared. The video itself is shared by whatever means you normally use to share creative material. VSTRK does not host or distribute video files. It provides the tracking links that identify who is promoting. Agree beforehand what promoters may do with the material: repost it as is, remix it, add commentary, or only link to it. Make sure they disclose the relationship where the law requires it. In the United States, the FTC's guidance for social media influencers explains when a connection with a brand needs to be disclosed ([FTC](https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers)).

This is also a sound way to evaluate marketers you're thinking of hiring: give several candidates the same asset and compare measurable outcomes. We cover that approach in [a real-product challenge for marketing candidates](/2x).

## Understand cross-platform customer journeys

### Scenario D: When the customer touches several platforms

Few customers see one post and buy. A more realistic path:

**X → TikTok → YouTube → Sales page → Stripe purchase**

A person first notices a product in an X post. Days later they see it again in a TikTok video. Then they watch a longer YouTube video and, finally, open the sales page and pay.

If you only look at the last click, the YouTube video receives all the credit, and the X post and TikTok video that introduced the product look like they did nothing. If you only look at one platform, you see a fragment of the story and may cancel the part that started it.

### Tracking touchpoints is not the same as assigning credit

Two different questions are easy to confuse:

- **Tracking:** which touchpoints did the system record on the way to the purchase?
- **Attribution:** which of those touchpoints, and which promoters, receive credit for the conversion or the revenue?

You can track many touchpoints and still credit only one. Common approaches in the industry include:

- **First touch:** credit goes to the first recorded interaction.
- **Last touch:** credit goes to the final interaction before the conversion.
- **Shared credit (multi-touch):** credit is divided among several touchpoints by some rule.

None of these is universally correct. First touch rewards whoever introduces the customer. Last touch rewards whoever closes. Shared models spread credit but require rules you must be able to explain. Different tools use different defaults, and the same journey can produce a different report depending on the rule.

This matters most when more than one promoter appears in a single customer's path. Before you pay anyone based on tracked results, decide how you will credit partners when a journey includes several of them, write it into your partner agreement, and check how your tracking tool reports multi-step journeys. Don't assume that every touchpoint, or every marketer, automatically receives full credit for a sale.

### What journey tracking can and can't see

Even with good setup, tracking has limits:

- **A touchpoint only appears if it carried a tracking link.** An untracked post can't be counted, however much it influenced the buyer.
- **People who never click.** Someone may see a video, search for your name later, and buy. Link tracking can't tie that purchase to the video.
- **Devices and browsers.** A person who watches on a phone and buys on a laptop can break the chain unless an identifier is carried across. No tracking method guarantees perfect cross-device, cross-browser, or identity-level tracking.
- **Delays.** Larger purchases and consultations can close weeks after the first interaction, so review results over a longer window than a few days.

A "how did you hear about us?" question at checkout or booking is a cheap way to catch some of the journeys links miss.

## Common mistakes when managing multiple marketers

1. **Sharing one link with everyone.** It's the problem this guide opens with, and it makes comparison impossible.
2. **Judging by clicks or views.** Traffic and attention are not results. Look at leads, bookings, purchases, and revenue.
3. **Mixing up outcomes.** A newsletter signup, a booked call, and a payment are not the same thing. Report them separately.
4. **Using one link for everything a marketer publishes** when you want to compare posts. It identifies the person, not the post.
5. **Inconsistent naming.** `Marketer-A`, `marketer_a`, and `MarketerA` become three rows.
6. **Drawing conclusions from tiny samples.** A handful of clicks is a signal, not a verdict.
7. **Not testing the link.** Click each link on a phone, inside the app where it will be posted, and confirm the visit and conversion are recorded.
8. **Skipping the rules.** If you haven't agreed how credit is assigned, payouts and relationships suffer when a journey involves several promoters.
9. **Ignoring partner quality.** High revenue with high refunds or unhappy customers isn't a win. Look beyond the first sale where you can.

## Best practices for managing partner tracking

- **Decide the goal of each promotion first.** A promotion meant to build your newsletter should be judged by signups, not sales.
- **Give each person a separate link, and keep a simple register** of who has which link and what it points to.
- **Write a naming convention** for people, platforms, and content, and use it every time.
- **Add per-content links where you need post-level answers,** and stay with per-person links where you don't.
- **Compare on rates and revenue, not raw counts.** Use conversion rate, revenue per click, and revenue per person next to volume.
- **Review on a schedule,** weekly or monthly, with enough data for each person before you act on it.
- **Combine tracked links with other signals,** such as promo codes or a "how did you hear about us?" question.
- **Set the credit rules before the first sale.** Put in writing how you'll treat journeys that include more than one promoter.
- **Require disclosure.** Partners should disclose material connections to your brand in line with the rules where they publish.
- **Use the results to coach, not just rank.** The best use of a comparison is learning what the strongest promoters do differently.

## How VSTRK partner tracking links work

VSTRK is a tracking tool for content and promotion. Here is what its partner tracking links do, based on VSTRK's product description.

- **A link for each piece of content or promoter.** You paste a content URL and get a tracking link, which you place in your post description or wherever viewers can click. For promotion by others, you can turn a sales page, newsletter, consultation, or direct purchase link into an asset and share it with marketers. VSTRK also supports a branded tracking domain: you can share an address such as `go.yourdomain.com` with your promoters, and they can generate unique links like `go.yourdomain.com/1234` to promote your products.
- **Nine platforms.** VSTRK tracks content on Instagram, X, YouTube, LinkedIn, Facebook, Reddit, TikTok, Threads, and Twitch. TikTok tracking is link-based: it relies on viewers clicking a tracking link, not on access to TikTok's internal analytics.
- **More than clicks.** VSTRK records clicks and conversion events such as newsletter signups, leads, consultations, sales calls, and purchases.
- **Stripe revenue.** VSTRK supports Stripe integration, so payment and revenue data can be connected to your tracking data. Newsletter signups are tracked as conversions but are not counted as paid revenue.
- **Compare people.** Each promoter has their own promotion and link, so you can compare people by results such as revenue rather than views.
- **Journeys across platforms and domains.** You can connect pieces of content into a journey, including branches, and see clicks, conversions, and conversion rates at each step. A journey can also cross from one domain to another, including your own subdomains.
- **Content shared with others.** A video that works can be turned into an asset, with new content created by you or by others to promote it, so you can see the network of content behind a result, not just one link.
- **Teams and clients.** You can add team members or clients and see their content, clicks, leads, and revenue.

Here is what to keep in mind:

- VSTRK does not host or distribute your video files. It tracks the links that promote them.
- It does not replace your payment system, CRM, analytics platform, or an affiliate network.
- A touchpoint only appears in a journey if it passed through a tracking link, and no tracking method is perfect across devices, browsers, or people who never click.
- This article describes measurement. How you credit promoters when several of them appear in one customer's journey is a business rule you should set and document yourself.

## Frequently asked questions

### How do I track affiliate sales by individual affiliate?

Give each affiliate their own tracking link to the same destination, record what visitors do after clicking, and connect leads, bookings, purchases, and revenue back to the link. Then compare affiliates on conversion rate and revenue per click, not just clicks.

### How can I track sales from influencers?

The same way: one link per influencer, ideally combined with a promo code to catch sales that lose the link. Compare influencers on purchases and revenue instead of views or likes.

### What is the difference between a tracking link and an affiliate link?

An affiliate link identifies an affiliate, usually inside a network or program, and is often tied to commission rules. A tracking link identifies who sent a visitor. The two can be the same URL, but a tracking link doesn't by itself define commissions or payouts.

### Why not just use UTM parameters?

You can. UTM links are free and work on any platform. The limits are manual naming, the need to connect them to conversions and revenue yourself, and the fact that campaign data can be lost when people switch devices or channels.

### Can I track which individual video led to a sale?

Only if each video has its own identifier. A single link used across many videos identifies the person but not the video. In VSTRK each piece of content gets its own tracking link, so it can show results per content when each video carries its own link.

### Does every promoter in a customer's journey get credit for the sale?

Not automatically. Tracking records the touchpoints, and attribution is the rule that decides who gets credit. Define your own rule before you pay partners, and check how your tool reports journeys with more than one promoter.

### Can I track revenue, not just clicks?

Yes, if your tracking tool connects to your payment records. VSTRK supports Stripe integration. Keep paid revenue separate from other outcomes such as newsletter signups and consultations.

### Can I see how customers move across platforms?

You can see the touchpoints that carried tracking links. VSTRK lets you connect content across platforms, and across domains, into one journey. Perfect cross-device or identity-level tracking isn't something any link-based method can promise.

### Does VSTRK host the videos my promoters share?

No. VSTRK doesn't host or distribute video files. You share the video through your own channels, and VSTRK's tracking links identify who promotes it.

### Which platforms does VSTRK support?

Instagram, X, YouTube, LinkedIn, Facebook, Reddit, TikTok, Threads, and Twitch.

### Does VSTRK replace my affiliate network, CRM, or analytics tool?

No. It focuses on tracking and measuring who produces results from your content and promotions. You may still use your payment system, CRM, analytics, and other tools alongside it.

### What does VSTRK cost?

VSTRK offers a 3-day free trial with no credit card required. The weekly plan is $15 USD per week.

## Conclusion

When several people promote the same page, the link is the thing that keeps their results apart. Give each person their own, record what happens after the click, and connect outcomes and revenue back to the link. Then compare on conversion rate, revenue per click, and revenue per person, not on traffic alone.

The four scenarios fit together. You can compare marketers on one sales page (A), look past clicks to purchases and revenue (B), expand the reach of a proven video without losing sight of who delivers (C), and understand that customers often cross several platforms before they buy (D). Along the way, be precise about what your tracking can and can't see, and decide in writing how credit is shared when more than one promoter is involved.

### Give every marketer their own link with VSTRK

VSTRK is useful for businesses that work with several marketers, creators, influencers, or partners and want to know which of them produces leads, bookings, purchases, and revenue. You can give each promoter an individual tracking link, follow results across nine platforms, connect Stripe payments to your tracking data, and compare people by outcomes instead of views.

Try it on your next promotion: pick one page or video, create a link for each person promoting it, and see what each of them produces. [Start your 3-day free trial with VSTRK](https://vstrk.com/start). No credit card is required, and the weekly plan is $15 USD per week.

## Related topics

- [How to track TikTok videos to revenue](/m/guides/track-tiktok-video-to-revenue/)
- [A real-product challenge for marketing candidates](/2x)

## References

1. [Google Analytics Help: URL builders, collect campaign data with custom URLs](https://support.google.com/analytics/answer/10917952)
2. [Modash: How affiliate conversion tracking works](https://www.modash.io/blog/affiliate-conversion-tracking)
3. [Modash: How to track affiliate sales](https://www.modash.io/blog/how-to-track-affiliate-sales)
4. [Upfluence Help Center: How to use a single link to track both sales and traffic](https://help.upfluence.co/en/articles/8685313-how-to-use-a-single-link-to-track-both-sales-and-traffic)
5. [Cometly: How to track affiliate marketing performance](https://www.cometly.com/post/tracking-affiliate-marketing-performance)
6. [Federal Trade Commission: Disclosures 101 for social media influencers](https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers)
7. [VSTRK](https://vstrk.com/)