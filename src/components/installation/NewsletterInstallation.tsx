import React from 'react';
import { Newspaper, XCircle } from 'lucide-react';
import type { CampaignExtended, FunnelState, TrackingState } from './installationHelpers';
import { FunnelHeader } from './FunnelHeader';
import { PixelBlock } from './PixelBlock';

export const NewsletterInstallation = ({
  campaign,
  funnelState,
  trackingState,
}: {
  campaign: CampaignExtended;
  funnelState: FunnelState;
  trackingState: TrackingState;
}) => {
  return (
    <div className="space-y-4 p-4 bg-zinc-950/50 rounded-xl border border-zinc-800">
      <FunnelHeader
        icon={<Newspaper size={14} />}
        title="Newsletter Funnel"
        funnelState={funnelState}
        trackingState={trackingState}
      />

      {funnelState === 'inactive' ? (
        <div className="flex gap-3 p-3 bg-red-500/5 border border-red-500/15 rounded-xl">
          <XCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            No newsletter signup URL detected. Add one to your campaign to activate this
            funnel.
          </p>
        </div>
      ) : (
        <PixelBlock
          campaignId={campaign.id}
          eventType="newsletter"
          amount={0}
          thankyouUrl={campaign.newsletter_thankyou_url}
          pendingMessage="No newsletter thank-you page URL detected yet."
          activeInstruction={`✅ Thank-you page detected. Paste this code on your newsletter confirmation page to complete tracking.`}
        />
      )}
    </div>
  );
};