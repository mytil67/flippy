import { distanceKm } from './flight.js';

export function reconcileRoute(reported, departure, checking = false) {
  if (checking) return reported ? { ...reported, from: undefined, to: undefined } : null;
  if (!departure) return reported?.from || reported?.to ? { ...reported, unverified: true } : reported;

  const origin = reported?.from;
  const originKnown = Number.isFinite(origin?.lat) && Number.isFinite(origin?.lon);
  const agrees = originKnown &&
    distanceKm([departure.lat, departure.lon], [origin.lat, origin.lon]) <= 25 &&
    (!departure.airport || origin.code?.length !== 3 || departure.airport.code === origin.code);
  const evidence = departure.inferred ? { probableDeparture: true } : { observedDeparture: true };
  if (agrees) return { ...reported, from: departure.airport ?? origin, ...evidence };

  return {
    ...reported,
    from: departure.airport,
    to: undefined,
    number: originKnown ? undefined : reported?.number,
    ...(departure.airport ? evidence : {}),
    routeConflict: originKnown,
    reportedOrigin: originKnown ? origin.name || origin.code : undefined
  };
}
