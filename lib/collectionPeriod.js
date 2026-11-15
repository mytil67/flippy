export const collectionPeriods = [
  ['all', 'Tout l’historique'], ['7', '7 derniers jours'], ['30', '30 derniers jours']
];

export function collectionPeriodStart(value, now = Date.now()) {
  if (value === 'all' || value === null) return null;
  if (value !== '7' && value !== '30') return undefined;
  return new Date(now - Number(value) * 86400000).toISOString();
}
