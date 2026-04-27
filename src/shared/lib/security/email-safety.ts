import { createHash } from 'node:crypto';

export function hashEmailForLogs(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

export function maskEmail(email: string): string {
  const [localPart, domain] = email.trim().split('@');
  if (!localPart || !domain) {
    return '[invalid-email]';
  }

  return `${localPart.slice(0, 1)}***@${domain}`;
}

export function sanitizeEmailHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function validateUrlForEmail(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Email templates require absolute http/https URLs');
  }

  return escapeHtml(parsed.toString());
}

export function formatEmailDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
