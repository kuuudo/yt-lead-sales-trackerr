// src/lib/accessConfig.ts
// Accounts that should always bypass the Pricing Gate (moved verbatim from App.tsx).
export const ALWAYS_ALLOWED_EMAILS = new Set([
  'alinospam2020@gmail.com',
  '178@gmail.com',
  'webmoodofficial@gmail.com',
  'kaksidigitals@gmail.com',
]);

export function isAlwaysAllowedEmail(email: string | null | undefined): boolean {
  return ALWAYS_ALLOWED_EMAILS.has(email?.trim().toLowerCase() ?? '');
}