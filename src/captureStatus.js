const parisDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });

export const captureFlightKey = plane => `${plane.id}:${plane.callsign ?? ''}`;

export function captureStatus(capturedAt, now) {
  if (!capturedAt) return undefined;
  const captured = new Date(capturedAt);
  if (!Number.isFinite(captured.getTime())) return undefined;
  return parisDay.format(captured) === parisDay.format(now) ? 'today' : 'previous';
}

export const captureLabels = { today: 'Capturé aujourd’hui', previous: 'Capturé un jour précédent' };
