/**
 * src/components/ImportAssetModal.tsx
 *
 * "Paste URL" entry point for the Asset Library. Interaction style follows
 * PublishAssetButton.tsx's modal shell (open state, inline error box,
 * spinner-on-submit) and Videos.tsx's paste-then-preview pattern —
 * UnmappedVideos.tsx was intentionally not consulted (different domain).
 */

import React, { useState, useMemo } from 'react';
import { Loader2, Link2, X, Rocket } from 'lucide-react';
import { importAsset } from '../services/asset/importAsset';
import { identifyResource } from '../services/asset/identifyResource';
import { validateUrl } from '../services/asset/validateUrl';
import {
  RESOURCE_TYPE_LABELS,
  resolveAssetThumbnail,
  type ResourceType,
} from '../lib/videoFormatters';
import { useOrganization } from '../lib/useOrganization';
import type { AssetResource } from '../services/asset/createAssetResource';

interface ImportAssetModalProps {
  onClose: () => void;
  onImported: (assetResource: AssetResource) => void;
}

const RESOURCE_TYPE_OPTIONS = Object.keys(RESOURCE_TYPE_LABELS) as ResourceType[];

export function ImportAssetModal({ onClose, onImported }: ImportAssetModalProps) {
  const { organizationId } = useOrganization();

  const [url, setUrl] = useState('');
  const [assetName, setAssetName] = useState('');
  const [manualResourceType, setManualResourceType] = useState<ResourceType>('website');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cheap + synchronous — recomputed on every keystroke. Only extractMetadata
  // (inside importAsset) is network-bound, deferred to submit.
  const identified = useMemo(() => {
    const validation = validateUrl(url);
    if (!validation.valid) return null;
    return identifyResource(validation.url);
  }, [url]);

  const needsManualResourceType = identified !== null && identified.resourceType === null;

  const handleImport = async () => {
    if (!organizationId) return;
    setSubmitting(true);
    setError(null);
    try {
      const { assetResource } = await importAsset({
        url,
        assetName,
        manualResourceType: needsManualResourceType ? manualResourceType : undefined,
        organizationId,
      });
      onImported(assetResource);
      onClose();
    } catch (e: any) {
      setError(e.message ?? 'Failed to import');
    } finally {
      setSubmitting(false);
    }
  };

  const previewThumbnail = identified
    ? resolveAssetThumbnail({
        thumbnail_url: null,
        resource_type: identified.resourceType ?? manualResourceType,
        platform: identified.platform,
      })
    : null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-white">Import Asset</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white">
            <X size={16} />
          </button>
        </div>

        {previewThumbnail && (
          <img src={previewThumbnail} alt="" className="w-full h-24 object-cover rounded-lg mb-4 bg-zinc-950" />
        )}

        {error && (
          <div className="text-red-500 text-xs border border-red-900 bg-red-950/30 rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

        <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">URL</label>
        <div className="flex items-center gap-2 mb-4">
          <Link2 size={14} className="text-zinc-600 shrink-0" />
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Asset Name</label>
        <input
          value={assetName}
          onChange={e => setAssetName(e.target.value)}
          placeholder="Optional — auto-filled from the link if left blank"
          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm mb-4"
        />

        {needsManualResourceType && (
          <>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
              Resource Type
              <span className="ml-2 text-zinc-600 normal-case font-normal">We couldn't detect this automatically</span>
            </label>
            <select
              value={manualResourceType}
              onChange={e => setManualResourceType(e.target.value as ResourceType)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm mb-4"
            >
              {RESOURCE_TYPE_OPTIONS.map(rt => (
                <option key={rt} value={rt}>{RESOURCE_TYPE_LABELS[rt]}</option>
              ))}
            </select>
          </>
        )}

        <button
          onClick={handleImport}
          disabled={submitting || !url.trim()}
          className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wider px-4 py-3 rounded-lg"
        >
          {submitting ? <Loader2 className="animate-spin" size={14} /> : <Rocket size={14} />}
          Import
        </button>
      </div>
    </div>
  );
}