// src/lib/tutorials/createVideoLibraryAssetGuide.ts
//
// Content only — copy, step order, targets. No rendering logic lives here
// (see TutorialRunner.tsx). PATH 2 of "Create Your First Asset."
//
// Real workflow (confirmed from VideoDetail.tsx):
//   1. Land on a specific tracked video's detail page (/videos/:id) —
//      the "Add to Asset Library" button only exists there, and only
//      shows for a video that already has a real tracking link
//      (asset_id) that isn't already in the library (see
//      handleAddToLibrary's own guard: `if (!video?.asset_id) return;`).
//   2. Click "Add to Asset Library".
//
// IMPORTANT PREREQUISITE (confirmed, not assumed): a user with zero
// tracked videos CANNOT complete this path — there is no "create a video
// from scratch" step here. So step 1 tries to find an eligible video
// automatically (same small-helper pattern as assetsTutorial.ts's
// resolveMostRecentCampaignRoute — no new system, just one query).
// If none exists, this step's ctaLinks hands off straight to the
// existing trackFirstContentGuide instead of leaving the user stuck.
//
// NOTE / known limitation: ctaLinks always render on a step, whether or
// not resolveRoute succeeded (TutorialRunner.tsx doesn't currently
// condition ctaLinks on the fallback state). So the "Track Your First
// Content" button will show even when an eligible video WAS found. This
// is a minor UX quirk, not a bug — worst case the user has an extra,
// harmless option visible. Flagging this now in case you want a
// follow-up change to TutorialRunner.tsx to only show ctaLinks when
// showFallback is true.
//
// New selector needed (see edit notes given separately):
//   video-add-to-library — the real "Add to Asset Library" button

import { supabase } from '../supabase';
import type { Tutorial } from '../tutorialTypes';
import { trackFirstContentGuide } from './trackFirstContentGuide';

// Finds a recently tracked video that has a real tracking link (asset_id)
// and isn't in the Asset Library yet. Mirrors the two-step
// videos-then-assets lookup already used in Videos.tsx's fetchData, just
// scoped down to "give me one eligible video" instead of the whole list.
// Returns null if nothing qualifies — the runner then shows fallbackNote
// + the Track Your First Content handoff button instead of navigating.
async function resolveEligibleVideoRoute(): Promise<string | null> {
  const { data: vids, error: vErr } = await supabase
    .from('videos')
    .select('id, asset_id, created_at')
    .not('asset_id', 'is', null)
    .is('deleted_at', null)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (vErr || !vids || vids.length === 0) return null;

  const assetIds = [...new Set(vids.map(v => v.asset_id).filter(Boolean))];
  if (assetIds.length === 0) return null;

  const { data: assets, error: aErr } = await supabase
    .from('assets')
    .select('id, added_to_library_at')
    .in('id', assetIds);

  if (aErr || !assets) return null;

  const notYetInLibrary = new Set(
    assets.filter(a => !a.added_to_library_at).map(a => a.id)
  );
  const eligible = vids.find(v => v.asset_id && notYetInLibrary.has(v.asset_id));

  return eligible ? `/videos/${eligible.id}` : null;
}

export const createVideoLibraryAssetGuide: Tutorial = {
  id: 'create-video-library-asset',
  mode: 'follow-along',
  steps: [
    {
      id: 'open-video',
      title: 'Open a tracked video',
      body:
        'Let\u2019s turn one of your tracked videos into an Asset. Here\u2019s one that\u2019s ready.',
      resolveRoute: resolveEligibleVideoRoute,
      fallbackNote:
        'Before you can create a Video Library Asset, you need to track a video first.',
      ctaLinks: [
        {
          emoji: '\ud83c\udfac',
          title: 'Track Your First Content',
          description: 'Track a video so you have one ready to turn into an Asset.',
          startTutorial: trackFirstContentGuide,
        },
      ],
    },
    {
      id: 'add-to-library',
      title: 'Click Add to Asset Library',
      body:
        'This is the real, final step \u2014 it turns this video into a reusable, shareable Asset.',
      tag: 'try-it',
      targetSelector: '[data-tutorial-id="video-add-to-library"]',
      requireAction: { eventKey: 'follow-along-video-added-to-library' },
      fallbackNote: 'Scroll down to the Asset Library section on this page.',
    },
    {
      id: 'complete',
      title: 'You created your first Video Library Asset! \ud83c\udf89',
      body: 'It\u2019s now in your Asset Library, ready to share, assign, or track.',
    },
  ],
};
