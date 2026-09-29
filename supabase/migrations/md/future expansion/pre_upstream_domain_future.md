# pre_upstream_domain — future design note (NOT MVP)

**Status:** Documentation only. No DB column. No runtime code. Do not implement.

---

## Current MVP (locked P1)

```text
upstream_domain = SOURCE VIDEO's Campaign ROOT domain
```

Example chain:

```text
Video A → Video B → Video C → Video D
```

| Edge   | upstream_domain |
|--------|-----------------|
| A → B  | A.com           |
| B → C  | B.com           |
| C → D  | C.com           |

If Video B also promotes D directly:

```text
A → B
    ├──→ C → D
    └──→ D   (new edge)

B → D
upstream_domain = B.com
```

Even if a longer structural path `A → B → C → D` already exists, the **new** edge is a creation-time snapshot of **B's campaign root only**. It does not encode the full historical journey.

### Why P1 for MVP

- One clear meaning for `upstream_domain`
- One deterministic Relay probe (`upstream_domain × 1`)
- No multi-domain guessing
- Simpler Relay: cookie → first_touch → upstream × 1 → DIRECT

Relay does **not** walk previous hops or `journey_domains`.

---

## Future idea only: `pre_upstream_domain`

**Name:** `pre_upstream_domain`

**Intended meaning (if ever needed):**  
A domain that existed *before* the current edge's `upstream_domain` context — e.g. deeper continuation history when a mid-journey video fans out to a target that also sits further down another branch.

### Concrete example

```text
Video A
   ↓
Video B
   ├──→ Video C → Video D
   └──→ Video D   (B promotes D directly)
```

P1 on the new edge:

```text
B → D
upstream_domain = B.com
```

**Future question (unanswered, not required for MVP):**  
If product later needs to remember the domain *before* B.com's context (e.g. A.com), would a separate field help?

```text
B → D
upstream_domain     = B.com
pre_upstream_domain = A.com   // hypothetical only
```

### Explicit non-goals (now and unless revisited)

```text
pre_upstream_domain is NOT part of the current MVP.
It is NOT a Relay probe target.
It is NOT a fallback after upstream MISS.
It is NOT part of MAX-2 journey_domains.
It is NOT a recursive journey-history system.
No database column is being added now.
No runtime code should use it now.
```

### When to reopen

Only if a real product case shows that a single source-campaign `upstream_domain` is insufficient for continuation recovery, and that one extra historical root is worth the complexity.

Until then: **P1 only.**

---

*Written 2026-09-29 — preserve idea; do not implement.*
