import { useMemo, useState } from 'react';
import { AirportPair } from './CollectionAirports.jsx';
import { RouteNetwork } from './CollectionFleet.jsx';

const number = new Intl.NumberFormat('fr-FR');
const distance = item => `${item.estimated ? '≈ ' : ''}${number.format(item.km)} km`;
const views = [['flights', 'Vols les plus longs'], ['destinations', 'Destinations les plus lointaines']];

export default function CollectionDistanceLeaders({ leaders, onOpenCapture }) {
  const [view, setView] = useState('flights');
  const [index, setIndex] = useState(0);
  const items = leaders?.[view] ?? [];
  const active = items[index];
  const mapRoutes = useMemo(() => active?.from && active?.to ? [active] : [], [active]);
  if (!active) return null;
  const title = item => view === 'flights' ? item.flight : item.to?.name || item.arrival;
  return <section className="distance-leaders" aria-labelledby="distance-leaders-title">
    <header>
      <h2 id="distance-leaders-title">Palmarès des distances</h2>
      <p>Distances à vol d’oiseau, de l’aéroport de départ à celui d’arrivée.</p>
    </header>
    <div className="distance-leaders-views" role="group" aria-label="Classement par distance">
      {views.map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => {
        setView(key);
        setIndex(0);
      }}>{label}</button>)}
    </div>
    {view === 'destinations' && <p className="distance-leaders-note">Pour chaque destination, seule la liaison la plus longue apparaît.</p>}
    <div className="distance-leaders-body">
      <div className="distance-leaders-feature">
        <div className="distance-leaders-feature-heading">
          <div><h3>{title(active)}</h3>
            {(view === 'destinations' || active.capture.airline) &&
              <p>{[view === 'destinations' && active.flight, active.capture.airline].filter(Boolean).join(' · ')}</p>}</div>
          <div><strong>{distance(active)}</strong><small>{active.estimated ? 'Trajet annoncé · estimation' : 'Trajet renseigné'}</small></div>
        </div>
        <AirportPair departure={active.departure} arrival={active.arrival} fromName={active.from?.name} toName={active.to?.name} />
        {mapRoutes.length > 0 && <RouteNetwork routes={mapRoutes} selected={active} />}
        <button className="collection-back" type="button" onClick={() => onOpenCapture(active.capture)}>Ouvrir la capture</button>
      </div>
      <ol className="distance-leaders-list">
        {items.map((item, position) => <li key={`${item.flight}:${item.departure}:${item.arrival}`}>
          <button type="button" aria-pressed={index === position} onClick={() => setIndex(position)}>
            <span className="distance-leaders-rank" aria-hidden="true">{position + 1}</span>
            <span className="distance-leaders-item"><strong>{title(item)}</strong>
              <AirportPair departure={item.departure} arrival={item.arrival} fromName={item.from?.name} toName={item.to?.name} /></span>
            <span className="distance-leaders-value"><strong>{distance(item)}</strong>{item.estimated && <small>Estimé</small>}</span>
          </button>
        </li>)}
      </ol>
    </div>
  </section>;
}
