---
title: "How to Track TikTok Videos to Revenue"
seo_title: "How to Track TikTok Videos to Revenue: Methods and Tools | VSTRK"
description: "Learn how to connect each TikTok video to leads, calls and sales, and compare the tools that track TikTok to revenue, from single-platform to all-platform."
status: published
primary_keyword: "track tiktok video to revenue"
card_summary: "Connect each TikTok video to leads, calls and sales, and see how the tracking tools compare."
related:
  - features/partner-tracking-links
  - tools/utm-link-builder
  - compare/bitly-alternative-for-lead-tracking
---

<!-- EDITOR NOTES (delete before publishing): (1) VSTRK's nine-platform coverage, conversion tracking, Stripe revenue integration, partner tracking links, 3-day free trial and weekly pricing should be checked against the current live product and pricing pages before publishing. Confirm the exact nine-platform list and any limitations of Stripe revenue attribution. (2) Competitor details come from each vendor's public pages in November 2026. Re-check before publishing. (3) Confirm TikTok's current link-in-bio rules on the TikTok Support Center page linked below. -->

A TikTok video can reach 200,000 people and earn you almost nothing, while a video with 4,000 views can fill your calendar with consultations. TikTok's analytics show you who watched. For sales that happen on your own website, they generally stop at the moment someone taps your link.

That gap is why views and engagement make poor business metrics on their own. Clicks are not leads. Leads are not customers. Traffic is not revenue. To know which videos pay for themselves, you have to follow the viewer after the click.

This guide explains how that tracking works in plain terms, walks through four ways to do it, and compares nine tools that can help, including ours. We make VSTRK, so we say where each tool fits, including where a different tool is the better choice, and we mark anything we could not confirm as unverified.

## What does it mean to track TikTok videos to revenue?

It means you can answer four questions for each individual video:

1. How many people clicked through to your site?
2. How many of them became leads, such as newsletter subscribers, lead magnet downloads, booked consultations or booked sales calls?
3. How many became paying customers?
4. How much money did those customers pay?

The technical word for connecting an outcome back to the video that started it is attribution. Revenue attribution adds the last step: the actual dollars, not just the count of signups.

Notice what is not on that list. Views, likes, shares and follower growth all matter for reach, but none of them tells you whether a video produced a customer.

## How TikTok-to-revenue tracking works

The mechanics are simpler than most guides make them. Every approach follows the same five steps:

1. **Give each video its own tagged link.** The tag records which video the click came from.
2. **Put the link where viewers can click it.** That is usually your profile, since TikTok captions do not make links clickable.
3. **Send viewers to a page with one clear next step,** such as a signup form, a booking page or a checkout.
4. **Record what the visitor does there.** A signup, a booking and a purchase are all conversion events.
5. **Connect each event back to the tagged link,** including the revenue from any purchase.

The tag in step one is usually a set of UTM parameters added to the end of a URL. Here is what a tagged link for one video might look like:

```
https://example.com/templates?utm_source=tiktok&utm_medium=social&utm_campaign=spring-templates&utm_content=invoice-mistakes
```

Google's documentation says the source, medium and campaign parameters should always be included, and that values are case sensitive, so `tiktok` and `TikTok` show up as separate rows in reports. Pick a naming convention and keep it. Our [UTM Link Builder](/m/tools/utm-link-builder/) is a free way to generate consistent links.

Two TikTok-specific details are worth knowing. First, profiles typically allow one clickable website link, and which accounts can add it has changed over time, so check TikTok's [current requirements](https://support.tiktok.com/en/getting-started/setting-up-your-profile/linking-another-social-media-account). Second, links opened inside TikTok often open in its in-app browser. TikTok's own ads help says that browser can keep Google Analytics from logging the correct referral channel, and Matomo notes that organic TikTok visits may show up as direct traffic without campaign parameters. A tagged link is the fix, and testing it before you post is cheap insurance.

## A worked example (illustrative numbers)

All numbers in this section are made up to show how the pieces fit together. They are not data from VSTRK customers or from any real account.

Imagine a small business that sells a $49 invoice template and a $150 bookkeeping consultation. It posts three TikTok videos, each with its own tagged link, and tracks what happens over 30 days.

<div class="table-wrap">
<table class="cmp">
<thead><tr><th scope="col">Video</th><th scope="col">Views</th><th scope="col">Clicks</th><th scope="col">Newsletter signups</th><th scope="col">Consultations booked</th><th scope="col">Template sales</th><th scope="col">Revenue</th></tr></thead>
<tbody>
<tr><td>Video 1: three spreadsheet shortcuts</td><td>210,000</td><td>640</td><td>31</td><td>0</td><td>3</td><td>$147</td></tr>
<tr><td>Video 2: invoice mistakes that cost you money</td><td>38,000</td><td>290</td><td>44</td><td>3</td><td>6</td><td>$594</td></tr>
<tr><td>Video 3: tax season checklist</td><td>95,000</td><td>410</td><td>58</td><td>1</td><td>9</td><td>$441</td></tr>
</tbody>
</table>
</div>

Video 2's revenue is $294 from six template sales plus $300 from two paid consultations. Video 3's one booked consultation has not paid yet, so it adds nothing to revenue so far.

Looking only at views, Video 1 wins by a wide margin. Looking at revenue, it comes last. Video 1 earned about $0.23 per click. Video 3 earned about $1.08 per click. Video 2, the smallest video by reach, earned about $2.05 per click and produced most of the booked consultations. That is the kind of insight views alone can never give you, and it changes what you make next.

## Four ways to track TikTok videos

### UTM-tagged links

The lowest-cost option is to tag your links with UTM parameters and read the results in a web analytics tool such as Google Analytics. It costs nothing, and it works for any platform. The limits: you need a separate link per video, TikTok's single bio link makes that awkward, and web analytics tools report sessions and events by default. Getting from a session to revenue per video takes extra setup.

### Link-in-bio tools and link shorteners

Link-in-bio pages and link shorteners put several destinations behind one profile link and count clicks on each. They are good at answering which link people tapped. Most stop there: they report clicks, not what the visitor did next. If you want a deeper comparison of what a link shortener does and does not measure, see our [comparison of Bitly and deeper lead tracking](/m/compare/bitly-alternative-for-lead-tracking/).

### Landing pages and unique tracking links

A dedicated landing page per video or campaign makes the source obvious, since anyone who lands there came from that video. Unique tracking links go a step further: each video, or each person promoting you, gets a link that identifies exactly who sent the visitor. If other people promote your products, [partner tracking links](/m/features/partner-tracking-links/) let you measure what each one produces instead of guessing.

### Analytics and attribution platforms

Attribution platforms record conversion events, connect them to the visitor who clicked, and report results by source. They differ widely in what they were built for, which is the subject of the next section.

## Tools for tracking TikTok videos to revenue

The tools below solve different problems. Some measure public video performance, some are built around one platform, some are link or affiliate tools, and some connect to a CRM. We grouped them by job. The details come from each vendor's own public pages as of November 2026. Where a page did not mention a feature, we say so rather than assume it is missing, so confirm anything important with the vendor.

### Short-form video performance analytics

**[Shortimize](https://www.shortimize.com/)** tracks the public performance of short-form videos from accounts you add, across TikTok, Instagram Reels, YouTube Shorts and a few other platforms. Its dashboards cover views, engagement and follower growth, and it offers alerts, an API and webhooks, with syncing to analytics tools such as Amplitude, Mixpanel and PostHog. The pages we reviewed do not describe link tracking, leads or revenue attribution, so it answers a different question: how your videos, or other creators' videos, are performing as content.

### Web analytics with revenue attribution

**[DataFast](https://datafa.st/)** is a web analytics tool for entrepreneurs that focuses on which marketing channels bring in revenue. It supports custom goals such as signups and lead magnet downloads, connects to payment tools including Stripe, LemonSqueezy, Polar and Shopify, and maps visitor journeys across subdomains and domains. Its homepage does not name TikTok, YouTube or Instagram as supported sources, and it does not describe partner links. In practice, you would likely tag your TikTok links yourself and read the results by channel. Plans are listed from $9 per month.

### YouTube-focused attribution

**[FunnelYT](https://www.funnelyt.nl/)** was launched, according to its maker's launch post, to track leads from individual YouTube videos and show per-video conversion rates. Its homepage also describes a broader platform for building funnels and pages. If your content lives on YouTube, that focus is a strength. If you also post on TikTok, it will not cover that half of your content.

**[Primal Video's tracking platform](https://resource.primalvideo.com/)** is attribution software for YouTube. Its page says it ties clicks, leads, sales and revenue to the videos that drove them, supports affiliate links tracked as smart links, and integrates with several email platforms. The pages we reviewed mention only YouTube. Plans are listed from $37 per month.

If YouTube is the only platform you publish on, a specialized tool like these can be all you need.

### Link tracking and affiliate attribution

**[qklnk](https://qklnk.cc/)** is a link management tool that generates short links with UTM parameters and tracks clicks. Paid plans add conversion and revenue attribution, including first-touch, last-touch and position-based models, and the top tier lists full-journey tracking. There is a free plan with a monthly link limit. Its pages do not name TikTok specifically, but because it works from links it can sit in front of any platform that lets you post one.

**[Revshare](https://www.revshare.so/)** is affiliate software for running affiliate programs, with branded influencer links, one-click Stripe setup, cross-domain tracking and multi-touch attribution. It can also track conversions from sources that are not part of an affiliate program. TikTok appears only in its sample dashboard, so check how it handles organic TikTok before relying on it. Its homepage lists a program from $5 per month.

### CRM-based attribution

**[LeadJourney](https://leadjourney.io/)** is a tracking and attribution platform for lead-generation businesses. It records clicks on your own domain, matches them to records in your CRM and reports leads, pipeline and won revenue. It has a dedicated TikTok integration page describing bio links and video links reported per video, along with pages for YouTube, Instagram and LinkedIn, and it lists call tracking and Calendly and Cal.com appointments. It is strongest when your sales process runs through a CRM.

**[Cometly](https://www.cometly.com/)** focuses on attributing paid advertising. It connects ad touchpoints to CRM events and revenue, works with payment tools such as Stripe, Paddle and Chargebee, and sends conversion data back to ad platforms. Its pages describe organic tracking only lightly, so it is a better fit when most of your growth comes from paid ads than when you are tracking organic TikTok videos.

### All-platform content tracking

**[VSTRK](https://vstrk.com/)** tracks content across nine platforms and helps answer one important question: which videos and posts actually generate leads, customers and revenue? You paste a content URL, generate a tracking link, and place it in your content description or wherever viewers can click it. VSTRK tracks the results, including clicks, newsletter signups, consultations, sales calls and purchases.

VSTRK also supports Stripe integration, allowing you to connect actual payment and revenue data to your content tracking. This goes beyond counting clicks or recording that someone submitted a form: it helps you understand which content contributes to paying customers and sales.

Another key feature is cross-platform customer journey tracking. Someone might discover your business through TikTok, watch a YouTube video later, and eventually become a customer. VSTRK helps connect those content interactions into a broader journey.

You can also create unique tracking links for partners, affiliates or other people promoting your content, products or offers, so you can measure the results each person generates.

TikTok tracking in VSTRK is link-based: it relies on viewers clicking a tracking link you have placed, rather than claiming native access to TikTok's internal analytics.

VSTRK offers a 3-day free trial, with its weekly plan priced at $17 USD per week. You can try it with your own content and see how your tracking results look before deciding whether it fits your workflow.

## How the tools compare

The three tables below summarize what each vendor's public pages say. Use this legend:

- **✓** means the vendor's pages describe the capability.
- **✗** means the vendor describes the product as limited to a different platform. We used it only for FunnelYT.
- **Unverified** means we did not find enough evidence either way. It does not mean the tool lacks the feature.

VSTRK's entries reflect VSTRK's own product page. Competitor entries reflect their public pages in November 2026.

**Table A: Platform coverage**

<div class="table-wrap">
<table class="cmp">
<thead><tr><th scope="col">Tool</th><th scope="col">TikTok</th><th scope="col">YouTube</th><th scope="col">Instagram</th><th scope="col">Multi-platform</th></tr></thead>
<tbody>
<tr><td>Shortimize</td><td>✓</td><td>✓ (Shorts)</td><td>✓ (Reels)</td><td>✓</td></tr>
<tr><td>DataFast</td><td>Unverified</td><td>Unverified</td><td>Unverified</td><td>Unverified</td></tr>
<tr><td>FunnelYT</td><td>✗</td><td>✓</td><td>✗</td><td>✗</td></tr>
<tr><td>Primal Video</td><td>Unverified</td><td>✓</td><td>Unverified</td><td>Unverified</td></tr>
<tr><td>qklnk</td><td>Unverified</td><td>Unverified</td><td>Unverified</td><td>✓</td></tr>
<tr><td>Revshare</td><td>Unverified</td><td>Unverified</td><td>Unverified</td><td>Unverified</td></tr>
<tr><td>LeadJourney</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr>
<tr><td>Cometly</td><td>✓ (ads)</td><td>✓ (ads)</td><td>Unverified</td><td>✓</td></tr>
<tr><td><strong>VSTRK</strong></td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr>
</tbody>
</table>
</div>

Link-based tools such as qklnk and Revshare work with any platform where you can place a link, which is why their platform cells say Unverified rather than no. Shortimize's coverage is for public video performance, not conversions.

**Table B: What gets tracked after the click**

<div class="table-wrap">
<table class="cmp">
<thead><tr><th scope="col">Tool</th><th scope="col">Per-video or per-link tracking</th><th scope="col">Leads</th><th scope="col">Newsletter signups</th><th scope="col">Consultations</th><th scope="col">Sales calls</th></tr></thead>
<tbody>
<tr><td>Shortimize</td><td>Unverified</td><td>Unverified</td><td>Unverified</td><td>Unverified</td><td>Unverified</td></tr>
<tr><td>DataFast</td><td>Unverified</td><td>✓</td><td>Unverified</td><td>Unverified</td><td>Unverified</td></tr>
<tr><td>FunnelYT</td><td>✓</td><td>✓</td><td>Unverified</td><td>Unverified</td><td>Unverified</td></tr>
<tr><td>Primal Video</td><td>✓</td><td>✓</td><td>Unverified</td><td>Unverified</td><td>Unverified</td></tr>
<tr><td>qklnk</td><td>✓</td><td>Unverified</td><td>Unverified</td><td>Unverified</td><td>Unverified</td></tr>
<tr><td>Revshare</td><td>✓</td><td>✓</td><td>Unverified</td><td>Unverified</td><td>Unverified</td></tr>
<tr><td>LeadJourney</td><td>✓</td><td>✓</td><td>Unverified</td><td>✓</td><td>✓</td></tr>
<tr><td>Cometly</td><td>Unverified</td><td>✓</td><td>Unverified</td><td>Unverified</td><td>Unverified</td></tr>
<tr><td><strong>VSTRK</strong></td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr>
</tbody>
</table>
</div>

**Table C: Revenue, journeys and partners**

<div class="table-wrap">
<table class="cmp">
<thead><tr><th scope="col">Tool</th><th scope="col">Purchases and revenue</th><th scope="col">Stripe integration</th><th scope="col">Cross-platform customer journeys</th><th scope="col">Partner or affiliate tracking links</th></tr></thead>
<tbody>
<tr><td>Shortimize</td><td>Unverified</td><td>Unverified</td><td>Unverified</td><td>Unverified</td></tr>
<tr><td>DataFast</td><td>✓</td><td>✓</td><td>✓</td><td>Unverified</td></tr>
<tr><td>FunnelYT</td><td>Unverified</td><td>Unverified</td><td>✗</td><td>Unverified</td></tr>
<tr><td>Primal Video</td><td>✓</td><td>Unverified</td><td>Unverified</td><td>✓</td></tr>
<tr><td>qklnk</td><td>✓</td><td>Unverified</td><td>✓</td><td>Unverified</td></tr>
<tr><td>Revshare</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr>
<tr><td>LeadJourney</td><td>✓</td><td>Unverified</td><td>✓</td><td>Unverified</td></tr>
<tr><td>Cometly</td><td>✓</td><td>✓</td><td>✓</td><td>Unverified</td></tr>
<tr><td><strong>VSTRK</strong></td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr>
</tbody>
</table>
</div>

A few notes on reading these tables. LeadJourney's pages describe affiliate-network reporting, which is why its partner cell is Unverified: that is not the same as issuing unique links to the people who promote you. Cometly's pages mention only its own partner programs. Newsletter signups are Unverified for most tools because their pages talk about leads in general, not newsletter signups specifically. If a capability matters to you, ask the vendor directly.

## Why revenue tracking is harder than link tracking

Creating a tagged link is the easy part. Building a basic UTM link generator is a small project for a developer. Turning a click into a dollar figure is a different kind of problem, and it is why a link shortener and a revenue attribution platform are not the same thing.

A system that attributes revenue has to do all of the following:

- **Capture the source at the moment of the click** and keep it long enough to be useful, even if the visitor does not buy for days.
- **Record conversion events** such as signups, bookings and purchases, on pages you may or may not control.
- **Connect each event to the same person or journey,** so a signup on Monday and a purchase on Friday are recognized as one customer.
- **Handle journeys that cross domains,** such as a content site, a checkout provider and a booking tool.
- **Pull in real payment data.** The actual payment amounts live in your payment processor, such as Stripe. A revenue attribution tool needs to connect to that payment data so it can associate purchases and revenue with the correct customer journey. Without this connection, a tool may know that someone clicked a link or submitted a form, but not how much that customer actually paid.
- **Match the revenue back to the original source,** and keep doing so as more events arrive.

Each step is manageable alone. Together they are the reason most link tools report clicks and stop, and the reason revenue attribution is a product category of its own.

## Single-platform or all-platform tracking: which should you choose?

There is no single right answer. It depends on where you publish and what you need to measure.

**A single-platform tool is probably enough if:**

- You publish on one platform, and a specialized tool covers the outcome you care about. For YouTube-only creators, tools like FunnelYT and Primal Video are built for exactly that.
- You only need performance analytics on short-form content. Shortimize fits that job.
- You mainly run an affiliate or influencer program. Revshare is built around it.

**A CRM-based or ads-focused tool is probably the better fit if:**

- Your sales happen in a CRM and you want pipeline and won revenue per video. LeadJourney is built for that.
- Most of your growth comes from paid advertising. Cometly is built for that.

**An all-platform tracking tool is worth considering if:**

- You publish on TikTok, YouTube, Instagram and other platforms and want one view instead of several.
- Customers usually see more than one piece of content before they buy.
- Other people promote your products and you want to measure each one.
- Purchases are not your only outcome, and newsletter signups, consultations and sales calls matter too.

That last set of needs is what VSTRK is built for. It is not the only way to solve them, and a specialized tool may go deeper on its own platform. The trade-off is breadth against depth: pick the tool whose focus matches how you actually market.

## Why tracking the whole customer journey matters

Few customers see one video and buy. A more realistic path: someone discovers you on TikTok, watches a longer YouTube video a week later, joins your newsletter, and buys after an email. If your tracking credits only the last click before the purchase, the email or the YouTube video gets all the credit, and the TikTok video that started everything looks like a waste of time.

Journey tracking connects those touchpoints, so you can see which content introduces people, which builds trust and which closes the sale. VSTRK's approach is to let you connect pieces of content across platforms into one journey, including branches, and track clicks and conversions at each step. Other tools in this guide, including LeadJourney, DataFast, qklnk and Revshare, also describe multi-touch or journey-level views, with different focuses.

## Common tracking limitations and mistakes

No tracking method sees everything. Plan around these limits:

- **People who never click.** Many viewers see a video, search for your name later and buy. Link tracking cannot attribute them to the video.
- **Cross-device journeys.** Someone may watch on a phone and buy on a laptop, which breaks the chain unless you capture an identifier along the way.
- **The in-app browser.** Links opened inside TikTok may hide the referrer, so untagged links can show up as direct traffic.
- **One bio link.** If several videos share the same bio link, you cannot tell them apart without a different tag or landing page per video.
- **Delayed purchases.** Consultations and larger purchases may close weeks later, so review results over a longer window than a few days.
- **Numbers that do not match.** TikTok's analytics, your web analytics and your payment records count different things, and they will not agree exactly.

And avoid these common mistakes:

- Counting clicks as leads, or leads as customers.
- Inconsistent naming, such as `tiktok` in one link and `TikTok` in another, which splits your data.
- Never testing the link inside the TikTok app before you post.
- Judging videos by views instead of revenue per click or revenue per video.
- Tracking only purchases and ignoring signups and bookings that often come first.

## Best practices

- **Decide the goal of each video first.** A video meant to grow your newsletter should be judged by signups, not sales.
- **Use a consistent naming convention** for source, medium, campaign and content, and write it down.
- **Test every link on your own phone** and confirm the visit shows up as expected.
- **Track the outcomes that matter to your business,** not just purchases: signups, bookings, calls and revenue.
- **Compare videos by revenue per click or per thousand views,** not by raw views.
- **Add a "how did you hear about us?" question** to your signup or checkout. It catches the people link tracking misses.
- **Give each partner their own link** if others promote your content, and review results by partner, not just in total.
- **Review results on a regular schedule** and use them to decide what to make next.

## Frequently asked questions

### Can I track which TikTok video led to a sale?

Yes, if each video has its own identifiable link or landing page and your system connects the purchase back to the click. Without that, a single bio link makes every sale look like it came from the same place.

### Do UTM parameters work for organic TikTok?

Yes. UTM parameters work on any link, paid or organic. They are especially useful on TikTok because links opened in the in-app browser may not pass a clean referrer.

### Why does my TikTok traffic show up as direct in Google Analytics?

Links opened inside TikTok's in-app browser may not pass referrer information, and Google Analytics then labels the visit as direct. TikTok's own help notes that its in-app browser can lead to underreporting in Google Analytics. Tagging your links with UTM parameters is the usual fix.

### How do I track TikTok if I only have one bio link?

Use one of three approaches: change the bio link to match your latest video, point the bio link to a page that lists tagged links for each video, or use a tool that gives you a separate link for each video. A separate landing page per campaign also works.

### What is the difference between link tracking and revenue attribution?

Link tracking tells you who clicked. Revenue attribution connects that click to a lead, a customer and the money they paid, which requires recording conversion events and connecting to payment data.

### Do I need a tool, or can I do this myself?

You can start free with UTM links and web analytics. Dedicated tools save time when you need per-video revenue, several conversion types, or tracking across platforms and partners.

### Which tool should I use if I only publish on YouTube?

A YouTube-focused tool may be enough. Primal Video and FunnelYT are both built around YouTube. If you may add other platforms later, consider a tool that covers more than one.

### Can VSTRK track more than purchases?

According to VSTRK's product page, it tracks clicks, leads, calls and purchases, including newsletter signups, consultations, sales calls and revenue.

### Can VSTRK track revenue from Stripe?

Yes. VSTRK supports Stripe integration, allowing you to connect payment and revenue information with your content tracking. This helps you understand which videos, posts and customer journeys contribute to actual sales, rather than measuring clicks and leads alone.

### Can other people promote my products and have their results tracked?

Several tools in this guide describe partner or affiliate tracking, including Revshare and Primal Video. VSTRK's partner tracking links let others promote your content, products or offers through unique links while you measure the results they generate.

## Conclusion

Views tell you what people watched. Revenue tells you what worked. To connect the two, give each TikTok video its own tagged link, record what visitors do afterward, and tie the money back to the video that started it.

Which tool you need depends on how you work. A single-platform tool can be a good fit if you stick to one platform. If you publish across several platforms, want to see the whole customer journey, connect Stripe revenue, or let others promote your offers, an all-platform tool is worth a look. VSTRK is built for that second case. You can [start tracking with VSTRK](/start) with a 3-day free trial and explore the weekly plan at $17 USD per week.

## References

1. [Google Analytics Help: URL builders, collect campaign data with custom URLs](https://support.google.com/analytics/answer/10917952)
2. [Google Analytics Help: Default channel group](https://support.google.com/analytics/answer/9756891)
3. [TikTok Ads Help: About conversion discrepancies in TikTok Ads Manager](https://ads.tiktok.com/resources/help/article/conversion-discrepancies)
4. [TikTok Support Center: Link a website or social media account](https://support.tiktok.com/en/getting-started/setting-up-your-profile/linking-another-social-media-account)
5. [Matomo FAQ: Track visitors from TikTok in Matomo](https://matomo.org/faq/how-to/track-visitors-from-tiktok-in-matomo/)
6. [Shortimize Help: Platforms, accounts and content types supported](https://help.shortimize.com/articles/2674205-what-platforms-accounts-and-content-types-does-shortimize-support)
7. [Shortimize: Influencer analytics tools](https://www.shortimize.com/blog/influencer-analytics-tools)
8. [DataFast](https://datafa.st/)
9. [FunnelYT](https://www.funnelyt.nl/)
10. [DEV Community: Introducing FunnelYT, track leads from your YouTube videos](https://dev.to/kjworner/introducing-funnelyt-track-leads-from-your-youtube-videos-1-month-free-5bhh)
11. [Primal Video: YouTube tracking and growth platform](https://resource.primalvideo.com/)
12. [qklnk](https://qklnk.cc/)
13. [Revshare](https://www.revshare.so/)
14. [LeadJourney: TikTok integration](https://leadjourney.io/integrations/tiktok)
15. [LeadJourney: YouTube integration](https://leadjourney.io/integrations/youtube)
16. [LeadJourney](https://leadjourney.io/)
17. [Cometly: Social media attribution](https://www.cometly.com/post/social-media-attribution)
18. [VSTRK](https://vstrk.com/)