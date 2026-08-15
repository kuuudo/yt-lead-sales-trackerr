import React, { useState, useEffect } from 'react';
import { AlertCircle, ArrowRight, Info, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useViewing } from '../../lib/ViewingContext';
import { CopyButton } from './CopyButton';

export const RedirectTrackingBlock = ({
  campaignId,
  destinationUrl,
  linkType,
  eventLabel,
  limitationMessage,
}: {
  campaignId: string;
  destinationUrl: string | null | undefined;
  linkType: string;
  eventLabel: string;
  limitationMessage: string;
}) => {
  const { isReadOnly } = useViewing();
  const [trackedUrl, setTrackedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!destinationUrl || !campaignId) return;

    const syncLink = async () => {
      const { data: existing } = await supabase
        .from('redirect_links')
        .select('token, destination_url')
        .eq('campaign_id', campaignId)
        .eq('link_type', linkType)
        .is('video_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (isReadOnly) {
        if (existing) setTrackedUrl(`${window.location.origin}/${existing.token}`);
        return;
      }

      if (!existing) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const token = Array.from({ length: 4 }, () =>
          chars[Math.floor(Math.random() * chars.length)]
        ).join('');
        const { error } = await supabase.from('redirect_links').insert({
          token,
          campaign_id: campaignId,
          link_type: linkType,
          destination_url: destinationUrl,
          video_id: null,
        });
        if (!error) setTrackedUrl(`${window.location.origin}/${token}`);
      } else if (existing.destination_url !== destinationUrl) {
        await supabase
          .from('redirect_links')
          .update({ destination_url: destinationUrl })
          .eq('campaign_id', campaignId)
          .eq('link_type', linkType)
          .is('video_id', null);
        setTrackedUrl(`${window.location.origin}/${existing.token}`);
      } else {
        setTrackedUrl(`${window.location.origin}/${existing.token}`);
      }
    };

    syncLink();
  }, [campaignId, destinationUrl, linkType]);

  return (
    <div className="space-y-3 mt-4">
      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
          <ArrowRight size={11} /> Your Tracked {eventLabel} Link
        </p>
        {!destinationUrl ? (
          <div className="flex gap-2 p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
            <AlertCircle size={12} className="text-zinc-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-zinc-500">
              No destination URL configured yet. Add one in your campaign settings.
            </p>
          </div>
        ) : trackedUrl ? (
          <div className="flex gap-2">
            <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 font-mono text-[11px] text-zinc-400 break-all">
              {trackedUrl}
            </div>
            <CopyButton text={trackedUrl} />
          </div>
        ) : (
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 font-mono text-[11px] text-zinc-600 flex items-center gap-2">
            <Loader2 size={11} className="animate-spin shrink-0" /> Generating tracked
            link…
          </div>
        )}
      </div>

      <div className="flex gap-3 p-3.5 bg-zinc-800/40 border border-zinc-700/50 rounded-xl">
        <Info size={12} className="text-zinc-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-zinc-500 leading-relaxed">{limitationMessage}</p>
      </div>
    </div>
  );
};