import React, { useEffect, useState } from 'react';
import { syncSession, trackEvent } from '../lib/tracker';
import { translations, Language } from '../lib/i18n';
import { getVideoId, getCampaignId } from '../lib/tracker';

export const useTracker = () => {
  useEffect(() => {
    const init = async () => {
      await syncSession();
      await trackEvent('page_view', null, {
  video_id: getVideoId() ?? undefined,
  campaign_id: getCampaignId() ?? undefined,
});
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
