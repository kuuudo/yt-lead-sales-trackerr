import React, { useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, Rocket, X } from 'lucide-react';
import { publishCampaignElementAsAsset, type PublishedElement } from '../services/asset/publishCampaignElementAsAsset';
import { resolveElementThumbnail, getElementTypeLabel, type CampaignElementType } from '../lib/videoFormatters';

interface PublishAssetButtonProps {
  campaignId: string;
  elementType: CampaignElementType;
  sourceField: string;
  /** The current value of the campaigns column this button is next to — used only to disable the button when empty and to show a preview link. */
  currentUrl: string | null | undefined;
  defaultDisplayName: string;
  /** Already-published row for this sourceField, if any — pass from the parent's publishedElements map. */
  published?: PublishedElement | null;
  onPublished: (element: PublishedElement) => void;
  beforePublish?: () => Promise<void>;
}

export function PublishAssetButton({
  campaignId,
  elementType,
  sourceField,
  currentUrl,
  defaultDisplayName,
  published,
  onPublished,
  beforePublish,
}: PublishAssetButtonProps) {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(defaultDisplayName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (published) {
    return (
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-green-500">
        <CheckCircle2 size={12} />
        Already Published
        <span className="text-zinc-600 normal-case">— {published.display_name}</span>
      </div>
    );
  }

  const handlePublish = async () => {
  setSubmitting(true);
  setError(null);

  try {
    if (beforePublish) {
      await beforePublish();
    }

    const { assetId } = await publishCampaignElementAsAsset({
        campaignId,
        elementType,
        sourceField,
        displayName,
      });
      onPublished({ asset_id: assetId, source_field: sourceField, display_name: displayName, element_type: elementType });
      setOpen(false);
    } catch (e: any) {
      setError(e.message ?? 'Failed to publish');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={!currentUrl}
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-red-500 hover:text-red-400 disabled:text-zinc-700 disabled:cursor-not-allowed"
      >
        <Rocket size={12} />
        Publish as Asset
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white">Publish {getElementTypeLabel(elementType)}</h3>
              <button onClick={() => setOpen(false)} className="text-zinc-500 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <img
              src={resolveElementThumbnail(elementType)}
              alt=""
              className="w-full h-24 object-cover rounded-lg mb-4 bg-zinc-950"
            />

            {error && (
              <div className="text-red-500 text-xs border border-red-900 bg-red-950/30 rounded-lg p-3 mb-4">
                {error}
              </div>
            )}

            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
              Asset Name
            </label>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm mb-4"
            />

            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
              Destination
            </label>
            <a
              href={currentUrl ?? '#'}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white mb-6 truncate"
            >
              <ExternalLink size={12} className="shrink-0" />
              <span className="truncate">{currentUrl}</span>
            </a>

            <button
              onClick={handlePublish}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider px-4 py-3 rounded-lg"
            >
              {submitting ? <Loader2 className="animate-spin" size={14} /> : <Rocket size={14} />}
              Create Asset
            </button>
          </div>
        </div>
      )}
    </>
  );
}
