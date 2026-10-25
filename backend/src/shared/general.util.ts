export function generateSlug(text: string, unique = false): string {
  const base = text.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'content';
  return unique ? `${base}-${Math.random().toString(36).slice(2, 8)}` : base;
}
