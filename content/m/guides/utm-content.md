---
title: "utm_content: What It Is and How to Use It to Tell Apart Videos, Posts and Links"
seo_title: "utm_content: What It Is and How to Use It for Content | VSTRK"
description: "Learn what utm_content does, what to put in it for videos, posts and links, how to name it consistently, and where it shows up in Google Analytics 4."
status: published
date: 2026-11-25
primary_keyword: "utm_content"
card_summary: "What utm_content does, how to use it to tell apart videos, posts and link placements, and where to find it in Google Analytics 4."
related: ["guides/utm-tracking-guide", "tools/utm-link-builder", "guides/facebook-utm-parameters"]
---

`utm_content` is an optional UTM parameter that tells you which specific link, version or placement a click came from when several links point to the same page. If you post the same offer in a video description, a pinned comment and a newsletter, `utm_source` and `utm_medium` can tell you the platform. `utm_content` tells you which of those links people actually clicked.

Most explanations of `utm_content` focus on paid ads and email buttons. This guide shows how to use it for the content creators and small teams who publish videos, posts and emails every week.

## What utm_content does

Google's documentation describes `utm_content` as a way to differentiate creatives. Its own example is an email with two call-to-action links: you give each link a different `utm_content` value so you can tell which version worked better. The [Google Analytics help page on URL builders](https://support.google.com/analytics/answer/10917952) covers the full set of parameters.

Here is a link with all the common parameters:

```
https://example.com/offer?utm_source=youtube&utm_medium=video&utm_campaign=spring-launch&utm_content=description-link
```

The first three parameters are the core ones. `utm_term` and `utm_content` are optional. You can leave `utm_content` out, and tracking will still work, but then you lose the ability to separate links that share the same source, medium and campaign.

## utm_content vs the other UTM parameters

| Parameter | What it answers | Example |
| --- | --- | --- |
| `utm_source` | Where did the click come from? | `youtube`, `newsletter` |
| `utm_medium` | What kind of channel was it? | `video`, `email`, `social` |
| `utm_campaign` | Which campaign or promotion was it part of? | `spring-launch` |
| `utm_term` | Which paid keyword was it? (mainly for search ads) | `running-shoes` |
| `utm_content` | Which link, version or placement was it? | `pinned-comment`, `hook-b` |

The first three tell you where and why. `utm_content` tells you which one. For a deeper walk-through of the whole set, see the [UTM tracking guide](/m/guides/utm-tracking-guide/).

## What to put in utm_content for organic content

There is no fixed rule for what `utm_content` holds, so it works best when you decide on a pattern and stick to it. Four patterns cover most creator workflows:

1. **Identify the piece.** Use a short label for the video, post or email, such as `utm-basics-video`.
2. **Identify the placement.** Use the location of the link, such as `description-link`, `pinned-comment`, `bio-link`, `email-header` or `email-footer`.
3. **Identify the test variant.** Use a label for the version, such as `hook-a` and `hook-b`, or `cta-book-call` and `cta-free-guide`.
4. **Combine them.** Join two of the above with a consistent separator, such as `utm-basics-video_description`.

Here are some examples:

| Scenario | utm_source | utm_medium | utm_campaign | utm_content |
| --- | --- | --- | --- | --- |
| Link in a YouTube video description | `youtube` | `video` | `spring-launch` | `utm-basics_description` |
| Same video, link in the pinned comment | `youtube` | `video` | `spring-launch` | `utm-basics_pinned-comment` |
| Newsletter, top button | `newsletter` | `email` | `spring-launch` | `top-button` |
| Newsletter, footer link | `newsletter` | `email` | `spring-launch` | `footer-link` |

With this setup, you can compare the description link with the pinned comment for the same video, even though both come from YouTube and both belong to the same campaign.

## Naming rules that keep your reports clean

- **Use lowercase.** Google notes that values such as `SpringSale` and `Spring_Sale` are treated as different, so inconsistent capitalization splits one thing into several rows.
- **Use hyphens, not spaces.** Spaces turn into encoded characters and make values harder to read.
- **Keep values short and stable.** A label you can recognize in a report is better than a full video title.
- **Never reuse one value for two different things.** If `top-button` means two things in two campaigns, you cannot separate them later.
- **Keep personal information out.** Do not put email addresses or names of individual customers in any URL parameter.
- **Write your pattern down.** A short shared sheet of allowed values prevents drift, especially when more than one person creates links. The free [UTM link builder](/m/tools/utm-link-builder/) helps you assemble links with the same structure each time.

## Where to find utm_content in Google Analytics 4

Google Analytics 4 does not label it "utm_content". The value shows up under dimension names that include "manual ad content":

- **Session manual ad content:** the value from the session's tagged link.
- **First user manual ad content:** the value from the link that first brought a user to your site.
- **Manual ad content:** the value attributed to a specific event.

A common way to see it is to open the Traffic acquisition report and add Session manual ad content as a secondary dimension, or to build an Exploration with it. Menus change from time to time, so search for "ad content" in the dimension picker if the path is different on your account. The data only appears when visitors land on a page that has your analytics tag installed and the link still carries the parameters.

## What utm_content can't do

- **It records the visit, not the outcome.** It tells you which link got the click. It does not tell you whether that person became a lead or paid, unless your tools connect the click to those events.
- **It cannot see untracked sharing.** A link copied into a private chat loses its context. The [dark social guide](/m/guides/dark-social-tracking/) explains how to measure more of it.
- **It can disappear in transit.** Some redirects and link shorteners can drop parameters. Always click your own link and check that the final URL still contains `utm_content`.
- **It depends on discipline.** Typos and inconsistent naming quietly corrupt the data.

## Common utm_content mistakes

- **Putting campaign information in it.** Campaign belongs in `utm_campaign`. Use `utm_content` only for what differs within a campaign.
- **Creating a new value for every link.** Hundreds of one-off values are impossible to compare. Reuse a small set of labels.
- **Using long titles.** Short labels are easier to group and read.
- **Forgetting to test.** Click the link before publishing and confirm that the page loads and the parameters survive.
- **Changing labels midway.** Renaming a value splits your data into before and after.

## utm_content FAQ

### Is utm_content required?

No. It is optional. The core parameters are source, medium and campaign. Add `utm_content` when you need to separate links that share the same source, medium and campaign.

### What is the difference between utm_content and utm_term?

`utm_term` was designed for paid search keywords. `utm_content` identifies the link, creative or variation that was clicked.

### Can I use utm_content for organic social posts and videos?

Yes. It is only a label. You can use it for any link you want to tell apart, whether the traffic is paid or organic.

### Does utm_content change what visitors see?

No. The parameter only adds information to the URL. The page looks the same to the visitor.

### How do I compare utm_content values for A/B tests?

Give each version a distinct value, send roughly equal traffic to each and compare results in your analytics. Keep everything else the same so the label is the only difference.

## Going from clicks to revenue

`utm_content` can tell you which video or placement sent the click. To learn which clicks became leads, calls and purchases, you need tracking that follows people past the click. VSTRK gives each piece of content its own tracking link across nine platforms and connects clicks to leads, calls, purchases and Stripe revenue, so you can compare pieces by results and not only by traffic. If you also track [YouTube](/m/guides/track-youtube-video-to-revenue/) videos, the same idea applies there.

VSTRK has a 3-day free trial, then costs $15 USD per week. If you want to see which of your videos and posts actually lead to sales, you can [start a free trial](/start).
