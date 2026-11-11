export function flightDurationLabel(observedAt, takeoffAt, firstSeenAt) {
  const hasTakeoff = Number.isFinite(takeoffAt) && takeoffAt <= observedAt;
  const start = hasTakeoff ? takeoffAt : firstSeenAt;
  if (!Number.isFinite(observedAt) || !Number.isFinite(start) || start > observedAt) return null;
  const minutes = Math.floor((observedAt - start) / 60000);
  const duration = minutes === 0 ? 'moins d’une minute' : minutes < 60 ? minutes + ' min' :
    Math.floor(minutes / 60) + ' h' + (minutes % 60 ? ' ' + minutes % 60 + ' min' : '');
  if (hasTakeoff) return 'En vol depuis ' + (minutes > 0 ? 'environ ' : '') + duration;
  return minutes === 0 ? 'Observé depuis moins d’une minute' : 'En vol depuis au moins ' + duration;
}
