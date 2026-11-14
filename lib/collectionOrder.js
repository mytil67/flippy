export const alphabetical = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' }).compare;

export function byName(a, b) {
  return alphabetical(a.name || a.code, b.name || b.code) || alphabetical(a.code, b.code);
}
