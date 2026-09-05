import React, { useEffect, useState } from 'react';
import { syncSession, trackEvent, trackInternalPageView } from '../lib/tracker';
import { translations, Language } from '../lib/i18n';
import { useLocation } from 'react-router-dom';
import { getVideoId, getCampaignId } from '../lib/tracker';

// Phase 1 — forward-only internal/customer-facing split.
// Prefix allowlist: only these paths route to events_internal.
// Anything NOT in this list (including every customer-facing /
// token route) falls through to the original trackEvent('page_view', ...)
// path, unchanged from before this change.
const INTERNAL_ROUTE_PREFIXES = [
  '/dashboard',
  '/campaigns',
  '/videos',
  '/assets',
  '/unmapped-videos',
  '/analytics',
  '/installation',
  '/settings',
  '/pricing',
  '/workspace',
  '/marketplace',
  '/operator',
  '/testimonialss',
];

const isInternalRoute = (pathname: string): boolean =>
  INTERNAL_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));

export const useTracker = () => {
  const location = useLocation();

  useEffect(() => {
    const init = async () => {
      await syncSession();

      if (isInternalRoute(location.pathname)) {
        await trackInternalPageView(location.pathname);
      } else {
        await trackEvent('page_view', null, {
          video_id: getVideoId() ?? undefined,
          campaign_id: getCampaignId() ?? undefined,
        });
      }
    };
    init();
  }, []);
};

export const useLanguage = () => {
  const [lang, setLang] = useState<Language>(() => {
    const stored = localStorage.getItem('app_lang');
    if (stored === 'en' || stored === 'tw') return stored;
    return navigator.language.includes('zh') ? 'tw' : 'en';
  });

  const toggleLanguage = () => {
    const next = lang === 'en' ? 'tw' : 'en';
    setLang(next);
    localStorage.setItem('app_lang', next);
  };

  const t = translations[lang];

  return { lang, toggleLanguage, t };
};
