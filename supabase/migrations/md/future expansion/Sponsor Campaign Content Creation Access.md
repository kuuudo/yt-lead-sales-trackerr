# Future Expansion — Sponsor Campaign Content Creation Access

## Status

**NOT MVP — DEFERRED**

Do not build this feature during the current MVP.

The current VSTRK MVP should keep the simpler model:

> Sponsor assigns an Asset → Marketer promotes that Asset.

This document records the future expansion idea so it is not forgotten.

---

# 1. Why this feature exists

The original limitation is:

A Sponsor can give a Marketer an Asset, but the Marketer cannot create a continuous content journey inside the Sponsor's Campaign.

Example:

```text
Marketer Video A
    ↓
Marketer Video B
    ↓
Marketer Video C
    ↓
Sponsor Video / Asset
    ↓
Sponsor Campaign domain
    ↓
Video E
    ↓
Video F
    ↓
Video G
```

The problem is that the Marketer's newly created Videos A/B/C normally belong to the Marketer's own Campaign.

Because VSTRK's architecture now follows:

> Asset → Campaign → Root Tracking Domain

the Marketer's content would naturally use the Marketer's Campaign/domain rather than the Sponsor's Campaign/domain.

That can break the desired continuous tracking context.

---

# 2. Future solution

Allow a Sponsor, during Create Assignment, to optionally give the Marketer permission to create new Content inside the Sponsor's Campaign.

This is NOT the same as transferring ownership of the Campaign.

The Sponsor remains the owner.

The Marketer receives a limited permission:

> "You may create Content in this Campaign."

---

# 3. Important permission model

Do NOT implement this as:

> "Share the entire Campaign with the Marketer."

That would be too broad.

Instead, create a narrowly scoped permission:

> **Campaign Content Creation Access**

The Marketer should be able to create their own Content while using the Sponsor Campaign as the Content's Campaign context.

The Marketer should NOT become the Campaign owner.

---

# 4. Sponsor controls the permission

In Create Assignment, the Sponsor could eventually see:

```text
Asset
[ Sponsor Asset ]

Campaign
[ Automatically selected from Asset ]

Root Tracking Domain
[ Automatically selected from Campaign ]

────────────────────────────

Campaign Content Creation

☐ Allow marketer to create content
  inside this Campaign
```

Default should be:

**OFF**

The Sponsor explicitly chooses whether to grant this capability.

---

# 5. Why Campaign and Domain should automatically come from the Asset

With the current architecture:

> Every Asset belongs to exactly one Campaign.

And:

> One Campaign has one Root Tracking Domain, with unlimited subdomains.

Therefore, when the Sponsor selects an Asset:

```text
Asset
  ↓
Campaign automatically known
  ↓
Root Tracking Domain automatically known
```

The Sponsor should NOT have to manually choose a different Campaign or Tracking Domain for the Asset.

Do not reintroduce arbitrary Asset → Campaign → Domain combinations.

This is important for keeping Relay deterministic.

---

# 6. Root-domain behavior

A Campaign has:

> One Root Tracking Domain + unlimited subdomains.

Example:

```text
Sponsor Campaign
Root Domain = nike.com

Allowed subdomains:
go.nike.com
shop.nike.com
newsletter.nike.com
blackfriday.nike.com
etc.
```

These are NOT separate Tracking Domains from the Relay perspective.

They belong to the same root-domain family.

Because the cookie can be shared/read across the subdomains, VSTRK does not need to create separate Relay logic for every subdomain.

The future Campaign Content Creation feature should preserve this rule.

---

# 7. What the Marketer should be able to do

If the Sponsor grants Campaign Content Creation Access, the Marketer should be able to:

```text
+ Create New Content
        ↓
Campaign:
[ Sponsor's shared Campaign ]
```

The Marketer can then create their own Videos/Content under that Campaign.

Example:

```text
Sponsor Campaign
    │
    ├── Sponsor Video D
    │
    ├── Sponsor Asset
    │
    ├── Marketer Video A
    ├── Marketer Video B
    └── Marketer Video C
```

The Marketer's created Content remains owned by the Marketer where appropriate.

The Campaign remains owned by the Sponsor.

The purpose is to allow the Marketer's Content to participate in the Sponsor's Campaign/tracking context.

---

# 8. The important use case

The original motivation is a long-form content journey.

Example:

```text
Video A
  ↓
Video B
  ↓
Video C
  ↓
Sponsor's Video / Asset
  ↓
Sponsor's Campaign
  ↓
Video E
  ↓
Video F
  ↓
Video G
```

The Sponsor may want the Marketer to build A/B/C specifically for promoting the Sponsor's product.

If the Marketer can create those Videos inside the Sponsor's Campaign, the entire sequence can remain inside the same Campaign context.

This is potentially a very powerful collaboration feature.

---

# 9. What the Marketer MUST NOT receive

Campaign Content Creation Access must NOT automatically give the Marketer full Campaign access.

The Marketer should NOT automatically receive permission to:

* edit Campaign settings
* rename the Campaign
* change the Campaign owner
* change the Root Tracking Domain
* manage the Sponsor's tracking-domain configuration
* delete the Sponsor's Campaign
* manage billing
* manage organization settings
* invite other users
* share the Campaign with another person
* modify unrelated Sponsor Assets
* automatically access every Campaign Resource
* automatically access every Campaign Redirect Link
* automatically access the Sponsor's entire Asset Library

The permission should be narrowly scoped to:

> **Create Content inside this Campaign.**

---

# 10. Do NOT automatically share Campaign Links

When Campaign Content Creation Access is granted, do NOT automatically expose all Campaign links.

For example, do NOT automatically give the Marketer:

```text
Sales Page
Newsletter
Consultation Page
Checkout
Other Redirect Links
Other Resources
```

The Campaign and its Links are separate concepts.

Future versions can introduce more granular permissions if customers actually need them.

For MVP/future V1 of this feature:

> Campaign Content Creation Access ≠ Campaign Link Access.

---

# 11. Do NOT automatically give the Marketer the ability to use the Sponsor's Campaign for unrelated work

The Sponsor is authorizing the Marketer to create Content within a specific Campaign because of the Assignment.

This should NOT mean:

> "The Marketer can now use the Sponsor's Campaign/domain for anything."

The permission should be scoped to the specific Sponsor → Marketer collaboration.

The Marketer should not be able to use the Sponsor's Campaign as their own general-purpose Campaign.

---

# 12. Revoking access

PromotionDetail should eventually allow the Sponsor to revoke Campaign Content Creation Access.

Example:

```text
Assignment
│
├── Asset Promotion Access
│
└── Campaign Content Creation Access
        ↓
      REVOKE
```

When revoked:

* existing Marketer-created Content should NOT automatically be deleted
* existing historical tracking data should NOT be destroyed
* existing attribution should NOT be rewritten
* the Marketer simply loses the ability to create NEW Content under that Sponsor Campaign

This should behave like permission revocation, not data deletion.

---

# 13. Assignment vs Campaign ownership

The future model should remain:

```text
Sponsor
  owns Campaign
      │
      ├── Root Tracking Domain
      │
      ├── Sponsor Assets
      │
      └── Assignment
             │
             └── Marketer
                    │
                    └── permission:
                       "Create Content in this Campaign"
```

The Marketer is a collaborator with a specific capability.

The Marketer does not become the Campaign owner.

---

# 14. Why this was intentionally deferred from MVP

This feature creates a new permission layer.

Implementing it correctly may require changes to:

* Campaign permissions
* Create Assignment
* PromotionDetail
* Create New Content
* Campaign selectors
* Asset visibility
* Asset Library visibility
* Content ownership rules
* Campaign access checks
* revocation behavior
* possibly Redirect Link permissions
* possibly Campaign-level collaboration state

That is too much complexity for the current MVP.

The current MVP is already capable of selling the core product:

> Sponsor creates Asset → assigns Asset → Marketer promotes Asset → VSTRK tracks the promotion.

Do not delay the MVP to build this.

---

# 15. Future product positioning

When eventually implemented, this feature can become a stronger collaboration story:

> **A Sponsor can give a Marketer not only an Asset to promote, but optionally permission to create their own content inside the Sponsor's Campaign.**

This allows a Marketer to build a complete content journey around the Sponsor's Campaign without becoming the owner of the Sponsor's Campaign.

Potential flow:

```text
Sponsor creates Campaign
        ↓
Sponsor creates Asset
        ↓
Sponsor assigns Asset to Marketer
        ↓
Sponsor optionally enables
"Create Content in this Campaign"
        ↓
Marketer creates Video A
        ↓
Video B
        ↓
Video C
        ↓
Sponsor Asset
        ↓
Campaign continues
```

---

# 16. Important architectural principle

Do NOT solve this by weakening the existing rules.

Keep these rules:

1. Every Asset belongs to exactly one Campaign.
2. A Campaign has at most one Root Tracking Domain.
3. A Campaign's Root Tracking Domain may have unlimited subdomains.
4. An Asset uses its own Campaign's Tracking Domain.
5. An Asset cannot borrow another Campaign's Tracking Domain.
6. A Campaign can exist without a Tracking Domain.
7. Campaign ownership remains with the Sponsor.
8. Campaign Content Creation Access is an explicit permission.
9. Campaign Content Creation Access does not automatically grant Campaign Link access.
10. Campaign Content Creation Access does not automatically grant Campaign administration access.

The future feature should be built **on top of these rules**, not by undoing them.

---

# 17. MVP boundary

For the current MVP, STOP HERE:

```text
Sponsor
  ↓
Create Assignment
  ↓
Select Asset
  ↓
Asset automatically determines Campaign
  ↓
Campaign automatically determines Root Tracking Domain
  ↓
Assign to Marketer
  ↓
Marketer promotes Asset
```

Do NOT add Campaign Content Creation Access yet.

Build this later only when there is a real customer need or sufficient product maturity.

---

# Future feature name

Suggested internal name:

**Campaign Content Creation Access**

Alternative UI wording:

**Allow marketer to create content in this Campaign**

Do not call it simply "Share Campaign," because that implies broader Campaign access than intended.
