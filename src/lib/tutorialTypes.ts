// src/lib/tutorialTypes.ts
//
// Shared step/tutorial shape for the interactive product-tour system.
// This is deliberately generic — Collaboration, Content, and Operator
// tutorials plug into the same shape later. Nothing here is Assets-specific.

export interface TutorialStep {
  /** Unique within the tutorial. Used for persistence + debugging. */
  id: string;

  /** Card copy. Keep both short — this is a tour, not documentation. */
  title: string;
  body: string;

  /** 'demo' = just Next. 'try-it' = a real action is required (see requireAction). */
  tag?: 'demo' | 'try-it';

  /**
   * Static route this step needs to be shown on. Use this for fixed
   * paths like '/assets' or '/videos'. Omit for steps that stay on
   * whatever route the tutorial is already on.
   */
  route?: string;

  /**
   * For routes that need a real id (e.g. /campaigns/:id), resolve it at
   * runtime instead of hardcoding one. Takes precedence over `route`
   * when present. Return null if there's nothing to navigate to (e.g.
   * the org has no campaigns yet) — the runner will show `fallbackNote`
   * on the current page instead of navigating.
   */
  resolveRoute?: () => Promise<string | null>;

  /**
   * CSS attribute selector for the real DOM element(s) to spotlight,
   * e.g. '[data-tutorial-id="assets-import"]'. Can match one or many
   * elements — multiple matches are highlighted as a single grouped
   * region (see CampaignDetail's four publish buttons). Omit for a
   * centered card with no spotlight.
   */
  targetSelector?: string;

  /** How long to wait for targetSelector before falling back. Default 4000ms. */
  waitTimeoutMs?: number;

  /**
   * Shown instead of the spotlight when resolveRoute returns null, or
   * when targetSelector never appears in time. Keeps the step from
   * getting stuck — it just explains the concept without pointing at
   * something that isn't there.
   */
  /**
   * Static reference screenshot shown instead of a live spotlight, for
   * steps where the real target may not exist for a given user (e.g. no
   * campaign set up yet). xPct/yPct/wPct/hPct describe the highlight
   * box's position as a fraction of the image's rendered size, so it
   * survives responsive resizing without pixel math.
   */
  previewImage?: {
    src: string;
    alt: string;
    
  };
  fallbackNote?: string;
/**
   * Manually override where the centered card sits, instead of dead
   * center. Use CSS percentage strings, e.g. { top: '46%', left: '80%' }.
   * Only applies when previewImage is set (centered-card mode).
   */
  cardOffset?: { top: string; left: string };

  /**
   * Optional "what's next" buttons shown at the bottom of a step
   * (used on the final recap step). If href is omitted, the button
   * renders disabled/greyed — use that for pages that don't exist yet.
   */
  ctaLinks?: { emoji: string; title: string; description: string; href?: string }[];
  /**
   * If set, Next is replaced by a disabled "waiting" state until the
   * app calls tutorial.notify(eventKey) from the REAL success path of
   * the real action (see ImportAssetModal's onImported in Assets.tsx).
   * Never gate on a click — only on a real success callback.
   */
  requireAction?: { eventKey: string };

  /**
   * If this is the tutorial's LAST step, and the step's resolveRoute
   * actually found something real (not the fallbackNote case), pressing
   * the button starts this tutorial instead of just finishing. Lets a
   * short tutorial hand off into a deeper one only when there's real
   * data to show — otherwise it just ends normally.
   */
  handoffTutorial?: Tutorial;
}

export interface Tutorial {
  id: string;
  steps: TutorialStep[];
}