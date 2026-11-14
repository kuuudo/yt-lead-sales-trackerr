---
title: "UTM Tracking: How to Track Leads and Revenue From Every Link"
seo_title: "UTM Tracking Guide: Track Leads and Revenue From Links | VSTRK"
description: "Learn how UTM tracking works, how to name parameters, and how to connect tagged links to leads and revenue across social, email and partner links."
status: published
date: 2026-11-14
primary_keyword: "utm tracking"
card_summary: "How UTM tracking works, what it cannot tell you, and how to connect tagged links to leads and revenue."
related: ["guides/track-tiktok-video-to-revenue", "tools/utm-link-builder", "features/partner-tracking-links"]
---

You share the same offer in a newsletter, a YouTube description and a LinkedIn post. A week later, sales are up. What you cannot see is which of the three did it.

UTM tracking is the standard way to solve the first half of that problem. A few short tags added to the end of a URL tell your analytics tool which link a visitor clicked. The second half is harder: knowing where a visit came from is not the same as knowing which visits paid you.

This guide explains how UTM tracking works, which parameters matter, how to name them so your data stays clean, and where UTMs stop being enough. We make VSTRK, a tool for tracking content to leads and revenue, so we mention it where it fits. Most of this guide works with free tools, and we say where a different approach is the better choice.

## What is UTM tracking?

UTM stands for Urchin Tracking Module. A UTM parameter is a short label added to the end of a URL. When someone clicks the link, the label travels with them to your website, where your analytics tool reads it and records where the visit came from.

Because the tag lives in the URL, it does not depend on the platform. You can add it to a newsletter button, a video description, a social post, a partner's link or a paid ad. UTM tracking therefore answers one question: **which link did this visitor click?**

It does not, by itself, answer the questions most businesses care about more: did that visitor become a lead, did they pay, and how much? We cover that gap below.

## How UTM tracking works

The mechanics are the same on every platform:

1. **Add parameters to the destination URL.** Each one is a name and a value joined by an equals sign.
2. **Publish the tagged link** where people can click it.
3. **A visitor clicks.** The parameters are sent to your analytics tool along with the visit.
4. **Your analytics tool records the source, medium and campaign** for that session. In Google Analytics, you can view them in the Acquisition > Traffic acquisition report.
5. **You compare links,** and decide what to repeat.

Here is what a tagged link looks like:

```
https://example.com/brand-kit?utm_source=newsletter&utm_medium=email&utm_campaign=brand-kit-launch&utm_content=header-button
```

A question mark separates the page address from the parameters. Each parameter is written as a name, an equals sign and a value, and an ampersand separates one parameter from the next. Google's documentation says you can add parameters in any order.

## The UTM parameters, explained

<div class="table-wrap">
<table class="cmp">
<thead><tr><th scope="col">Parameter</th><th scope="col">What it answers</th><th scope="col">Example value</th><th scope="col">Use it?</th></tr></thead>
<tbody>
<tr><td><code>utm_source</code></td><td>Where the click came from: a platform or a specific newsletter</td><td>youtube, newsletter</td><td>Always</td></tr>
<tr><td><code>utm_medium</code></td><td>The type of channel</td><td>email, social, video</td><td>Always</td></tr>
<tr><td><code>utm_campaign</code></td><td>Which campaign, offer or promotion</td><td>brand-kit-launch</td><td>Always</td></tr>
<tr><td><code>utm_content</code></td><td>Which specific link or post, when one campaign has several</td><td>header-button, description-link</td><td>Optional, very useful</td></tr>
<tr><td><code>utm_term</code></td><td>The paid keyword, per Google's description</td><td>A paid search keyword</td><td>Optional</td></tr>
<tr><td><code>utm_id</code></td><td>A campaign ID, used to match imported campaign data</td><td>An ID you already use elsewhere</td><td>Optional</td></tr>
<tr><td><code>utm_source_platform</code></td><td>The platform responsible for directing the traffic</td><td>Mostly used with ad platforms</td><td>Optional</td></tr>
</tbody>
</table>
</div>

Google's help page says that when you add parameters to a URL you should always use `utm_source`, `utm_medium` and `utm_campaign`. It also strongly recommends setting all the relevant parameters if you set one, because missing parameters lead to `(not set)` values in your reports.

Google's page also lists `utm_creative_format` and `utm_marketing_tactic`, and notes that neither is currently reported in Google Analytics properties. For organic social, email and partner links, the first four parameters in the table are usually all you need.

You can write these links by hand, or use a builder. Google offers a Campaign URL Builder, and our free [UTM Link Builder](/m/tools/utm-link-builder/) assembles the link in your browser and lets you copy it.

## How to name UTM values so your data stays clean

Most bad UTM data comes from inconsistent naming, not from the tags themselves. Google's documentation is explicit that parameter values are case sensitive: `utm_source=google` is different from `utm_source=Google`, and `SpringSale` and `Spring_Sale` count as distinct campaigns. Each variation gets its own row in your report.

Google also recommends using one unique `utm_source` for each distinct platform, such as Facebook, Instagram or TikTok, and one unique `utm_medium` for each distinct channel.

A convention you can adopt in five minutes:

- **Write everything in lowercase.** This removes the case problem entirely.
- **Use hyphens instead of spaces.** `brand-kit-launch`, not `Brand Kit Launch`.
- **Pick one value per platform and never vary it.** If YouTube is `youtube`, it is never `yt` or `YouTube`.
- **Name campaigns after the offer or event,** so every link promoting the same thing groups together.
- **Use `utm_content` for the specific post or link,** so you can compare two links inside one campaign.
- **Keep the convention in a shared sheet.** The next person to tag a link should be able to copy a row, not guess.

Here is one example convention. Adapt the values to your own channels:

<div class="table-wrap">
<table class="cmp">
<thead><tr><th scope="col">Where the link is placed</th><th scope="col"><code>utm_source</code></th><th scope="col"><code>utm_medium</code></th><th scope="col"><code>utm_campaign</code></th><th scope="col"><code>utm_content</code></th></tr></thead>
<tbody>
<tr><td>YouTube video description</td><td>youtube</td><td>video</td><td>brand-kit-launch</td><td>description-link</td></tr>
<tr><td>Newsletter header button</td><td>newsletter</td><td>email</td><td>brand-kit-launch</td><td>header-button</td></tr>
<tr><td>LinkedIn post</td><td>linkedin</td><td>social</td><td>brand-kit-launch</td><td>launch-post</td></tr>
<tr><td>A partner's own link</td><td>partner</td><td>referral</td><td>brand-kit-launch</td><td>partner-name</td></tr>
</tbody>
</table>
</div>

Keep private information out of UTM values. They sit in the URL, so anyone who clicks, copies or shares the link can read them. Do not put names, email addresses or anything you would not want a visitor to see.

## A worked example (illustrative numbers)

All numbers in this section are made up to show how the pieces fit together. They are not data from VSTRK customers or from any real account.

Imagine a freelance designer who sells a $79 brand kit template. She promotes the launch in three places over 30 days, each with its own tagged link, and she records what happens.

<div class="table-wrap">
<table class="cmp">
<thead><tr><th scope="col">Tagged link</th><th scope="col">Sessions</th><th scope="col">Email signups</th><th scope="col">Purchases</th><th scope="col">Revenue</th><th scope="col">Revenue per session</th></tr></thead>
<tbody>
<tr><td>YouTube description (youtube / video)</td><td>1,200</td><td>54</td><td>4</td><td>$316</td><td>$0.26</td></tr>
<tr><td>Newsletter header button (newsletter / email)</td><td>380</td><td>62</td><td>11</td><td>$869</td><td>$2.29</td></tr>
<tr><td>LinkedIn post (linkedin / social)</td><td>640</td><td>29</td><td>3</td><td>$237</td><td>$0.37</td></tr>
</tbody>
</table>
</div>

In total, that is 2,220 sessions, 145 signups, 18 purchases and $1,422 in revenue.

Judged by sessions, YouTube wins: it sent more than three times as many visits as the newsletter. Judged by revenue per session, the newsletter earns about nine times as much per visit as YouTube. Both readings are correct. They lead to different decisions, and only the second one tells you where the money came from.

Notice where the columns come from. Sessions and the source of each session are what UTM tags give you. The signup and purchase columns depend on recording those events, and the revenue column depends on matching each payment to the visit that started it. UTM tags label the visit. They do not match payments. The sections below cover how to close that gap.

## What UTM tracking can and cannot tell you

UTM tracking is excellent at one job: labeling where a visit came from. Plan around these limits:

- **It does not measure revenue on its own.** The tag identifies the visit. The actual payment lives in your payment processor, which does not know about UTM tags unless you connect the two.
- **It cannot see people who never click.** Someone may see your post, search your name a week later and buy. That visit does not carry your tags.
- **It attaches to a visit, not to a person.** A visitor who signs up from one link and buys later from another can be credited to different sources, depending on how your tool assigns credit.
- **Missing or inconsistent tags create noise.** A skipped parameter shows up as `(not set)`, and different spellings split one channel into several rows.
- **Some reports leave UTMs out.** Google notes that UTM parameters are omitted from the Landing page + query string and Page path + query string dimensions, and are instead populated in the Page location dimension.
- **Cross-device journeys and delayed purchases break the chain.** Someone who clicks on a phone and buys on a laptop, or buys three weeks later, is hard to connect to the original link.

None of this means UTMs are not worth using. It means you should treat them as the first step of tracking, not the whole system.

## From tagged links to leads and revenue: three setups

There are three common ways to take UTM data further. They differ in cost, effort and how far down the funnel they reach.

### Web analytics with events for your goals

Free web analytics such as Google Analytics report sessions by source, medium and campaign. If you also record events for the outcomes you care about, such as signups and purchases, you can see which tagged links lead to them. This is a good fit when your priority is traffic quality and on-site behavior. The effort comes later: turning those events into dollar amounts means sending purchase data into your analytics, and the payment record itself still lives elsewhere.

### Pass the source into your forms and records

Many teams add hidden fields to signup and booking forms that capture the UTM values from the page address. Each lead is then stored with its source in your CRM, email tool or spreadsheet, and you can report on leads and customers by channel. This is a strong fit when your sales process already runs through a CRM. It takes some setup, and payments recorded in another system still need to be matched by hand or by a connection.

### An attribution tool that joins clicks, conversions and payments

The third option is a tool whose whole job is connecting the click to the outcome and to the money. To do that, a tool has to capture the source at the moment of the click, record conversion events, tie the events to the same visitor over time, and pull in real payment data. Our guide on [tracking TikTok videos to revenue](/m/guides/track-tiktok-video-to-revenue/) goes into those requirements in more depth and compares several tools.

VSTRK is one option in this category. You give each piece of content its own tracking link, and VSTRK tracks the results, including clicks, newsletter signups, consultations, sales calls and purchases. It supports Stripe integration, so payment and revenue data can be connected to your content tracking, and it can connect content across platforms into one customer journey. It currently supports nine platforms: Instagram, X, YouTube, LinkedIn, Facebook, Reddit, TikTok, Threads and Twitch. VSTRK offers a 3-day free trial, and the weekly plan costs $15 USD per week.

How to choose:

- **Web analytics alone is probably enough** if you mostly need to know which sources bring visitors and what those visitors do on your site.
- **Form fields and a CRM are probably the better fit** if leads and deals live in a CRM and you want pipeline by source.
- **An attribution tool is worth considering** if you publish on several platforms, want leads, calls and Stripe revenue tied back to the content that started them, or work with partners who promote your offers.

## UTM tracking for organic social and creator content

Most UTM advice is written for paid ads. Organic content has its own wrinkles.

- **One bio link cannot tell your posts apart.** Most profiles allow a single clickable link. Where links are clickable, such as video descriptions, newsletters and posts, give each piece of content its own tagged link. For the bio link, point it to a page per campaign or update it to match your latest content.
- **Use `utm_content` to identify the post.** A short label for the video or post, such as `invoice-mistakes`, lets you compare individual pieces of content inside one campaign.
- **Give each partner their own link.** If other people promote your offers, a separate tagged link per person is the only way to compare what each one produces. [Partner tracking links](/m/features/partner-tracking-links/) are built for this.
- **Shorten after you tag, not before.** A short link redirects to your full URL, so add the UTM parameters first, shorten the result and test it. Our comparison of [VSTRK and Bitly](/m/compare/bitly-alternative-for-lead-tracking/) explains what a link shortener measures and what it does not.
- **Test every link before you post it.** Click the link on your phone and confirm the visit appears in your analytics with the right source and campaign.
- **Check platform quirks.** Links opened inside an app's built-in browser can behave differently, which is one reason tagging matters. We cover the TikTok case in our [TikTok tracking guide](/m/guides/track-tiktok-video-to-revenue/).

## Common UTM tracking mistakes

- Using different spellings or capitalization for the same source, which splits your data.
- Skipping `utm_medium` or `utm_campaign`, which leaves `(not set)` values in your reports.
- Reusing one generic link across every post, so the report cannot tell them apart.
- Changing naming conventions mid-campaign, so old and new data cannot be compared.
- Tagging a link but never testing it before posting.
- Putting personal or private information in UTM values.
- Treating sessions as results. Sessions are visits. Leads and customers are outcomes.
- Judging channels by traffic instead of by leads, customers and revenue per visit.

## UTM tracking checklist

- **Decide the question first.** Do you want to compare channels, posts or partners? Your parameters should answer exactly that.
- **Always set source, medium and campaign,** and use `utm_content` when a campaign has several links.
- **Write the convention down** and keep every value lowercase.
- **Tag every link you control,** and give every post, email and partner a distinct link.
- **Test each link** before it goes live.
- **Record outcomes, not just visits:** signups, bookings, calls and purchases.
- **Compare by revenue or leads per visit,** not by raw sessions.
- **Review results on a schedule,** and use them to decide what to publish next.

## Frequently asked questions

### What does UTM stand for?

UTM stands for Urchin Tracking Module. In practice, it refers to the set of parameters you add to a URL to label where a click came from.

### Are UTM parameters case sensitive?

Yes. Google's documentation gives `utm_source=google` and `utm_source=Google` as an example of two different values. Keeping every value lowercase avoids the problem.

### Which UTM parameters are required?

Google says you should always use `utm_source`, `utm_medium` and `utm_campaign`. If you leave relevant parameters out, `(not set)` values can appear in your reports.

### Where do I see UTM data in Google Analytics?

Google lists Session source/medium, Session medium, Session source and Session campaign in the Acquisition > Traffic acquisition report.

### Do UTM parameters work for organic social posts and email?

Yes. UTM parameters work on any link you can place, whether the traffic is paid or organic, because the tag is part of the URL itself.

### Can UTM tracking show revenue?

Not by itself. UTM tags label the visit. To see revenue by source, you also need to record purchases and match each payment to the visit that started it, either in your own reporting or with a tool built for that.

### Do I need a tool to create UTM links?

No. You can write them by hand using the format in this guide, use Google's Campaign URL Builder, or use our free [UTM Link Builder](/m/tools/utm-link-builder/).

### How should I track partners or affiliates with UTM links?

Give each person a separate link, with a distinct value in `utm_content` or another parameter you reserve for partners, and keep that convention in your shared sheet. See [partner tracking links](/m/features/partner-tracking-links/) for how VSTRK handles this.

## Conclusion

UTM tags are the simplest way to find out which link a visitor clicked. Used with a clear naming convention, they turn a pile of anonymous visits into a comparison of your channels, posts and partners.

They are also only the first step. To know which links produce leads, calls and revenue, you need to record what visitors do after the click and connect payments back to the link that started the journey. Free analytics, a CRM with hidden form fields and a dedicated attribution tool are three ways to get there. If you publish across several platforms and want to connect Stripe revenue to the content behind it, you can [start tracking with VSTRK](/start) with a 3-day free trial and a weekly plan at $15 USD per week.

## References

1. [Google Analytics Help: URL builders, collect campaign data with custom URLs](https://support.google.com/analytics/answer/10917952)
2. [Zoho Forms: A brief guide to lead tracking and management](https://www.zoho.com/blog/index.php/forms/lead-tracking-and-management-1.html)
3. [VSTRK](https://vstrk.com/)
