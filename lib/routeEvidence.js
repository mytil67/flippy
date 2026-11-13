import { distanceKm } from './flight.js';

export function routeDistance(route) {
  const { from, to } = route ?? {};
  const valid = airport => Number.isFinite(airport?.lat) && Math.abs(airport.lat) <= 90 &&
    Number.isFinite(airport?.lon) && Math.abs(airport.lon) <= 180;
  if (route?.routeConflict || route?.unverified || !valid(from) || !valid(to)) return null;
  return Math.round(distanceKm([from.lat, from.lon], [to.lat, to.lon]));
}

export function routeStatus(route) {
  if (route?.routeConflict) return 'conflict';
  if (route?.historicalRoute && (route.observedDeparture || route.probableDeparture)) return 'probable';
  if (route?.observedDeparture) return 'confirmed';
  if (route?.probableDeparture) return 'probable';
  if (route?.unverified) return 'unverified';
  return route?.from || route?.to ? 'announced' : 'unknown';
}

const coordinates = point => Array.isArray(point) ? point : [point?.lat, point?.lon];
const validPoint = point => {
  const [lat, lon] = coordinates(point);
  return Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180;
};

function bearing(from, to) {
  const radians = Math.PI / 180;
  const [lat1, lon1] = coordinates(from).map(value => value * radians);
  const [lat2, lon2] = coordinates(to).map(value => value * radians);
  const angle = Math.atan2(
    Math.sin(lon2 - lon1) * Math.cos(lat2),
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1)
  ) / radians;
  return (angle + 360) % 360;
}

function headingDifference(first, second) {
  return Math.abs((first - second + 540) % 360 - 180);
}

export function validateRouteDirection(route, plane, segments = []) {
  if (!route?.from || !route?.to || route.routeConflict || !validPoint(route.from) ||
      !validPoint(route.to) || !validPoint(plane) || !Number.isFinite(plane?.heading) ||
      !Number.isFinite(plane?.speed) || plane.speed < 160) return route;

  const current = coordinates(plane);
  const from = coordinates(route.from);
  const to = coordinates(route.to);
  const legDistance = distanceKm(from, to);
  const fromDistance = distanceKm(from, current);
  const toDistance = distanceKm(current, to);
  const headingAway = headingDifference(plane.heading, bearing(current, to));
  if (legDistance < 300 || fromDistance < 60 || toDistance < 80 || headingAway < 110) return route;

  const track = segments.at(-1) ?? [];
  const earlier = [...track].reverse().find(point => validPoint(point) && distanceKm(coordinates(point), current) >= 25);
  const movingAway = earlier && toDistance - distanceKm(coordinates(earlier), to) >= 12;
  const clearlyOpposite = fromDistance >= 150 && legDistance >= 500 && headingAway >= 140;
  if (!movingAway && !clearlyOpposite) return route;

  return {
    ...route,
    number: undefined,
    to: undefined,
    unverified: undefined,
    routeConflict: true,
    directionConflict: true,
    reportedDestination: route.to.name || route.to.code
  };
}

export function resolveFlightRoute(details, departure, plane, segments = [], checking = false) {
  const scheduled = details?.scheduledRoute;
  if (!checking && scheduled && plane?.id === scheduled.aircraft && plane.callsign === scheduled.callsign &&
      plane.observedAt >= scheduled.start && plane.observedAt < scheduled.end) {
    const route = validateRouteDirection(reconcileRoute({ ...details, from: scheduled.from, to: scheduled.to }, departure), plane, segments);
    return { ...route, unverified: undefined };
  }
  const current = validateRouteDirection(reconcileRoute(details, departure, checking), plane, segments);
  if (checking || !validPoint(plane)) return current;

  const observed = plane.observedAt / 1000;
  if (!Number.isFinite(observed)) return current;
  const observationDay = new Date(plane.observedAt ?? NaN).toJSON()?.slice(0, 10);
  const groups = new Map();
  const exact = new Map();
  for (const item of details?.historicalRoutes ?? []) {
    const key = `${item.from.code}:${item.to.code}`;
    if (item.aircraft === plane.id && Number.isFinite(item.firstSeen) && Number.isFinite(item.lastSeen) &&
        item.firstSeen <= observed && observed <= item.lastSeen) exact.set(key, item);
    if (item.day >= observationDay) continue;
    const group = groups.get(key) ?? { ...item, days: new Set() };
    group.days.add(item.day);
    groups.set(key, group);
  }
  if (!exact.size && !current?.routeConflict && current?.from && current?.to) return current;
  const candidates = exact.size ? [...exact.values()] : [...groups.values()];
  const compatible = candidates.flatMap(item => {
    const number = details.from?.code === item.from.code && details.to?.code === item.to.code ? details.number : undefined;
    const reconciled = reconcileRoute({ ...details, number, from: item.from, to: item.to }, departure);
    const route = exact.size ? reconciled : validateRouteDirection(reconciled, plane, segments);
    if (route.routeConflict || !route.to) return [];
    if (!exact.size) {
      const corroborated = route.observedDeparture || route.probableDeparture;
      const single = item.days.size === 1;
      if (single && !corroborated) return [];
      if (!Number.isFinite(plane.heading) || !Number.isFinite(plane.speed) || plane.speed < 160 ||
          headingDifference(plane.heading, bearing(plane, item.to)) > (single ? 45 : 85)) return [];
    }
    return [{ ...route, unverified: exact.size ? undefined : route.unverified, historicalRoute: true }];
  });
  if (compatible.length === 1) return compatible[0];
  if (exact.size > 1) return { ...current, number: undefined, to: undefined };
  return current;
}

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
