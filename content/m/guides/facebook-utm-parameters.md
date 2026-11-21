---
title: "Facebook UTM Parameters: How to Tag Posts and Ads and Track Them to Revenue"
seo_title: "Facebook UTM Parameters: Track Posts and Ads to Revenue | VSTRK"
description: "Learn how to add UTM parameters to Facebook posts and ads, which values to use, how to name them, and how to connect clicks to leads and revenue."
status: published
date: 2026-11-20
primary_keyword: "facebook utm"
card_summary: "How to tag Facebook posts and ads with UTM parameters, name them cleanly, and connect the clicks to leads and revenue."
related: ["guides/utm-tracking-guide", "tools/utm-link-builder", "guides/track-instagram-post-and-reel-to-revenue"]
---

A Facebook UTM link is an ordinary URL with a few extra tags on the end, such as `utm_source=facebook`, that tell your analytics tool where a visit came from. Add them to every link you post on Facebook, use dynamic values for ads in Meta Ads Manager, and keep your naming consistent. That gives you clean traffic reports by post and by campaign. To see leads, calls and revenue by post, you need one more step, covered at the end of this guide.

## What a Facebook UTM link looks like

Here is a tagged link for a hypothetical offer page:

```
https://example.com/offer?utm_source=facebook&utm_medium=social&utm_campaign=black-friday&utm_content=page-post-1
```

Everything after the `?` is tracking. The page itself ignores it. Your analytics tool, such as Google Analytics, reads the tags and attaches them to the visit.

| Parameter | What it answers | Facebook example |
| --- | --- | --- |
| `utm_source` | Where did the visit come from? | `facebook` |
| `utm_medium` | What type of traffic is it? | `social` (organic), `paid_social` (ads) |
| `utm_campaign` | Which campaign or promotion? | `black-friday` |
| `utm_content` | Which post, ad or link? | `page-post-1` |
| `utm_term` | Which paid search keyword? | Usually left blank on Facebook |

Source, medium and campaign are the three tags most people use. Content is what lets you tell two posts in the same campaign apart. For a broader explanation of how the tags work, see the [UTM tracking guide](/m/guides/utm-tracking-guide/).

## Which values to use for Facebook links

Pick one convention and write it down. Guides online use `paid`, `paid-social` and `paid_social` for ad traffic. Any of them works, as long as you use the same one every time. A common setup:

| Where the link appears | `utm_source` | `utm_medium` | `utm_campaign` | `utm_content` |
| --- | --- | --- | --- | --- |
| Organic post on your Page | `facebook` | `social` | Campaign name | Post identifier, such as a date and topic |
| Facebook ad | `facebook` | `paid_social` | Campaign name | Ad name |
| Link shared by a partner or creator on their own Facebook | `facebook` | `partner` | Campaign name | Partner name |

## How to add UTM parameters to organic Facebook posts

A Facebook post link is just a URL, so there is nothing to switch on. You tag the link before you paste it.

1. Start with the exact page you want people to land on.
2. Build the tagged URL. The free [UTM link builder](/m/tools/utm-link-builder/) includes a Facebook example you can start from, or you can type the values yourself.
3. Give each post its own `utm_content` value, for example `page-post-nov-20`.
4. Paste the tagged URL into the post.
5. Record it in a simple sheet: date, post, campaign, content value and destination.

The one-link-per-post habit is what makes the data useful. If every post uses the same tagged link, you can see that Facebook sent visits, but not which post did the work.

## How to add UTM parameters to Facebook ads

Meta lets you set URL parameters on each ad, in the Tracking section of the ad creation flow in Ads Manager. You can use two kinds of values: static values you type yourself, and dynamic values that Meta fills in for each ad.

| Dynamic value | What it fills in |
| --- | --- |
| `{{campaign.name}}` | The campaign name |
| `{{campaign.id}}` | The campaign ID |
| `{{adset.name}}` | The ad set name |
| `{{adset.id}}` | The ad set ID |
| `{{ad.name}}` | The ad name |
| `{{ad.id}}` | The ad ID |
| `{{placement}}` | Where the ad was shown |
| `{{site_source_name}}` | The platform: Facebook, Instagram, Messenger or Audience Network |

A simple string to paste into the URL parameters field:

```
utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}
```

UTM has no tag for ad sets, so many teams put the ad set name in `utm_term`, which Facebook ads do not otherwise use.

If the same ad also runs on Instagram, hard-coding `facebook` as the source labels the Instagram clicks as Facebook. In that case, use `{{site_source_name}}` as the source and `{{placement}}` as the medium instead:

```
utm_source={{site_source_name}}&utm_medium={{placement}}&utm_campaign={{campaign.name}}&utm_content={{ad.name}}
```

The trade-off is that your medium values now describe placements rather than a single `paid_social` bucket, so your reports need to group them.

One warning about names. Name-based values such as `{{campaign.name}}` record the name the campaign or ad had when it was first published. Renaming it later does not change what appears in your reports, so name things carefully before you publish.

To avoid debugging two values for the same tag, put the UTM parameters in one place only: either in the destination URL or in the URL parameters field, not both.

## Naming rules and mistakes to avoid

- **Use lowercase.** Analytics tools can treat `Facebook` and `facebook` as two different sources, which splits your data.
- **Choose one separator.** Use hyphens or underscores, and use the same one everywhere. Avoid spaces.
- **Use one source name.** Do not mix `facebook`, `fb` and `Facebook`.
- **Do not reuse one link for every post.** Give each post a unique `utm_content` value.
- **Do not tag links inside your own website.** UTM tags on internal links can start a new campaign visit and overwrite the original source.
- **Keep a log.** A shared sheet of every tagged link stops two people inventing two names for the same campaign.

## What UTM parameters cannot tell you

UTM tags label visits. They do not tell you what those visitors did next unless your tools are set up to connect the two.

- **Clicks are not customers.** One post can send far more visits than another and still produce no leads or sales. Traffic reports alone will not show that.
- **Journeys cross platforms.** Someone may see your Facebook post, join your newsletter from a different link, and book a call a week later. If only the last tagged click gets credit, the Facebook post that started it all looks like it did nothing.
- **Outcomes often live elsewhere.** Newsletter signups, sales calls and payments usually happen in other tools, so a traffic report cannot see them.

## Connecting Facebook links to leads and revenue

This is the step UTM tags alone do not cover. VSTRK tracks content across nine platforms, including Facebook, with a tracking link for each post, and follows visitors to the outcomes that matter: newsletter signups, sales calls, consultations and purchases. It connects to Stripe, so payments can be tied back to the post or partner link that started the journey. That lets you compare Facebook posts by revenue instead of clicks.

If you work with partners or creators who share your offer on their own Facebook accounts, [partner tracking links](/m/features/partner-tracking-links/) give each person an individual link, so you can compare results by person. The same approach works for other Meta properties, as shown in the guide to [tracking Instagram posts and Reels to revenue](/m/guides/track-instagram-post-and-reel-to-revenue/).

VSTRK costs $15 USD per week after a 3-day free trial. You can [start your free trial](/start) and test it on your next Facebook post.

## FAQ

### What are the best UTM parameters for Facebook?

Use `utm_source=facebook`, a medium that separates organic from paid traffic (such as `social` and `paid_social`), a campaign name, and a unique `utm_content` value for each post or ad. Add `utm_term` only if you have a use for it.

### Can I add UTM parameters to a regular Facebook post?

Yes. Add the tags to the link before you paste it into the post. Facebook does not need any special setting for organic posts.

### Should the UTM source be facebook or fb?

Either works, but pick one and use it everywhere. `facebook` is easier for other people on your team to read.

### Do UTM parameters work for Facebook and Instagram ads together?

They work, but a fixed `utm_source=facebook` will label Instagram clicks as Facebook. Use the `{{site_source_name}}` dynamic value to let Meta fill in the platform.

### Are UTM parameters free?

Adding UTM tags to a URL costs nothing, because they are only text on the end of a link. You need an analytics tool to read them, and a tracking tool such as VSTRK if you want to connect them to leads and revenue.
