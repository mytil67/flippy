export function AirportLabel({ code, name, label }) {
  return <span className="collection-airport-label">
    {label && <small>{label}</small>}
    <strong>{code || '—'}</strong>
    {code && <small>{name && name !== code ? name : 'Nom indisponible'}</small>}
  </span>;
}

export function AirportPair({ departure, arrival, fromName, toName, separator = '→', labeled = false }) {
  if (!departure && !arrival) return 'Trajet non identifié';
  return <span className="collection-airport-pair">
    <AirportLabel code={departure} name={fromName} label={labeled ? 'Départ' : undefined} />
    <span className="collection-airport-separator">{separator}</span>
    <AirportLabel code={arrival} name={toName} label={labeled ? 'Arrivée' : undefined} />
  </span>;
}

export const routeStates = {
  confirmed: ['Trajet confirmé', 'confirmed'],
  probable: ['Trajet probable', 'probable'],
  unverified: ['Trajet non vérifié', 'unverified'],
  announced: ['Trajet annoncé', 'unverified'],
  conflict: ['Trajet incohérent écarté', 'conflict'],
  unknown: ['Trajet inconnu', 'unknown']
};

export function RouteStatus({ value, label }) {
  const [defaultLabel, tone] = routeStates[value] ?? routeStates.unknown;
  return <span className={'route-status route-status-' + tone}>{label ?? defaultLabel}</span>;
}

export function CaptureRoute({ item, labeled = false }) {
  const stored = { departure: item.departure_code, arrival: item.arrival_code,
    fromName: item.departure_name, toName: item.arrival_name };
  const reported = { departure: item.reported_departure_code, arrival: item.reported_arrival_code,
    fromName: item.reported_departure_name, toName: item.reported_arrival_name };
  const hasStored = Boolean(stored.departure || stored.arrival);
  const hasReported = Boolean(reported.departure || reported.arrival);
  const announcedOnly = hasReported && !hasStored;
  const showAlternative = hasStored && ((reported.departure && reported.departure !== stored.departure) ||
    (reported.arrival && reported.arrival !== stored.arrival));
  const conflict = item.route_status === 'conflict';
  return <span className="capture-route">
    {(hasStored || hasReported) && <AirportPair {...(announcedOnly ? reported : stored)} labeled={labeled} />}
    <RouteStatus value={announcedOnly && !conflict ? 'unverified' : item.route_status}
      label={announcedOnly && !conflict ? 'Trajet annoncé · non vérifié' : undefined} />
    {(showAlternative || (announcedOnly && conflict)) && <span className="capture-route-source">
      <small>Trajet annoncé par la source</small>
      {showAlternative && <AirportPair {...reported} />}
    </span>}
  </span>;
}
