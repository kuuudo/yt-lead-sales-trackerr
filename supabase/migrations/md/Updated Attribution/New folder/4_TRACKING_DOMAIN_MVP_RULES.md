# TRACKING DOMAIN — MVP RULES (LOCKED)

**Status: Locked 2026-09-08**  
**Companion to:** `3_FORWARD_VALIDATED_ATTRIBUTION_JOURNEY.md` (§22)  
**Do not treat this as a request to rewrite Track.tsx / journey engine.**

---

## 1. Purpose

Document how **branded tracking domains** interact with the
**localStorage-based journey** model, what is allowed for MVP, and what is
explicitly deferred.

Journey continuity depends on **browser origin**, not on:

- same parent domain / eTLD+1 alone  
- same Supabase `organization_id`  
- same campaign  
- same user account  

---

## 2. Origin cheat-sheet (do not conflate)

| Term | Meaning for VSTRK |
|------|-------------------|
| **Exact hostname** | e.g. `go.ali.com` — the host string in the tracking URL |
| **Origin** | `https` + exact hostname + port — unit of `localStorage` |
| **Same site** | Related hosts under one registrable domain (e.g. `*.vstrk.com`) — **does not** share `localStorage` |
| **Organization** | Backend tenancy — **irrelevant** to browser storage |
| **Tracking domain** | A hostname in `branded_tracking_domains` used to mint `https://{hostname}/{token}` |

```
www.vstrk.com     ≠  nike.vstrk.com     (different origins)
go.ali.com        ≠  go.nike.com        (different origins)
go.ali.com/a      =  go.ali.com/b       (same origin — paths do not matter)
```

---

## 3. Existing implementation (do not reinvent)

VSTRK already has:

```
branded_tracking_domains
  organization_id, hostname, status, is_default, …
        ↓
createRedirectLink()
        ↓
redirect_links.tracking_hostname  (snapshot on the row)
        ↓
public URL: https://{tracking_hostname}/{token}
        ↓
Track.tsx (Host = platform OR verified hostname)
```

Customer-owned hosts (`go.kaksidigitals.com`) and future VSTRK-controlled
branded hosts (`nike.vstrk.com`) both fit this **same data model**. Differences
are DNS/provisioning, not a second journey architecture.

---

## 4. What works today (proven / expected)

### 4A. Single tracking origin — continuous journey

```
go.kaksidigitals.com/123
  → go.kaksidigitals.com/134
  → go.kaksidigitals.com/353
```

```
ai.super.com/141 → ai.super.com/353 → ai.super.com/999
```

```
www.vstrk.com/… → www.vstrk.com/… → www.vstrk.com/newsletter-token
```

Same exact hostname ⇒ same origin ⇒ `localStorage` journey + `journey_id` can
continue; `events_journey` snapshots can share one `journey_id`.

Real-world proven pattern includes terminal Newsletter on the **same** host.

### 4B. Tracking host ≠ conversion host (still OK)

```
Track hops:     go.ali.com/t1 → go.ali.com/t2 → go.ali.com/newsletter-token
Destination:    ali.com/newsletter  or  ali.com/newsletter-thankyou
```

- Journey continuity: only requires same host on **Track** hops.  
- Purchase attribution: Tier-2 `vt_*` query params + thank-you / global pixel
  scripts on the **customer** site (may be apex `ali.com`).  
- This is **not** a failure mode and **not** the same as cross-tracking-origin
  journey continuation.

### 4C. Promote an asset (identity of the public URL)

```
Asset A stable URL:  go.ali.com/123
User B promotes Asset A  →  still share go.ali.com/123
```

Do **not** rewrite to `go.nike.com/123` merely because User B’s default domain
is `go.nike.com`. That would change origin and is not the asset’s stable path.

**Promote asset (A)** ≠ **move journey to promoter’s origin (B)**.

---

## 5. What does NOT work (and is deferred for MVP)

```
go.ali.com/123 → go.nike.com/456 → go.nike.com/789
```

```
www.vstrk.com/A → nike.vstrk.com/B
```

```
usera.vstrk.com/1 → nike.vstrk.com/2 → go.vstrk.com/3
```

Different tracking origins ⇒ empty / separate `localStorage` ⇒ new
`journey_id` (or no continuation). **Do not block MVP** solving this with:

- cookies  
- packing ids into `vt_sid`  
- IP / UA / timing fingerprint joins  
- permanent per-visitor ids baked into shared destination URLs  

---

## 6. Locked product rules (MVP)

### R1 — Continuity unit is exact hostname

One continuous forward-validated journey requires **one exact tracking
hostname** for every VSTRK redirect hop in that funnel.

### R2 — Multiple domains per organization: ALLOWED

Orgs may register many rows in `branded_tracking_domains`
(`go.nike.com`, `swim.nike.com`, …).

### R3 — One campaign → one domain forever: NOT required

Do **not** force a hard schema rule “one tracking domain per campaign” for MVP
unless product later chooses a stricter default for UX safety.

### R4 — One funnel / public asset chain → one hostname: REQUIRED

For any single content journey you care about attributing end-to-end, all
public tokens in that chain must use the **same** `tracking_hostname`.

### R5 — `redirect_links.tracking_hostname` is permanent snapshot

Hostname is fixed on the link row at create time. Changing org default later
must **not** rewrite historical tokens’ hosts.

### R6 — Track New Content / promotion hostname source

When creating or selecting links for an asset:

- Prefer the hostname already associated with that asset / campaign link
  policy (stable public URL).  
- Do **not** silently substitute the current user’s unrelated default domain
  when promoting **another** party’s asset.

### R7 — Optional org default

Setting `is_default` on one verified domain is fine for “new links default
here.” Defaults must not cause mixed-host funnels when users also mint links
on other verified hosts for the same chain.

### R8 — VSTRK-controlled branded subdomains (`slug.vstrk.com`)

Allowed as branding **if and only if** that customer’s funnel stays entirely
on `slug.vstrk.com`. Mixing `slug.vstrk.com` with `www.vstrk.com` breaks
localStorage continuity the same way customer custom domains do.

### R9 — Customer-owned custom domains (`go.customer.com`)

Still supported for **single-host** funnels. Cross-host continuity deferred.

### R10 — Code freeze scope for this topic

No requirement to change Track.tsx / `tracker.ts` journey logic solely for
domain policy. Policy is enforced at **link creation / product rules / docs**.
Journey engine already behaves correctly given origin boundaries.

---

## 7. Recommended MVP posture (summary)

| Topic | Decision |
|-------|----------|
| Ship continuous journey | Same exact tracking host only |
| Cross-tracking-origin journey | Deferred |
| Multiple domains per org | Yes |
| Hard “1 domain per campaign” | No (optional UX default only) |
| Promote external asset | Keep asset’s host/URL |
| Thank-you on customer apex | Supported via `vt_*` + pixel |
| Branded `*.vstrk.com` | Single-host funnels only |
| Journey code changes for domains | Not required for MVP |

---

## 8. Verification checklist (manual)

1. Same host A → B → C → Newsletter token → one `journey_id`, four-node snapshot possible.  
2. Mixed hosts mid-funnel → expect new `journey_id` (documented, not a bug).  
3. Newsletter destination on `customer.com` thank-you with pixel → conversion can still fire with `vt_*`.  
4. Promoted asset URL host unchanged when promoter has a different default domain.

---

## 9. Future sessions

1. Read this file + journey doc §22 before changing domain or journey behavior.  
2. Do not implement cross-origin journey transport without explicit approval.  
3. Prefer product/UI guardrails over new browser storage mechanisms for MVP.
