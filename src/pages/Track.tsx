import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { resolveRedirectToken, logRedirectEvent, buildRedirectUrl } from '../lib/redirects';
import { Loader2, AlertCircle } from 'lucide-react';

const TOKEN_PATTERN = /^[A-Za-z0-9]{4}$/;

export default function Track() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState(false);

  useEffect(() => {
    // Not a valid 4-char token — this is an app route, send to dashboard
    if (!token || !TOKEN_PATTERN.test(token)) {
      navigate('/dashboard', { replace: true });
      return;
    }

    const handleRedirect = async () => {
      const link = await resolveRedirectToken(token);

      if (!link) {
        setError(true);
        return;
      }

      // Redirect FIRST, log after — don't let logging block the redirect
      window.location.replace(buildRedirectUrl(link));

      // Log in background (non-blocking)
      logRedirectEvent(link).catch(console.error);
    };

    handleRedirect();
  }, [token]);

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center flex-col gap-4">
        <AlertCircle className="text-red-500" size={32} />
        <p className="text-zinc-400 text-sm font-bold uppercase tracking-widest">
          Link not found or expired
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center flex-col gap-4">
      <Loader2 className="text-red-600 animate-spin" size={32} />
      <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">
        Redirecting...
      </p>
    </div>
  );
}
