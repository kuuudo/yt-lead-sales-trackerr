import React, { useEffect, useState } from 'react';
import { syncSession, trackEvent } from '../lib/tracker';
import { translations, Language } from '../lib/i18n';

export const useTracker = () => {
  useEffect(() => {
    const init = async () => {
      await syncSession();
      await trackEvent('page_view');
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
