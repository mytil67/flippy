import { useEffect, useMemo, useRef, useState } from 'react';
import { collectionRequest } from './collectionRequest.js';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { latLngBounds } from 'leaflet';
import { knownAirline } from '../lib/flight.js';
import { collectionInsights, routeEvidenceGroup, routeReliability } from './collectionInsights.js';
import CollectionAlbum, { AirportCaptures } from './CollectionAlbum.jsx';
import CollectionFleet from './CollectionFleet.jsx';
import { collectionManufacturers } from './collectionManufacturers.js';

const number = new Intl.NumberFormat('fr-FR');
const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' });
const tabs = [['recent', 'Captures'], ['album', 'Catalogue'], ['planes', 'Avions'], ['models', 'Modèles'], ['airlines', 'Compagnies'], ['manufacturers', 'Constructeurs'], ['stats', 'Statistiques']];
const distance = km => km == null ? 'Distance indisponible' : number.format(km) + ' km';
const searchText = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const names = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
const routeStates = {
  confirmed: ['Trajet confirmé', 'confirmed'],
  probable: ['Trajet probable', 'probable'],
  unverified: ['Trajet non vérifié', 'unverified'],
  announced: ['Trajet annoncé', 'unverified'],
  conflict: ['Trajet incohérent écarté', 'conflict'],
  unknown: ['Trajet inconnu', 'unknown']
};

function RouteStatus({ value }) {
  const [label, tone] = routeStates[value] ?? routeStates.unknown;
  return <span className={'route-status route-status-' + tone}>{label}</span>;
}

function ReliabilityFilter({ items, value, onChange }) {
  const groups = useMemo(() => routeReliability(items), [items]);
  if (!items.length) return null;
  return <select aria-label="Filtrer par fiabilité du trajet" value={value} onChange={event => onChange(event.target.value)}>
    <option value="all">Tous les trajets</option>
    {groups.map(group => <option key={group.key} value={group.key}>{routeStates[group.key][0]} ({group.count})</option>)}
  </select>;
}

const aircraftPhotos = {
  a320: ['Airbus A320', 'Patrick Ludolph', 'Lufthansa_Airbus_A320_front-on_view.jpg', 'by/2.0'],
  b738: ['Boeing 737-800', 'AndrewDawes', 'Ryanair_Boeing_737.jpg', 'by-sa/4.0'],
  a359: ['Airbus A350-900', 'Acroterion', 'Air_France_A350-900_F-HTYT_MD1.jpg', 'by-sa/4.0'],
  e190: ['Embraer E190', 'Marcin Jagodziński', 'Embraer_ERJ-190.jpg', 'by-sa/3.0']
};

function photoFor(code = '') {
  if (/^A(31[89]|32[01]|(19|20|21)N)$/.test(code)) return 'a320';
  if (/^B(73[6-9]|3[789]M)$/.test(code)) return 'b738';
  if (/^A35[9K]$/.test(code)) return 'a359';
  if (/^(E19[05]|E29[05])$/.test(code)) return 'e190';
}

function AircraftArt({ code }) {
  const family = photoFor(code || '');
  const photo = aircraftPhotos[family];
  return <figure className="aircraft-art">
    {photo ? <img src={`/aircraft/${family}.jpg`} alt={photo[0]} loading="lazy" /> : <span>{code || '✈'}</span>}
    {photo && code && <strong>{code}</strong>}
    {photo && <figcaption><a href={'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(photo[2])}>{photo[0]} · © {photo[1]}</a>
      {' · '}<a href={`https://creativecommons.org/licenses/${photo[3]}/`}>CC {photo[3].replace('/', ' ').toUpperCase()}</a></figcaption>}
  </figure>;
}

function CompanyLogo({ code, iata, flight, name }) {
  const logo = [iata, code, knownAirline((code || '') + '1')?.iata, flight?.match(/^([A-Z0-9]{2})(?=\d)/i)?.[1]]
    .map(value => value?.trim().toUpperCase()).find(value => /^[A-Z0-9]{2}$/.test(value ?? ''));
  return <AirlineMark key={logo ?? code} logo={logo} fallback={code || logo || '✈'} name={name} />;
}

function AirlineMark({ logo, fallback, name }) {
  const [source, setSource] = useState(0);
  const url = source === 0 ? `https://pics.avs.io/160/54/${logo}.png` : `https://images.kiwi.com/airlines/64/${logo}.png`;
  return <span className="collection-logo">
    {logo && source < 2 ? <img key={source} src={url} alt={name ? `Logo ${name}` : ''} loading="lazy"
      decoding="async" onError={() => setSource(source + 1)} /> : <span className="collection-logo-fallback">{fallback}</span>}
  </span>;
}

function Account({ data, onUpdate }) {
  const [signup, setSignup] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState(null);

  async function act(action, form) {
    setPending(true);
    setFeedback(null);
    try {
      if (action === 'claim') await collectionRequest('?access=claim', { method: 'POST' });
      else await collectionRequest('?action=' + action, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form ? Object.fromEntries(new FormData(form)) : {})
      }, '/api/account');
      const next = await collectionRequest();
      onUpdate(next);
      if (form) form.reset();
      if (action === 'claim') setFeedback({ text: 'Tes captures ont été rattachées à ton compte.' });
      if (action === 'signup' && !next.account) setFeedback({ text: 'Compte créé. Vérifie ton e-mail si Neon te le demande, puis connecte-toi.' });
      if (action === 'login' && !next.account) throw new Error('Autorise les cookies pour rester connecté à FLIPPY.');
      setSignup(false);
    } catch (error) {
      setFeedback({ text: error.message, error: true });
    } finally { setPending(false); }
  }

  return <section id="compte" className="collection-access" aria-labelledby="account-title">
    <h2 id="account-title">{data.account ? 'Mon compte' : signup ? 'Créer un compte' : 'Se connecter'}</h2>
    {data.account ? <>
      <p className="collection-email">{data.account.email}</p>
      {data.localCount > 0 && <div className="collection-import">
        <p>{data.localCount} capture{data.localCount === 1 ? '' : 's'} de ce navigateur à rattacher à ton compte.</p>
        <button type="button" disabled={pending} onClick={() => act('claim')}>Rattacher mes captures</button>
      </div>}
      <button type="button" className="collection-disconnect" disabled={pending} onClick={() => act('logout')}>Se déconnecter</button>
    </> : <>
      <p>Retrouve la même collection sur tes ordinateurs et ton téléphone avec ton e-mail.</p>
      {data.count > 0 && <p>Après la connexion, rattache tes {data.count} captures de ce navigateur à ton compte.</p>}
      <form className="collection-code" onSubmit={event => { event.preventDefault(); act(signup ? 'signup' : 'login', event.currentTarget); }}>
        <label htmlFor="collection-email">Adresse e-mail</label>
        <input id="collection-email" name="email" type="email" autoComplete="email" maxLength={254} required />
        <label htmlFor="collection-password">Mot de passe</label>
        <input id="collection-password" name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} minLength={8} maxLength={128} required />
        <button type="submit" disabled={pending}>{pending ? 'Un instant…' : signup ? 'Créer mon compte' : 'Se connecter'}</button>
      </form>
      <button type="button" className="collection-disconnect" disabled={pending} onClick={() => { setSignup(!signup); setFeedback(null); }}>
        {signup ? 'J’ai déjà un compte' : 'Créer un compte'}
      </button>
    </>}
    {feedback && <p role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
  </section>;
}

function CaptureDetail({ item, onClose }) {
  const dialog = useRef(null);
  const flight = item.flight_number || item.callsign || item.registration || item.aircraft?.toUpperCase();
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return <dialog ref={dialog} className="capture-detail" aria-labelledby="capture-detail-title" onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
    <div className="capture-detail-sheet">
      <AircraftArt code={item.model_code} />
      <div className="capture-detail-content">
        <header>
          <div>
            <p>Capture du {date.format(new Date(item.captured_at))}</p>
            <h2 id="capture-detail-title">{flight}</h2>
            <span>{item.airline || item.model || 'Appareil non identifié'}</span>
          </div>
          <button type="button" aria-label="Fermer la fiche" onClick={() => dialog.current?.close()}>×</button>
        </header>
        {item.departure_code && item.arrival_code ? <div className="capture-detail-route">
          <div><small>Départ</small><strong>{item.departure_code}</strong></div>
          <span aria-hidden="true">✈</span>
          <div><small>Arrivée</small><strong>{item.arrival_code}</strong></div>
        </div> : <p className="capture-detail-unknown">Le trajet n’a pas pu être identifié pour cette capture.</p>}
        <dl className="capture-detail-facts">
          <div><dt>Appareil</dt><dd>{item.model || item.model_code || '—'}</dd></div>
          <div><dt>Immatriculation</dt><dd>{item.registration || '—'}</dd></div>
          <div><dt>Trajet complet</dt><dd>{distance(item.route_km)}</dd></div>
          <div><dt>Trace observée</dt><dd>{distance(item.observed_km)}</dd></div>
        </dl>
        <p className="capture-route-evidence"><RouteStatus value={item.route_status} />
          {item.reported_departure_code && item.reported_arrival_code &&
            <span>Source annoncée : {item.reported_departure_code} → {item.reported_arrival_code}</span>}
        </p>
        {item.airline && <div className="capture-detail-airline"><CompanyLogo code={item.airline_code} iata={item.airline_iata}
          flight={item.flight_number} name={item.airline} /><span>{item.airline}</span></div>}
      </div>
    </div>
  </dialog>;
}

function CollectionCard({ item, tab }) {
  return <li className="collection-card-item"><div className="collection-card">
    <AircraftArt code={tab === 'models' ? item.code : item.model_code} />
    <div className="collection-card-body">
      <h3>{item.name}</h3>
      {tab === 'planes' && item.model && <p>{item.model}</p>}
    </div>
    <div className="collection-card-meta">
      <div><strong>{item.route_km == null ? 'Trajet inconnu' : distance(item.route_km)}</strong>
        <span>{item.route_km != null && ' · trajets cumulés'}</span></div>
      <span>{distance(item.kilometers)}{item.kilometers != null && ' observés'}</span>
      <span>{item.count} capture{item.count === 1 ? '' : 's'}</span></div>
  </div></li>;
}

function CaptureRow({ item, onOpen }) {
  const flight = item.flight_number || item.callsign || item.registration || item.aircraft.toUpperCase();
  return <li><button type="button" className="capture-entry" onClick={() => onOpen(item)}>
    <CompanyLogo code={item.airline_code} iata={item.airline_iata} flight={item.flight_number} name={item.airline} />
    <span className="capture-entry-flight"><strong>{flight}</strong>
      <span>{[item.airline, item.model || item.model_code].filter(Boolean).join(' · ') || 'Appareil non identifié'}</span></span>
    <span className="capture-entry-route"><strong>{item.departure_code || item.arrival_code ? `${item.departure_code || '—'} → ${item.arrival_code || '—'}` : 'Itinéraire inconnu'}</strong>
      <RouteStatus value={item.route_status} /></span>
    <span className="capture-entry-distance"><strong>{item.route_km == null ? '—' : distance(item.route_km)}</strong>
      {item.observed_km != null && <span>{distance(item.observed_km)} observés</span>}
      <time dateTime={item.captured_at}>{date.format(new Date(item.captured_at))}</time></span>
    <span className="capture-entry-arrow" aria-hidden="true">›</span>
  </button></li>;
}

function InsightBars({ items, empty, suffix = 'capture' }) {
  const maximum = Math.max(1, ...items.map(item => item.count));
  return items.length ? <ol className="insight-bars">
    {items.map(item => <li key={item.key ?? item.label} aria-label={`${item.label}, ${item.count} ${suffix}${item.count === 1 ? '' : 's'}`}>
      <div><strong>{item.label}</strong><span>{item.count}</span></div>
      <i aria-hidden="true"><span style={{ width: `${item.count / maximum * 100}%` }} /></i>
    </li>)}
  </ol> : <p className="insight-empty">{empty}</p>;
}

function RecordMapFit({ points }) {
  const map = useMap();
  useEffect(() => {
    const fit = () => {
      map.invalidateSize();
      map.fitBounds(latLngBounds(points), { padding: [34, 34], maxZoom: 5, animate: false });
    };
    const frame = requestAnimationFrame(fit);
    const observer = new ResizeObserver(fit);
    observer.observe(map.getContainer());
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [map, points]);
  return null;
}

function RecordRouteMap({ record }) {
  const fromLat = record.from?.lat;
  const fromLon = record.from?.lon;
  const toLat = record.to?.lat;
  const toLon = record.to?.lon;
  const destinationLon = Number.isFinite(toLon) && Number.isFinite(fromLon)
    ? toLon + Math.round((fromLon - toLon) / 360) * 360 : toLon;
  const points = useMemo(() => [[fromLat, fromLon], [toLat, destinationLon]],
    [fromLat, fromLon, toLat, destinationLon]);
  if (!record.from || !record.to) return <div className="record-map-missing">La carte sera disponible lorsque les coordonnées des aéroports seront connues.</div>;
  const captured = Number.isFinite(record.captured_lat) && Number.isFinite(record.captured_lon)
    ? [record.captured_lat, record.captured_lon + Math.round((record.from.lon - record.captured_lon) / 360) * 360] : null;
  return <MapContainer className="record-route-map" center={points[0]} zoom={3} zoomControl={false}
    scrollWheelZoom={false} dragging={true} attributionControl>
    <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      attribution={'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'} />
    <RecordMapFit points={points} />
    <Polyline positions={points} interactive={false} pathOptions={{ color: '#087a70', weight: 4, dashArray: '3 9' }} />
    <CircleMarker center={points[0]} radius={7} pathOptions={{ color: '#09232d', weight: 2, fillColor: '#8fe1d1', fillOpacity: 1 }}>
      <Tooltip permanent direction="top"><strong>{record.from.code}</strong> · {record.from.name}</Tooltip>
    </CircleMarker>
    <CircleMarker center={points[1]} radius={7} pathOptions={{ color: '#09232d', weight: 2, fillColor: '#ff714a', fillOpacity: 1 }}>
      <Tooltip permanent direction="bottom"><strong>{record.to.code}</strong> · {record.to.name}</Tooltip>
    </CircleMarker>
    {captured && <CircleMarker center={captured} radius={6} pathOptions={{ color: '#fff', weight: 2, fillColor: '#0966b3', fillOpacity: 1 }}>
      <Tooltip direction="top">Position de ta capture</Tooltip>
    </CircleMarker>}
  </MapContainer>;
}

function RecordFlight({ record }) {
  const encounters = record.encounterCount ?? record.history?.length ?? 1;
  const routeCaptures = record.routeCaptureCount ?? 1;
  return <section id="record-flight" className="record-flight" aria-labelledby="record-flight-title">
    <header>
      <div><p>Ton record de distance</p><h2 id="record-flight-title">{record.flight}</h2>
        {record.airline && <span>{record.airline}</span>}</div>
      <div className="record-flight-distance"><strong>{distance(record.kilometers)}</strong><RouteStatus value={record.route_status} /></div>
    </header>
    <div className="record-flight-route">
      <div><small>Départ</small><strong>{record.departure_code}</strong><span>{record.from?.name || 'Aéroport identifié'}</span></div>
      <b aria-hidden="true">✈</b>
      <div><small>Arrivée</small><strong>{record.arrival_code}</strong><span>{record.to?.name || 'Aéroport identifié'}</span></div>
    </div>
    <div className="record-flight-layout">
      <RecordRouteMap record={record} />
      <div className="record-flight-log">
        <div className="record-flight-facts">
          <p><strong>{encounters}</strong><span>capture{encounters === 1 ? '' : 's'} de cet appareil</span></p>
          <p><strong>{routeCaptures}</strong><span>fois sur cette route</span></p>
          <p><strong>{record.registration || '—'}</strong><span>{record.model || record.model_code || 'Appareil non identifié'}</span></p>
          <p><strong>{record.observed_km == null ? '—' : distance(record.observed_km)}</strong><span>trace ADS-B observée</span></p>
        </div>
        <h3>{encounters > 1 ? 'Tes rencontres avec cet appareil' : 'Première rencontre avec cet appareil'}</h3>
        <ol className="record-history">
          {(record.history ?? []).map((capture, index) => <li key={`${capture.captured_at}:${index}`}>
            <time dateTime={capture.captured_at}>{date.format(new Date(capture.captured_at))}</time>
            <span>{capture.departure_code && capture.arrival_code
              ? `${capture.departure_code} → ${capture.arrival_code}` : 'Trajet non identifié'}</span>
            {capture.route_km != null && <strong>{distance(capture.route_km)}</strong>}
          </li>)}
        </ol>
        {encounters > (record.history?.length ?? 0) && <p className="record-history-more">Les {record.history?.length ?? 0} rencontres les plus récentes sont affichées.</p>}
      </div>
    </div>
  </section>;
}

function CollectionInsights({ data, onOpenCapture }) {
  const insights = useMemo(() => collectionInsights(data), [data]);
  const [selected, setSelected] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState('frequency');
  const routes = sort === 'distance' ? [...insights.routes].sort((a, b) => (b.distance ?? -1) - (a.distance ?? -1)) : insights.routes;
  const namedAirport = (code, airports) => airports.find(item => item.code === code)?.name || code;
  return <section className="collection-insights" aria-labelledby="insights-title">
    <header>
      <div><h2 id="insights-title">Ce que raconte ton ciel</h2>
        <p>Les liaisons recensées dans ton carnet.</p></div>
      <span>{insights.routeCoverage} % des captures avec une distance de trajet</span>
    </header>
    <section className="insight-routes" aria-labelledby="routes-title">
      <div className="insight-route-heading"><h3 id="routes-title">Classement des liaisons</h3>
        {routes.length > 1 && <select aria-label="Trier les liaisons" value={sort} onChange={event => { setSort(event.target.value); setSelected(''); }}>
          <option value="frequency">Les plus fréquentes</option><option value="distance">Les plus longues</option>
        </select>}</div>
      {routes.length ? <>
        <ol className="insight-route-list">
          {(showAll ? routes : routes.slice(0, 8)).map(route => <li key={route.label}>
            <button type="button" aria-pressed={selected === route.label} onClick={() => setSelected(value => value === route.label ? '' : route.label)}>
              <span className="insight-route-name"><strong>{route.label}</strong><small>{namedAirport(route.departure, insights.origins)} → {namedAirport(route.arrival, insights.destinations)}</small></span>
              <span className="insight-route-facts"><strong>{route.count} vol{route.count === 1 ? '' : 's'} recensé{route.count === 1 ? '' : 's'}</strong>
                {route.distance != null && <small>{distance(route.distance)} à vol d’oiseau</small>}</span>
            </button>
            {selected === route.label && <div className="insight-route-detail">
              {route.supported != null && <p>{route.supported} sur {route.count} avec un trajet confirmé ou probable</p>}
              <h4>Compagnies recensées sur cette liaison</h4>
              <InsightBars items={route.airlines.map(item => ({ ...item, label: item.name, key: item.code }))} suffix="vol" empty="Aucune compagnie identifiée pour cette liaison." />
              <AirportCaptures airport={{ code: route.departure }} route={route} onOpenCapture={onOpenCapture} />
            </div>}
          </li>)}
        </ol>
        {insights.routes.length > 8 && <button className="collection-back" type="button" aria-expanded={showAll} onClick={() => {
          if (showAll && routes.findIndex(route => route.label === selected) >= 8) setSelected('');
          setShowAll(value => !value);
        }}>{showAll ? 'Voir les 8 premières' : `Voir les ${insights.routes.length} liaisons`}</button>}
      </> : <p className="insight-empty">Les liaisons apparaîtront dès qu’une capture aura un départ et une arrivée identifiés.</p>}
    </section>
    <div className="insight-grid insight-airport-rankings">
      <section><h3>Aéroports de départ</h3><InsightBars items={insights.origins.slice(0, 5)} suffix="vol" empty="Aucun départ identifié." /></section>
      <section><h3>Aéroports d’arrivée</h3><InsightBars items={insights.destinations.slice(0, 5)} suffix="vol" empty="Aucune arrivée identifiée." /></section>
    </div>
  </section>;
}

export default function Collection() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(() => window.location.hash === '#record-flight' ? 'stats' : 'recent');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('default');
  const [routeFilter, setRouteFilter] = useState('all');
  const [accountOpen, setAccountOpen] = useState(window.location.hash === '#compte');
  const [attempt, setAttempt] = useState(0);
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    document.title = 'Ma collection — Flippy';
    const controller = new AbortController();
    collectionRequest('', { signal: controller.signal }).then(setData).catch(error => {
      if (!controller.signal.aborted) setError(error.message);
    });
    return () => controller.abort();
  }, [attempt]);

  const browsing = ['recent', 'planes', 'models'].includes(tab);
  const manufacturers = useMemo(() => collectionManufacturers(data?.models ?? []), [data?.models]);
  const items = browsing ? data?.[tab] ?? [] : [];
  const term = searchText(query.trim());
  const reliableItems = tab === 'recent' && routeFilter !== 'all'
    ? items.filter(item => routeEvidenceGroup(item.route_status) === routeFilter) : items;
  const filtered = term ? reliableItems.filter(item => searchText([
    item.name, item.code, item.flight_number, item.callsign, item.registration, item.aircraft,
    item.model, item.model_code, item.airline, item.airline_code, item.airline_iata, item.departure_code, item.arrival_code
  ].filter(Boolean).join(' ')).includes(term)) : reliableItems;
  const visible = sort === 'distance' ? [...filtered].sort((a, b) =>
    (b.route_km ?? -1) - (a.route_km ?? -1)) :
    sort === 'name' ? [...filtered].sort((a, b) => names.compare(a.name ?? a.flight_number ?? a.callsign, b.name ?? b.flight_number ?? b.callsign)) : filtered;
  const showAccount = Boolean(data && (!data.account || data.localCount || accountOpen));

  function changeTab(next) {
    setTab(next);
    setQuery('');
    setSort('default');
    setRouteFilter('all');
  }

  return <main className="collection-page">
    <div className="collection">
      <nav className="collection-topbar" aria-label="Navigation Flippy">
        <span className="collection-brand">flippy<span>.</span></span>
        <div>
          <a href="/" className="collection-back">← Retour au radar</a>
          {data?.account && !data.localCount && <button type="button" className="collection-back" aria-expanded={accountOpen}
            aria-controls={showAccount ? 'compte' : undefined} onClick={() => setAccountOpen(value => !value)}>Mon compte</button>}
        </div>
      </nav>
      <header className="collection-header">
        <h1>Mon carnet de vol</h1>
      </header>
      {error ? <div className="collection-empty"><p role="alert">{error}</p><button type="button" onClick={() => {
        setError(''); setAttempt(value => value + 1);
      }}>Réessayer</button></div> : !data ? <p role="status" className="collection-empty">Chargement…</p> : <div className={'collection-layout' + (showAccount ? ' has-account' : '')}>
        <section className="collection-board" aria-label="Tableau de chasse">
          <dl className="collection-stats">
            <div><dt>Captures</dt><dd>{number.format(data.count)}</dd><span>{number.format(data.aircraft)} avion{data.aircraft === 1 ? '' : 's'} distinct{data.aircraft === 1 ? '' : 's'}</span></div>
            <div><dt>Distance des trajets</dt><dd>{data.routeKilometers == null ? '—' : distance(data.routeKilometers)}</dd><span>Entre aéroports, à vol d’oiseau</span></div>
            <div><dt>Distance observée</dt><dd>{distance(data.kilometers)}</dd><span>Positions reçues par ADS-B</span></div>
          </dl>
          <nav className="collection-tabs" aria-label="Vues de la collection">
            {tabs.map(([key, label]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => { if (key !== tab) changeTab(key); }}>
              {label}
            </button>)}
          </nav>
          {tab === 'album' && <CollectionAlbum data={data} onOpenCapture={setDetail} />}
          {tab === 'airlines' && <CollectionFleet key="airlines" items={data.airlines ?? []} CompanyLogo={CompanyLogo} />}
          {tab === 'manufacturers' && <CollectionFleet key="manufacturers" items={manufacturers} />}
          {tab === 'stats' && (data.count ? <>
            <CollectionInsights data={data} onOpenCapture={setDetail} />
            {data.record && <RecordFlight record={data.record} />}
          </> : <p className="collection-empty">Tes statistiques apparaîtront après ta première capture.</p>)}
          {browsing && items.length > 0 && <div className="collection-filters">
            <input type="search" aria-label="Rechercher dans cette vue" placeholder="Rechercher dans cette vue" value={query} onChange={event => setQuery(event.target.value)} />
            {tab === 'recent' && <ReliabilityFilter items={items} value={routeFilter} onChange={setRouteFilter} />}
            <select aria-label="Trier les résultats" value={sort} onChange={event => setSort(event.target.value)}>
              <option value="default">{tab === 'recent' ? 'Plus récentes' : 'Kilomètres des trajets cumulés'}</option>
              {tab === 'recent' && <option value="distance">Plus longs trajets</option>}
              <option value="name">Ordre alphabétique</option>
            </select>
          </div>}
          {browsing && (term || routeFilter !== 'all') && <p className="collection-note collection-result" role="status">{visible.length} résultat{visible.length === 1 ? '' : 's'}</p>}
          {browsing && (visible.length ? <ul className={tab === 'recent' ? 'capture-entries' : 'collection-list'} aria-label={tabs.find(([key]) => key === tab)[1]}>
            {visible.map(item => tab === 'recent' ? <CaptureRow key={`${item.aircraft}:${item.callsign}:${item.captured_at}`} item={item} onOpen={setDetail} /> :
              <CollectionCard key={item.code} item={item} tab={tab} />)}
          </ul> : <div className="collection-empty">
            {term ? <p>Aucun résultat pour cette recherche.</p> : routeFilter !== 'all' ? <p>Aucune capture avec ce niveau de fiabilité.</p> : data.count ? <p>Aucune entrée dans cette catégorie.</p> : <>
              <p>Sélectionne un avion en direct et clique sur « Capturer » pour commencer.</p>
              <a className="collection-back" href="/">Ouvrir le radar</a>
            </>}
          </div>)}
        </section>
        {showAccount && <Account data={data} onUpdate={next => { setData(next); changeTab('recent'); }} />}
      </div>}
      {detail && <CaptureDetail item={detail} onClose={() => setDetail(null)} />}
    </div>
  </main>;
}
