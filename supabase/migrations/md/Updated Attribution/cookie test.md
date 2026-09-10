Your mental model should now be:

PHASE 1 — CURRENTLY DEPLOYED

B
 ↓
external destination detected
 ↓
vt_visitor created/reused
 ↓
associate visitor → journey
 ↓
YouTube
 ↓
C
 ↓
read vt_visitor IF local journey is empty
 ↓
lookup journey
 ↓
console.log candidate
PHASE 2 — NOT IMPLEMENTED YET

B
 ↓
C is confirmed as valid continuation
AND
cross-origin condition is confirmed
 ↓
recover visitor/journey
 ↓
feed into existing hydration
 ↓
validateJourneyContinuation()
 ↓
REAL JOURNEY CONTINUATION