export function goUrl(url: string): string {
  if (!url) return "#";
  const normalized = url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`;
  return `/api/go?url=${btoa(normalized)}`;
}

const CONTACT_PATTERNS = [
  /mailto:/i,
  /tel:/i,
  /telnet:/i,
  /callto:/i,
  /%40/i,
  /@[a-z0-9.-]+\.[a-z]{2,}/i,
];

export function hasContactInfo(url: string): boolean {
  return CONTACT_PATTERNS.some(p => p.test(url));
}
