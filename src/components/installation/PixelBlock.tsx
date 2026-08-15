import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { generateAttributionPixel } from './installationHelpers';
import { CopyButton } from './CopyButton';

export const PixelBlock = ({
  campaignId,
  eventType,
  amount,
  thankyouUrl,
  pendingMessage,
  activeInstruction,
}: {
  campaignId: string;
  eventType: string;
  amount: number | null;
  thankyouUrl: string | null | undefined;
  pendingMessage: string;
  activeInstruction: string;
}) => {
  const snippet = generateAttributionPixel(campaignId, eventType, amount);

  return (
    <div className="space-y-3 mt-4">
      {!thankyouUrl && (
        <div className="flex gap-3 p-4 bg-orange-500/5 border border-orange-500/20 rounded-xl">
          <AlertCircle size={14} className="text-orange-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-orange-300 uppercase tracking-widest">
              Tracking Pending
            </p>
            <p className="text-[11px] text-zinc-400 leading-relaxed">{pendingMessage}</p>
            <p className="text-[11px] text-zinc-500 leading-relaxed mt-1">
              We understand you may not have a thank-you page set up yet —{' '}
              <span className="text-zinc-300 font-bold">
                your tracking pixel is already generated and ready below.
              </span>{' '}
              The system is already working. For best results, we strongly recommend a
              dedicated thank-you page. Once you have it, simply paste this code inside
              and tracking activates instantly.
            </p>
          </div>
        </div>
      )}
      {thankyouUrl && (
        <div className="flex gap-3 p-4 bg-green-500/5 border border-green-500/20 rounded-xl">
          <CheckCircle2 size={14} className="text-green-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-zinc-300 leading-relaxed">{activeInstruction}</p>
        </div>
      )}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="label-caps">Your Tracking Pixel</span>
          <CopyButton text={snippet} />
        </div>
        <pre className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-[11px] font-mono text-zinc-400 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
          {snippet}
        </pre>
      </div>
    </div>
  );
};