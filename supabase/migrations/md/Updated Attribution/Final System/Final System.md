                    USER CLICKS NEXT LINK
                           │
                           ▼
                  ┌─────────────────┐
                  │  New VSTRK      │
                  │  token loads    │
                  │    e.g. 57y8    │
                  └────────┬────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │ Does URL already     │
                │ contain vt_token +   │
                │ vt_jid ?             │
                └──────────┬───────────┘
                           │
                    YES    │    NO
                     │     │
                     │     ▼
                     │  ┌──────────────────┐
                     │  │ Check current    │
                     │  │ origin cookie    │
                     │  └────────┬─────────┘
                     │           │
                     │      HIT? │ MISS?
                     │           │
                     │           ▼
                     │     ┌──────────────┐
                     │     │ Try VSTRK    │
                     │     │ Platform     │
                     │     │ Relay        │
                     │     └──────┬───────┘
                     │            │
                     │       HIT? │ MISS?
                     │            │
                     │            ▼
                     │     ┌──────────────┐
                     │     │ Try branded  │
                     │     │ Relay domains│
                     │     │   max 3      │
                     │     └──────┬───────┘
                     │            │
                     │       HIT? │ MISS?
                     │            │
                     │            ▼
                     │      ┌───────────┐
                     │      │ EXHAUSTED │
                     │      └───────────┘
                     │
                     ▼
              ┌─────────────────┐
              │ RECOVERY SIGNAL │
              │                 │
              │ vt_token=Kxdo   │
              │ vt_jid=3cdc...  │
              └────────┬────────┘
                       │
                       ▼
              ┌──────────────────┐
              │ Recover previous │
              │ node = Kxdo      │
              └────────┬─────────┘
                       │
                       ▼
              ┌──────────────────┐
              │ Bind journey_id  │
              │ = 3cdc98f7...    │
              └────────┬─────────┘
                       │
                       ▼
              ┌─────────────────────┐
              │ appendJourneyNode() │
              │                     │
              │ Kxdo → 57y8 ?       │
              └─────────┬───────────┘
                        │
                        ▼
              ┌──────────────────────┐
              │ validateContinuation │
              └──────────┬───────────┘
                         │
                  ┌──────┴──────┐
                  │             │
                 TRUE          FALSE
                  │             │
                  ▼             ▼
          ┌──────────────┐  ┌──────────────┐
          │ SAME         │  │ NEW          │
          │ journey_id   │  │ journey_id   │
          │              │  │ generated    │
          │ 3cdc98f7...  │  │              │
          └──────────────┘  └──────────────┘

          Yes. The important thing is that Relay is now a recovery mechanism between VSTRK tokens when the normal URL handoff gets lost — especially when YouTube or another external site sits between them.

🔥 What happens in the Kxdo → 57y8 example

This is the important one:

                    Kxdo
                     │
                     │
                     ▼
                  YouTube
                     │
                     │
                     ▼
                    57y8
                     │
                     │
              URL has NO context
              because YouTube
              dropped it
                     │
                     ▼
            ┌─────────────────┐
            │ 57y8 loads      │
            └────────┬────────┘
                     │
                     ▼
             Find cookie signal
                     │
                     ▼
              Relay finds:
              
              vt_token = Kxdo
              vt_jid   = 3cdc98f7...
                     │
                     ▼
            ┌─────────────────┐
            │ PRECHECK        │
            │                 │
            │ Kxdo → 57y8 ?   │
            └────────┬────────┘
                     │
                   YES ✓
                     │
                     ▼
             ┌───────────────┐
             │ RELAY HIT     │
             └───────┬───────┘
                     │
                     ▼
       Return to www.vstrk.com/57y8
       
       ?vt_token=Kxdo
       &vt_jid=3cdc98f7...
                     │
                     ▼
              ┌──────────────┐
              │ Track.tsx    │
              └──────┬───────┘
                     │
                     ▼
          Recover Kxdo as previous node
                     │
                     ▼
          Force-seed Kxdo locally
                     │
                     ▼
          Bind journey_id BEFORE append
                     │
                     ▼
             appendJourneyNode()
                     │
                     ▼
            Kxdo → 57y8 = TRUE
                     │
                     ▼
            ┌────────────────┐
            │ SAME JOURNEY   │
            │                │
            │ 3cdc98f7...    │
            └────────────────┘
🧠 The simplest way to remember it

Think of the system as 3 layers:

┌─────────────────────────────────────────────┐
│                 LAYER 1                     │
│                                             │
│       🔎 FIND THE PREVIOUS TOKEN            │
│                                             │
│ URL → Current Cookie → VSTRK → Relays       │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│                 LAYER 2                     │
│                                             │
│       🔐 VERIFY THE CONNECTION              │
│                                             │
│        "Does Kxdo → 57y8 make sense?"       │
│                                             │
│                 HIT / MISS                  │
└──────────────────────┬──────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────┐
│                 LAYER 3                     │
│                                             │
│          🧠 VSTRK JOURNEY ENGINE            │
│                                             │
│     Recover Kxdo → append 57y8 →            │
│     validateJourneyContinuation()           │
│                                             │
│     SAME JOURNEY or NEW JOURNEY             │
└─────────────────────────────────────────────┘
And the key rule:

Relay finds and verifies the previous token. VSTRK still owns the journey decision.

That is the architecture we have now.



Here is the updated process in plain English.

1. Normal VSTRK → VSTRK transition

Suppose:

Kxdo → 57y8

and Kxdo's destination video is the video represented by 57y8.

Normally, VSTRK already knows the journey:

Kxdo
  ↓
YouTube
  ↓
57y8

If 57y8 arrives with the proper VSTRK handoff parameters, we don't need Relay discovery.

The URL can contain:

vt_token=Kxdo
vt_jid=3cdc98f7...

Then Track.tsx:

receive vt_token + vt_jid
        ↓
recover Kxdo as previous node
        ↓
bind journey_id = 3cdc98f7...
        ↓
append 57y8
        ↓
existing validator checks Kxdo → 57y8
        ↓
isContinuation = true
        ↓
same journey_id

That's the new fix we just implemented.

2. The problem Relay solves

The difficult case is:

Kxdo
 ↓
YouTube
 ↓
57y8

YouTube doesn't run VSTRK's tracking code and the static 57y8 URL doesn't contain:

vt_token
vt_jid

So when 57y8 loads, VSTRK itself doesn't know:

"The person just came from Kxdo."

But the browser may still have the VSTRK/branded-domain cookies.

That's where Relay comes in.

3. Current discovery process

When 57y8 loads and there isn't already a usable continuation signal:

Step A — check current-origin cookie

First we ask:

Does the current VSTRK origin already have a cookie that identifies a usable previous token?

For example:

www.vstrk.com
      ↓
vt_token = 57y8? / previous token

We don't blindly trust the cookie.

We perform a continuation precheck.

For example:

previous token: Kxdo
current token: 57y8

Kxdo.destination_video_id
        ==
57y8.video_id

        ↓
      HIT

If HIT:

don't bounce anywhere
continue normally

This is the fastest path.

4. If current-origin cookie doesn't work → VSTRK platform candidate

If we're on a non-platform host such as:

store.kaksidigitals.com

we next check the VSTRK platform itself.

We send the browser through something like:

www.vstrk.com/r/platform?target=...

The important thing is that this is a top-level navigation.

Why?

Because VSTRK can't directly read:

store.kaksidigitals.com

cookies.

But the browser can send the cookie when visiting store.kaksidigitals.com directly, and it can send VSTRK's own cookie when visiting www.vstrk.com.

So Relay uses the browser's first-party context to recover the signal.

5. If platform doesn't have it → branded Relay candidates

Then we check the customer's branded tracking domains.

For example:

go.kaksidigitals.com
lucky.kaksidigitals.com
store.kaksidigitals.com

Each has its own first-party cookie context.

Relay is basically:

VSTRK
 ↓
go.kaksidigitals.com/r/<relayToken>
 ↓
read go.kaksidigitals.com cookie
 ↓
recover vt_jid / vt_token
 ↓
precheck
 ↓
return to VSTRK

The relay itself does not create a journey node.

It doesn't create attribution.

It doesn't decide the final journey.

It simply helps VSTRK discover:

"This browser appears to have a previous VSTRK token and journey ID over here."

6. The important HIT/MISS decision

Suppose the relay finds:

vt_token = Kxdo
vt_jid = 3cdc98f...

Current token:

57y8

Relay asks:

Does Kxdo → 57y8 make sense?

If:

Kxdo.destination_video_id === 57y8.video_id

then:

HIT

Relay sends the browser back to:

www.vstrk.com/57y8
    ?vt_token=Kxdo
    &vt_jid=3cdc98f...

Now VSTRK has an attested recovery handoff.

And with the fix we just added:

force-seed Kxdo
       ↓
bind 3cdc98f...
       ↓
append 57y8
       ↓
validator confirms continuation
       ↓
same journey
7. What happens on MISS

Suppose Relay finds:

vt_token = d3es

but we're currently loading:

2NCz

and:

d3es.destination_video_id
        !==
2NCz.video_id

Then:

MISS

Relay does not say:

"These are the same journey."

It simply says:

"This cookie candidate isn't the correct continuation."

Then we try the next candidate.

8. Maximum 3 external cookie groups

We don't endlessly bounce through domains.

We allow up to:

3 external cookie-parent groups

For example:

kaksidigitals.com
customerA.com
customerB.com

Multiple subdomains count as one group.

And:

www.vstrk.com

is special — it doesn't consume one of those three external slots.

9. If everything misses

Eventually:

current-origin → MISS
platform → MISS
relay 1 → MISS
relay 2 → MISS
relay 3 → MISS

We stop.

The relay returns:

?vt_probe=exhausted

Then Track sees:

vt_probe=exhausted

and doesn't start discovery again.

That's what prevents the infinite bounce problem we discovered.

Then normal journey logic takes over.

10. The most important distinction

The architecture is now basically:

                 ┌──────────────────┐
                 │  Current cookie  │
                 └────────┬─────────┘
                          │
                         HIT?
                          │
                yes ──────┴──────→ normal Track
                          │
                         no
                          ↓
                 ┌──────────────────┐
                 │ VSTRK platform   │
                 └────────┬─────────┘
                          │
                         HIT?
                          │
                yes ──────┴──────→ VSTRK + vt_token + vt_jid
                          │
                         no
                          ↓
                 ┌──────────────────┐
                 │ Branded Relays   │
                 │ max 3 groups     │
                 └────────┬─────────┘
                          │
                    HIT → return
                    MISS → next
                          │
                       all MISS
                          ↓
                    exhausted

And once a HIT comes back:

Relay
  ↓
recovered vt_token + vt_jid
  ↓
Track
  ↓
recover previous node
  ↓
bind recovered journey_id
  ↓
appendJourneyNode()
  ↓
validateJourneyContinuation()
  ↓
same journey OR legitimately start new journey
So Relay's job is actually very narrow

Relay does not own the journey.

It does not decide:

journey ID
attribution
revenue
continuation
journey node creation

Its job is basically:

"Temporarily visit a first-party origin where the browser can reveal the tracking cookie, verify whether that cookie's token can logically continue into the current token, and if so, hand the verified token/journey ID back to VSTRK."

Then VSTRK takes over again.

That separation is actually pretty clean.

             Layer 1
              Relay
                │
                ▼
       找到 previous token
             「Kxdo」
                │
                ▼
             Layer 2
       continuationPrecheck
                │
          ┌─────┴─────┐
          │           │
         MISS        HIT
          │           │
          ▼           ▼
       正常流程    previous node
                    + journey_id
                         │
                         ▼
                    Layer 3
                    Tracker
                         │
                         ▼
              正確恢復 Tracker state
                         │
                         ▼
              validateJourneyContinuation()
                         │
                   ┌─────┴─────┐
                   │           │
                  TRUE        FALSE
                   │           │
                   ▼           ▼
               SAME ID      NEW ID