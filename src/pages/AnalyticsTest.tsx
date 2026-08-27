/**
 * TEMPORARY DEVELOPER VERIFICATION PAGE — DELETE AFTER VERIFICATION
 * ─────────────────────────────────────────────────────────────────
 * Route suggestion: /dev/asset-analytics-verify
 *
 * Purpose: one-click trigger for runAssetAnalyticsVerification() while
 * logged into the real app. Prints the full report to the browser console
 * and shows a compact summary on-page.
 *
 * Does NOT:
 *   - touch AllAssetsAnalytics.tsx
 *   - wire production analytics
 *   - modify engines / archive / redirects
 *
 * REMOVE:
 *   1. This file
 *   2. Its route registration
 *   3. services/asset/__verify_getAssetAnalyticsRows.ts
 */

import React, { useState } from 'react';
import {
  runAssetAnalyticsVerification,
  type VerificationReport,
} from '../services/asset/__verify_getAssetAnalyticsRows';

export default function AssetAnalyticsVerify() {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    setReport(null);
    try {
      const result = await runAssetAnalyticsVerification();
      setReport(result);
      // Full report already console.logged inside the harness
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setError(msg);
      console.error('[AssetAnalyticsVerify] failed', e);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#09090b',
        color: '#e4e4e7',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        padding: 32,
      }}
    >
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <p
          style={{
            color: '#f59e0b',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          Temporary · Developer only · Delete after verification
        </p>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>
          Asset Analytics — Real-Data Verification
        </h1>
        <p style={{ color: '#71717a', fontSize: 13, marginBottom: 24 }}>
          Runs <code>getAssetAnalyticsRows()</code> against your live
          authenticated Supabase session. Full report goes to the browser
          console. Summary appears below.
        </p>

        <button
          onClick={run}
          disabled={running}
          style={{
            background: running ? '#3f3f46' : '#dc2626',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            padding: '12px 20px',
            fontWeight: 800,
            fontSize: 12,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: running ? 'wait' : 'pointer',
          }}
        >
          {running ? 'Running…' : 'Run verification'}
        </button>

        {error && (
          <pre
            style={{
              marginTop: 24,
              padding: 16,
              background: '#450a0a',
              border: '1px solid #7f1d1d',
              borderRadius: 12,
              color: '#fecaca',
              whiteSpace: 'pre-wrap',
              fontSize: 12,
            }}
          >
            {error}
          </pre>
        )}

        {report && (
          <div style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: 14, fontWeight: 800, marginBottom: 12 }}>
              Summary — full detail is in the console
            </h2>
            <pre
              style={{
                padding: 16,
                background: '#18181b',
                border: '1px solid #27272a',
                borderRadius: 12,
                fontSize: 12,
                lineHeight: 1.6,
                overflow: 'auto',
              }}
            >
{`A. Organization boundary: ${report.checks.organizationBoundary}
B. Row identity: ${report.checks.rowIdentity}
C. Type 1 (campaign_element): ${report.checks.type1}
D. Type 2 (video): ${report.checks.type2}
E. Type 3 (resource): ${report.checks.type3}
F. Multi-link_type collapse: ${report.checks.multiLinkTypeCollapse}
G. Metric attribution: ${report.checks.metricAttribution}
H. Archive context: ${report.checks.archiveContext}
I. Historical attribution: ${report.checks.historicalAttribution}
J. Unmatched relationships: ${report.checks.unmatchedRelationships}
K. Duplicate rows: ${report.checks.duplicateRows}
L. Overall readiness: ${report.overall}

rows: ${report.rowCount}
assets: ${report.assetIds.length}
redirect_links: ${report.debug.redirectLinkCount}
identities: ${report.debug.identityCount}

byType: ${JSON.stringify(report.samples.byType)}
notes: ${report.notes.join(' | ') || '(none)'}`}
            </pre>
            <p style={{ color: '#71717a', fontSize: 11, marginTop: 12 }}>
              Open DevTools → Console for the full JSON report (samples,
              metric rows, archive rows, resource rows).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}