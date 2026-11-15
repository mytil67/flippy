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
