import React, { useState, useEffect } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Key,
  Loader2,
  Webhook,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useViewing } from '../../lib/ViewingContext';
import { WEBHOOK_ENDPOINT } from '../../lib/tracker';
import type { StripeConfig } from './installationHelpers';
import { CopyButton } from './CopyButton';

const generateToken = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 4 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
};

export const StripeSetupBlock = ({
  userId,
  stripeConfig,
  checkoutUrl,
  campaignId,
  linkType,
  onSecretSaved,
}: {
  userId: string;
  stripeConfig: StripeConfig | null;
  checkoutUrl: string | null | undefined;
  campaignId: string;
  linkType: 'checkout' | 'consultation';
  onSecretSaved: () => void;
}) => {
  const { isReadOnly } = useViewing();
  const [webhookSecret, setWebhookSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [trackedUrl, setTrackedUrl] = useState<string | null>(null);
  const webhookEndpoint = WEBHOOK_ENDPOINT;
  const isConnected = !!(stripeConfig?.stripe_webhook_secret);

  useEffect(() => {
    if (!checkoutUrl || !campaignId) return;
    const dbLinkType = linkType === 'consultation' ? 'consultation' : 'checkout';

    const syncTrackedLink = async () => {
      const { data: existing } = await supabase
        .from('redirect_links')
        .select('token, destination_url')
        .eq('campaign_id', campaignId)
        .eq('link_type', dbLinkType)
        .is('video_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (isReadOnly) {
        if (existing) setTrackedUrl(`${window.location.origin}/${existing.token}`);
        return;
      }

      if (!existing) {
        const token = generateToken();
        const { error } = await supabase.from('redirect_links').insert({
          token,
          campaign_id: campaignId,
          link_type: dbLinkType,
          destination_url: checkoutUrl,
          video_id: null,
        });
        if (!error) setTrackedUrl(`${window.location.origin}/${token}`);
      } else if (existing.destination_url !== checkoutUrl) {
        await supabase
          .from('redirect_links')
          .update({ destination_url: checkoutUrl })
          .eq('campaign_id', campaignId)
          .eq('link_type', dbLinkType)
          .is('video_id', null);
        setTrackedUrl(`${window.location.origin}/${existing.token}`);
      } else {
        setTrackedUrl(`${window.location.origin}/${existing.token}`);
      }
    };

    syncTrackedLink();
  }, [campaignId, checkoutUrl, linkType, isReadOnly]);

  const handleSave = async () => {
    if (isReadOnly || !webhookSecret.trim()) return;
    setSaving(true);
    await supabase.from('stripe_configs').upsert(
      { user_id: userId, stripe_webhook_secret: webhookSecret.trim() },
      { onConflict: 'user_id' }
    );
    setSaving(false);
    setWebhookSecret('');
    onSecretSaved();
  };

  const maskSecret = (s: string) => s.slice(0, 8) + '••••••••••••' + s.slice(-4);

  return (
    <div className="mt-4 space-y-4 bg-violet-500/5 border border-violet-500/15 rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Webhook size={14} className="text-violet-400" />
          <span className="text-[11px] font-black uppercase tracking-widest text-violet-300">
            Stripe Webhook Setup
          </span>
        </div>
        {isConnected ? (
          <span className="flex items-center gap-1 text-[10px] font-black text-green-400 uppercase tracking-widest">
            <CheckCircle2 size={11} /> Connected
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] font-black text-orange-400 uppercase tracking-widest">
            <AlertCircle size={11} /> Not Connected
          </span>
        )}
      </div>

      {checkoutUrl && (
        <div className="space-y-2 pt-2 border-t border-violet-500/10">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 text-[9px] font-black text-zinc-400 flex items-center justify-center">
              1
            </span>
            <p className="text-[11px] font-bold text-white uppercase tracking-wide">
              Your Checkout URL
            </p>
          </div>
          <p className="text-[11px] text-zinc-500 pl-7 leading-relaxed">
            This is your tracked checkout link. Use this as your &quot;Buy Now&quot; button — it
            routes through VS-Track so purchases are attributed to the correct video.
          </p>
          <div className="flex gap-2 pl-7">
            {trackedUrl ? (
              <>
                <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 font-mono text-[11px] text-zinc-400 break-all">
                  {trackedUrl}
                </div>
                <CopyButton text={trackedUrl} />
              </>
            ) : (
              <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 font-mono text-[11px] text-zinc-600 break-all flex items-center gap-2">
                <Loader2 size={11} className="animate-spin shrink-0" /> Generating tracked
                link…
              </div>
            )}
          </div>
          {trackedUrl && (
            <div className="ml-7 flex gap-2.5 p-3 bg-zinc-900/60 border border-zinc-800 rounded-xl">
              <span className="text-[13px] shrink-0">🔒</span>
              <div className="space-y-1">
                <p className="text-[11px] font-bold text-zinc-300">This link is permanent</p>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Use this as your &quot;Buy Now&quot; button everywhere — your website, landing
                  page, emails, and video descriptions. It never changes, even if you update
                  your Stripe checkout URL later.
                </p>
                <p className="text-[11px] text-zinc-600 leading-relaxed">
                  If you ever switch payment providers or update your checkout URL, just
                  change it in Campaign Settings. Your VS-Track link keeps working
                  automatically — no need to update your website or videos.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2 pt-2 border-t border-violet-500/10">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 text-[9px] font-black text-zinc-400 flex items-center justify-center">
            {checkoutUrl ? '2' : '1'}
          </span>
          <p className="text-[11px] font-bold text-white uppercase tracking-wide">
            Add Webhook in Stripe Dashboard
          </p>
        </div>
        <p className="text-[11px] text-zinc-500 pl-7 leading-relaxed">
          Go to{' '}
          <span className="text-zinc-300 font-bold">
            Stripe Dashboard → Developers → Webhooks → Add endpoint
          </span>
          . Paste the URL below and select event:{' '}
          <code className="text-violet-400">checkout.session.completed</code>
        </p>
        <div className="flex gap-2 pl-7">
          <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 font-mono text-[11px] text-zinc-400 break-all">
            {webhookEndpoint}
          </div>
          <CopyButton text={webhookEndpoint} />
        </div>
      </div>

      <div className="space-y-2 pt-2 border-t border-violet-500/10">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 text-[9px] font-black text-zinc-400 flex items-center justify-center">
            {checkoutUrl ? '3' : '2'}
          </span>
          <p className="text-[11px] font-bold text-white uppercase tracking-wide">
            Paste Your Webhook Signing Secret
          </p>
        </div>
        <p className="text-[11px] text-zinc-500 pl-7 leading-relaxed">
          After creating the endpoint, Stripe shows a{' '}
          <span className="text-zinc-300 font-bold">Signing Secret</span> starting with{' '}
          <code className="text-violet-400">whsec_</code>. Paste it below.
        </p>
        {isConnected && (
          <div className="ml-7 flex items-center gap-2 px-3 py-2 bg-green-500/5 border border-green-500/20 rounded-xl">
            <CheckCircle2 size={11} className="text-green-500 shrink-0" />
            <span className="text-[11px] text-zinc-400 font-mono">
              {maskSecret(stripeConfig!.stripe_webhook_secret!)}
            </span>
            <span className="ml-auto text-[10px] text-green-500 font-black uppercase tracking-widest">
              Active
            </span>
          </div>
        )}
        {!isReadOnly && (
          <div className="pl-7 space-y-2">
            <div className="relative">
              <Key size={13} className="absolute left-3 top-3 text-zinc-600" />
              <input
                type="password"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder="whsec_••••••••••••••••••••••"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 pl-9 pr-4 text-sm text-white font-mono focus:border-violet-500 outline-none transition-all placeholder:text-zinc-700"
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !webhookSecret.trim()}
              className="w-full bg-violet-600 hover:bg-violet-500 text-white h-10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                'Save Webhook Secret'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};