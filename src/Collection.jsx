import { useEffect, useMemo, useRef, useState } from 'react';
import { collectionRequest } from './collectionRequest.js';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { latLngBounds } from 'leaflet';
import { knownAirline } from '../lib/flight.js';
import { collectionInsights } from './collectionInsights.js';
import CollectionAlbum, { AirportCaptures } from './CollectionAlbum.jsx';
import CollectionFleet, { RouteNetwork } from './CollectionFleet.jsx';
import { AirportLabel, AirportPair } from './CollectionAirports.jsx';
import { collectionManufacturers } from './collectionManufacturers.js';
import { alphabetical, byName } from '../lib/collectionOrder.js';
import { collectionPeriods } from '../lib/collectionPeriod.js';

const number = new Intl.NumberFormat('fr-FR');
const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' });
const tabs = [['stats', 'Vue d’ensemble'], ['recent', 'Captures'], ['airlines', 'Compagnies'], ['manufacturers', 'Constructeurs'], ['planes', 'Avions'], ['models', 'Modèles'], ['album', 'Catalogue']];
const distance = km => km == null ? 'Distance indisponible' : number.format(km) + ' km';
const searchText = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const captureName = item => item.flight_number || item.callsign || item.registration || item.aircraft.toUpperCase();
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
        {item.departure_code || item.arrival_code ? <div className="capture-detail-route">
          <AirportPair departure={item.departure_code} arrival={item.arrival_code}
            fromName={item.departure_name} toName={item.arrival_name} labeled />
        </div> : <p className="capture-detail-unknown">Le trajet n’a pas pu être identifié pour cette capture.</p>}
        <dl className="capture-detail-facts">
          <div><dt>Appareil</dt><dd>{item.model || item.model_code || '—'}</dd></div>
          <div><dt>Immatriculation</dt><dd>{item.registration || '—'}</dd></div>
          <div><dt>Trajet complet</dt><dd>{distance(item.route_km)}</dd></div>
          <div><dt>Trace observée</dt><dd>{distance(item.observed_km)}</dd></div>
        </dl>
        <div className="capture-route-evidence"><RouteStatus value={item.route_status} />
          {item.reported_departure_code && item.reported_arrival_code &&
            <span className="capture-route-source">Source annoncée <AirportPair departure={item.reported_departure_code} arrival={item.reported_arrival_code}
              fromName={item.reported_departure_name} toName={item.reported_arrival_name} /></span>}
        </div>
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
  const flight = captureName(item);
  return <li><button type="button" className="capture-entry" onClick={() => onOpen(item)}>
    <CompanyLogo code={item.airline_code} iata={item.airline_iata} flight={item.flight_number} name={item.airline} />
    <span className="capture-entry-flight"><strong>{flight}</strong>
      <span>{[item.airline, item.model || item.model_code].filter(Boolean).join(' · ') || 'Appareil non identifié'}</span></span>
    <span className="capture-entry-route"><AirportPair departure={item.departure_code} arrival={item.arrival_code}
      fromName={item.departure_name} toName={item.arrival_name} />
      <RouteStatus value={item.route_status} /></span>
    <span className="capture-entry-distance"><strong>{item.route_km == null ? '—' : distance(item.route_km)}</strong>
      {item.observed_km != null && <span>{distance(item.observed_km)} observés</span>}
      <time dateTime={item.captured_at}>{date.format(new Date(item.captured_at))}</time></span>
    <span className="capture-entry-arrow" aria-hidden="true">›</span>
  </button></li>;
}

function InsightBars({ items, empty, suffix = 'capture', showAirportNames = false }) {
  const maximum = Math.max(1, ...items.map(item => item.count));
  return items.length ? <ol className="insight-bars">
    {items.map(item => <li key={item.key ?? item.label} aria-label={[item.label, showAirportNames && item.name !== item.code && item.name,
      `${item.count} ${suffix}${item.count === 1 ? '' : 's'}`].filter(Boolean).join(', ')}>
      <div>{showAirportNames ? <AirportLabel code={item.code} name={item.name} /> : <strong>{item.label}</strong>}<span>{item.count}</span></div>
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
      <Tooltip permanent direction="top"><AirportLabel {...record.from} /></Tooltip>
    </CircleMarker>
    <CircleMarker center={points[1]} radius={7} pathOptions={{ color: '#09232d', weight: 2, fillColor: '#ff714a', fillOpacity: 1 }}>
      <Tooltip permanent direction="bottom"><AirportLabel {...record.to} /></Tooltip>
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
      <AirportPair departure={record.departure_code} arrival={record.arrival_code}
        fromName={record.from?.name} toName={record.to?.name} labeled />
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
            <span className="record-history-route"><AirportPair departure={capture.departure_code} arrival={capture.arrival_code}
              fromName={capture.departure_name} toName={capture.arrival_name} /></span>
            {capture.route_km != null && <strong>{distance(capture.route_km)}</strong>}
          </li>)}
        </ol>
        {encounters > (record.history?.length ?? 0) && <p className="record-history-more">Les {record.history?.length ?? 0} rencontres les plus récentes sont affichées.</p>}
      </div>
    </div>
  </section>;
}

function CollectionLookup({ count, onFlights }) {
  const [lookup, setLookup] = useState('');
  return <section className="collection-lookup">
      <h2>Vols déjà vus</h2>
      <form onSubmit={event => { event.preventDefault(); onFlights(lookup.trim()); }}>
        <input type="search" aria-label="Rechercher dans toutes les captures" placeholder="N° de vol, immatriculation ou aéroport" value={lookup}
          onChange={event => setLookup(event.target.value)} />
        <button type="submit" className="collection-back">Rechercher</button>
      </form>
      <button type="button" className="collection-back" onClick={() => onFlights('')}>Voir les {number.format(count)} captures</button>
    </section>;
}

function CollectionAnalysis({ data, manufacturers, onManufacturers, onFlight, onOpenCapture, period }) {
  const [view, setView] = useState('flights');
  const [sort, setSort] = useState({ key: 'count', ascending: false });
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [repeated, setRepeated] = useState(false);
  const [selected, setSelected] = useState('');
  const [routeScope, setRouteScope] = useState(null);
  const insights = useMemo(() => collectionInsights(data), [data]);
  const network = useMemo(() => insights.routes.map(item => {
    const from = insights.airportByCode.get(item.departure);
    const to = insights.airportByCode.get(item.arrival);
    return { ...item, from, to, detail: item.distance, subtitle: `${from?.name || item.departure} → ${to?.name || item.arrival}` };
  }), [insights]);
  const rows = useMemo(() => view === 'flights' ? (data.frequentFlights ?? []).map(item => ({
    ...item, label: item.flight, subtitle: item.airline, detail: item.last_seen
  })) : view === 'brands' ? manufacturers.map(item => ({
    ...item, label: item.name, detail: item.models.length
  })) : network, [view, data.frequentFlights, manufacturers, network]);
  const term = searchText(query.trim());
  const filtered = useMemo(() => rows.filter(row => (!repeated || view !== 'flights' || row.count > 1) &&
    (!routeScope || routeScope.directions.some(direction => direction.label === row.label)) &&
    (!term || searchText([row.label, row.subtitle, ...(row.airlines ?? []).map(airline => airline.name)].filter(Boolean).join(' ')).includes(term))).sort((a, b) => {
    const x = a[sort.key], y = b[sort.key];
    if (x == null || y == null) return (x == null) - (y == null) || alphabetical(a.label, b.label);
    const order = sort.key === 'label' || (view === 'flights' && sort.key === 'detail') ? alphabetical(x, y) : Number(x) - Number(y);
    return (sort.ascending ? order : -order) || alphabetical(a.label, b.label);
  }), [rows, repeated, view, routeScope, term, sort]);
  const maximum = filtered.reduce((max, row) => Math.max(max, row.count), 1);
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const active = network.find(row => row.label === selected);
  const mapRoutes = useMemo(() => {
    if (view !== 'routes' || (!routeScope && !term)) return network;
    const labels = new Set(filtered.map(route => route.label));
    return network.filter(route => labels.has(route.label));
  }, [view, routeScope, term, network, filtered]);
  const busiest = insights.corridors[0];
  const [busiestFrom, busiestTo] = busiest?.airports ?? [];
  const hub = insights.hubs[0];
  const frequentFlight = data.frequentFlights?.[0];
  const columns = [['label', { flights: 'Vol', brands: 'Constructeur', routes: 'Liaison' }[view]], ['count', 'Captures'],
    ['route_km', 'Km cumulés'], ['detail', { flights: 'Dernière capture', brands: 'Modèles', routes: 'Km par trajet' }[view]]];
  function changePage(next) { setPage(next); setSelected(''); }
  function changeSort(key, ascending) { setSort({ key, ascending }); changePage(1); }
  function changeView(next) {
    setView(next);
    setSort({ key: 'count', ascending: false });
    setQuery('');
    setRouteScope(null);
    changePage(1);
  }
  function selectRoute(route) {
    if (view !== 'routes') changeView('routes');
    const index = (view === 'routes' ? filtered : network).findIndex(item => item.label === route.label);
    if (index >= 0) setPage(Math.floor(index / 10) + 1);
    setSelected(route.label);
  }
  return <>
    {(busiest || frequentFlight?.count > 1 || hub) && <section className="dashboard-summary" aria-labelledby="dashboard-summary-title">
      <h2 id="dashboard-summary-title">À retenir</h2>
      <div className="dashboard-summary-grid">
        {busiest && <a href="#analysis-title" onClick={() => { changeView('routes'); setRouteScope(busiest); }}>
          <span>Liaison la plus empruntée</span>
          <AirportPair departure={busiestFrom} arrival={busiestTo} separator="↔"
            fromName={insights.airportByCode.get(busiestFrom)?.name} toName={insights.airportByCode.get(busiestTo)?.name} />
          <small>{number.format(busiest.count)} captures{busiest.directions.length > 1 && ' · deux sens réunis'}</small></a>}
        {frequentFlight?.count > 1 && <a href="#analysis-title" onClick={() => { changeView('flights'); setRepeated(true); }}>
          <span>Vol le plus fréquent</span><strong>{frequentFlight.flight}</strong>
          <small>{number.format(frequentFlight.count)} captures{frequentFlight.airline && ` · ${frequentFlight.airline}`}</small></a>}
        {hub && <a href="#analysis-title" onClick={() => {
          changeView('routes');
          setRouteScope({ label: hub.code, directions: network.filter(route => route.departure === hub.code || route.arrival === hub.code) });
        }}>
          <span>Aéroport le plus connecté</span><AirportLabel code={hub.code} name={hub.name} />
          <small>{hub.count} aéroport{hub.count === 1 ? '' : 's'} relié{hub.count === 1 ? '' : 's'}</small></a>}
      </div>
    </section>}
    <section className="collection-analysis" aria-labelledby="analysis-title">
      <header><div><h2 id="analysis-title">Analyse des vols</h2><p>Historique des captures · distances à vol d’oiseau entre aéroports</p></div>
        <div className="analysis-links">
          <a className="collection-back analysis-map-link" href="#analysis-map-title">Voir la carte</a>
          {(insights.origins.length > 0 || insights.destinations.length > 0) && <a className="collection-back" href="#dashboard-airports">Aéroports</a>}
        </div></header>
      <div className="analysis-tools">
        <div className="analysis-views" aria-label="Dimension d’analyse">{[['flights', 'Vols'], ['routes', 'Liaisons'], ['brands', 'Constructeurs']].map(([key, label]) =>
          <button key={key} type="button" aria-pressed={view === key} onClick={() => changeView(key)}>{label}</button>)}</div>
        {routeScope && <button className="collection-back" type="button" onClick={() => { setRouteScope(null); changePage(1); }}>{routeScope.label} · Retirer le filtre ×</button>}
        <input type="search" aria-label="Filtrer le tableau d’analyse" placeholder="Filtrer les résultats" value={query} onChange={event => { setQuery(event.target.value); changePage(1); }} />
        {view === 'flights' && <label><input type="checkbox" checked={repeated} onChange={event => { setRepeated(event.target.checked); changePage(1); }} /> Vus plusieurs fois</label>}
        <label className="analysis-mobile-sort">Trier par
          <select value={`${sort.key}:${sort.ascending}`} onChange={event => {
            const [key, direction] = event.target.value.split(':');
            changeSort(key, direction === 'true');
          }}>
            {columns.flatMap(([key, label]) => [false, true].map(ascending =>
              <option key={`${key}:${ascending}`} value={`${key}:${ascending}`}>{label} {ascending ? '↑' : '↓'}</option>))}
          </select>
        </label>
      </div>
      <div className={'analysis-content' + (view === 'routes' ? ' analysis-content-routes' : '')}>
      <div className="analysis-results">
      <div className="analysis-table-wrap">
        <table className="analysis-table" role="table" aria-label="Tableau d’analyse des captures">
          <thead role="rowgroup"><tr role="row">{columns.map(([key, label]) => <th key={key} scope="col" role="columnheader" aria-sort={sort.key !== key ? undefined : sort.ascending ? 'ascending' : 'descending'}>
            <button type="button" onClick={() => changeSort(key, sort.key === key ? !sort.ascending : key === 'label')}>
              {label} <span aria-hidden="true">{sort.key === key ? sort.ascending ? '↑' : '↓' : '↕'}</span></button></th>)}</tr></thead>
          <tbody role="rowgroup">{filtered.slice((page - 1) * 10, page * 10).map(row => <tr role="row" key={row.label} className={selected === row.label ? 'is-selected' : undefined}>
            <th scope="row" role="rowheader"><button type="button" className={view === 'routes' ? 'analysis-route-button' : undefined}
              aria-expanded={view === 'routes' ? selected === row.label : undefined}
              onClick={() => view === 'flights' ? onFlight(row.flight) : view === 'brands' ? onManufacturers(row.code) : setSelected(selected === row.label ? '' : row.label)}>
              {view === 'routes' ? <AirportPair departure={row.departure} arrival={row.arrival}
                fromName={row.from?.name} toName={row.to?.name} /> : <>{row.label}<span aria-hidden="true"> ›</span></>}
            </button>{view !== 'routes' && row.subtitle && <small>{row.subtitle}</small>}</th>
            <td role="cell"><span className="analysis-cell-label">Captures</span><span>{number.format(row.count)}</span><i className="analysis-bar" aria-hidden="true"><i style={{ width: `${row.count / maximum * 100}%` }} /></i></td>
            <td role="cell"><span className="analysis-cell-label">Km cumulés</span>{row.route_km == null ? '—' : number.format(row.route_km)}</td>
            <td role="cell"><span className="analysis-cell-label">{columns[3][1]}</span>{row.detail == null ? '—' : view === 'flights' ? date.format(new Date(row.detail)) : number.format(row.detail)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {!filtered.length && <p className="analysis-empty">Aucun résultat pour ces filtres.</p>}
      <footer><span role="status">{number.format(filtered.length)} résultat{filtered.length === 1 ? '' : 's'}</span>
        {pages > 1 && <nav className="album-pagination" aria-label="Pages du tableau"><button disabled={page <= 1} onClick={() => changePage(page - 1)}>Précédente</button>
          <span>{page} / {pages}</span><button disabled={page >= pages} onClick={() => changePage(page + 1)}>Suivante</button></nav>}</footer>
      </div>
      <section className="analysis-map" aria-labelledby="analysis-map-title">
        <header><h3 id="analysis-map-title">Carte des liaisons</h3>{active && <button className="collection-back" type="button" onClick={() => setSelected('')}>Réinitialiser le zoom</button>}</header>
        {mapRoutes.length > 0 && <p className="analysis-map-summary">{mapRoutes.length} liaisons · {insights.routeCoverage} % des captures avec une distance</p>}
        {mapRoutes.length === 0 && network.length > 0 ? <p>Aucune liaison ne correspond aux filtres.</p> :
          <RouteNetwork routes={mapRoutes} selected={active} onSelect={selectRoute} />}
        {active ? <p><a href="#analysis-route-detail">Voir les captures de cette liaison</a></p> :
          mapRoutes.length > 0 && <p>{mapRoutes.length > 60 ? 'Les 60 liaisons les plus fréquentes sont affichées. ' : ''}Touche un tracé pour explorer la liaison.</p>}
      </section>
      </div>
      {active && <section id="analysis-route-detail" className="analysis-detail" aria-label={`Détail ${active.label}`}>
        <h3><AirportPair departure={active.departure} arrival={active.arrival}
          fromName={active.from?.name} toName={active.to?.name} /></h3>
        {active.supported != null && <p>{active.supported} sur {active.count} captures avec un trajet confirmé ou probable</p>}
        {active.airlines.length > 0 && <InsightBars items={[...active.airlines].sort(byName).map(item => ({ ...item, label: item.name, key: item.code }))} suffix="vol" />}
        <AirportCaptures key={active.label} airport={{ code: active.departure }} route={active} period={period} onOpenCapture={onOpenCapture} />
      </section>}
    </section>
    {(insights.origins.length > 0 || insights.destinations.length > 0) && <section className="collection-insights dashboard-airports" id="dashboard-airports" aria-labelledby="dashboard-airports-title">
      <header><h2 id="dashboard-airports-title">Aéroports les plus fréquents</h2></header>
      <div className="insight-grid">
        <section><h3>Départs</h3><InsightBars items={insights.origins.slice(0, 5)} suffix="vol" empty="Aucun départ identifié." showAirportNames /></section>
        <section><h3>Arrivées</h3><InsightBars items={insights.destinations.slice(0, 5)} suffix="vol" empty="Aucune arrivée identifiée." showAirportNames /></section>
      </div>
    </section>}
  </>;
}

export default function Collection() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('stats');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('name');
  const [routeFilter, setRouteFilter] = useState('all');
  const [capturePage, setCapturePage] = useState(1);
  const [captureResult, setCaptureResult] = useState(null);
  const [flightFilter, setFlightFilter] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [accountOpen, setAccountOpen] = useState(window.location.hash === '#compte');
  const [attempt, setAttempt] = useState(0);
  const [detail, setDetail] = useState(null);
  const [period, setPeriod] = useState('all');
  const [periodResult, setPeriodResult] = useState(null);
  const [periodAttempt, setPeriodAttempt] = useState(0);
  const [drillPeriod, setDrillPeriod] = useState('all');
  useEffect(() => {
    document.title = 'Ma collection — Flippy';
    const controller = new AbortController();
    collectionRequest('', { signal: controller.signal }).then(setData).catch(error => {
      if (!controller.signal.aborted) setError(error.message);
    });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (period === 'all' || !data) return;
    const controller = new AbortController();
    collectionRequest(`?period=${period}`, { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setPeriodResult({ period, data: result });
    }).catch(error => {
      if (!controller.signal.aborted) setPeriodResult({ period, error: error.message });
    });
    return () => controller.abort();
  }, [period, periodAttempt, data]);

  const browsing = ['recent', 'planes', 'models'].includes(tab);
  const dashboard = period === 'all' ? data : periodResult?.period === period ? periodResult.data : null;
  const dashboardError = period !== 'all' && periodResult?.period === period ? periodResult.error : '';
  const metrics = tab === 'stats' ? dashboard : data;
  const modelData = tab === 'stats' || (tab === 'manufacturers' && drillPeriod !== 'all') ? dashboard : data;
  const manufacturers = useMemo(() => collectionManufacturers(modelData?.models ?? []), [modelData?.models]);
  const captureParams = tab === 'recent' && data ? new URLSearchParams({ captures: '', page: capturePage, q: query.trim(),
    sort, evidence: routeFilter, flight: flightFilter, period: drillPeriod }).toString() : '';
  useEffect(() => {
    if (!captureParams) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      collectionRequest('?' + captureParams, { signal: controller.signal }).then(result => {
        if (!controller.signal.aborted) setCaptureResult({ params: captureParams, ...result });
      }).catch(error => {
        if (!controller.signal.aborted) setCaptureResult({ params: captureParams, error: error.message });
      });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [captureParams, attempt]);
  const capturePageData = captureResult?.params === captureParams ? captureResult : null;
  const items = tab === 'recent' ? capturePageData?.items ?? [] : browsing ? data?.[tab] ?? [] : [];
  const term = searchText(query.trim());
  const filtered = tab !== 'recent' && term ? items.filter(item => searchText([
    item.name, item.code, item.flight_number, item.callsign, item.registration, item.aircraft,
    item.model, item.model_code, item.airline, item.airline_code, item.airline_iata, item.departure_code, item.arrival_code
  ].filter(Boolean).join(' ')).includes(term)) : items;
  const visible = tab !== 'recent' && sort === 'name' ? [...filtered].sort(byName) : filtered;
  const showAccount = Boolean(data && (data.localCount || accountOpen));

  function changeTab(next) {
    setTab(next);
    setQuery('');
    setSort('name');
    setRouteFilter('all');
    setCapturePage(1);
    setFlightFilter('');
    setManufacturer('');
    setDrillPeriod('all');
  }

  return <main className={'collection-page' + (tab === 'stats' ? ' collection-dashboard-page' : '')}>
    <div className="collection">
      <nav className="collection-topbar" aria-label="Navigation Flippy">
        <span className="collection-brand">flippy<span>.</span></span>
        <div>
          <a href="/" className="collection-back">← Retour au radar</a>
          {data && !data.localCount && <button type="button" className="collection-back" aria-expanded={showAccount}
            aria-controls={showAccount ? 'compte' : undefined} onClick={() => setAccountOpen(value => !value)}>{data.account ? 'Mon compte' : 'Se connecter'}</button>}
        </div>
      </nav>
      <header className="collection-header">
        <div className="dashboard-heading"><h1>Mon carnet de vol</h1>
          {data && tab === 'stats' && <label>Période d’analyse
            <select value={period} onChange={event => { setPeriod(event.target.value); setPeriodResult(null); }}>
              {collectionPeriods.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>}
        </div>
        {metrics && <dl className="collection-stats">
            <div><dt>Captures</dt><dd>{number.format(metrics.count)}</dd><span>{number.format(metrics.aircraft)} avion{metrics.aircraft === 1 ? '' : 's'} distinct{metrics.aircraft === 1 ? '' : 's'}</span></div>
            <div><dt>Distance des trajets</dt><dd>{metrics.routeKilometers == null ? '—' : distance(metrics.routeKilometers)}</dd><span>Entre aéroports, à vol d’oiseau</span></div>
            <div><dt>Distance observée</dt><dd>{distance(metrics.kilometers)}</dd><span>Positions reçues par ADS-B</span></div>
        </dl>}
      </header>
      {error ? <div className="collection-empty"><p role="alert">{error}</p><button type="button" onClick={() => {
        setError(''); setAttempt(value => value + 1);
      }}>Réessayer</button></div> : !data ? <p role="status" className="collection-empty">Chargement…</p> : <div className="collection-layout">
        {showAccount && <Account data={data} onUpdate={next => { setPeriod('all'); setPeriodResult(null); setCaptureResult(null); setData(next); changeTab('stats'); }} />}
        <section className="collection-board" aria-label="Carnet de vol">
          <nav className="collection-tabs" aria-label="Vues de la collection">
            {tabs.map(([key, label]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => { if (key !== tab) changeTab(key); }}>
              {label}
            </button>)}
          </nav>
          {tab === 'album' && <CollectionAlbum data={data} onOpenCapture={setDetail} />}
          {tab === 'airlines' && <CollectionFleet key="airlines" items={data.airlines ?? []} CompanyLogo={CompanyLogo} />}
          {drillPeriod !== 'all' && <button className="collection-back collection-result" type="button" onClick={() => { setDrillPeriod('all'); setCapturePage(1); }}>
            {collectionPeriods.find(([key]) => key === drillPeriod)?.[1]} · Retirer le filtre ×</button>}
          {tab === 'manufacturers' && <CollectionFleet key="manufacturers" items={manufacturers} initialCode={manufacturer} period={drillPeriod} />}
          {tab === 'stats' && data.count > 0 && <CollectionLookup count={data.count} onFlights={value => { changeTab('recent'); setQuery(value); }} />}
          {tab === 'stats' && (dashboardError ? <div className="collection-empty"><p role="alert">{dashboardError}</p>
            <button type="button" onClick={() => { setPeriodResult(null); setPeriodAttempt(value => value + 1); }}>Réessayer</button></div> :
            !dashboard ? <p className="collection-empty" role="status">Chargement de la période…</p> : dashboard.count ? <>
            <CollectionAnalysis key={period} data={dashboard} period={period} onOpenCapture={setDetail} manufacturers={manufacturers}
              onManufacturers={code => { changeTab('manufacturers'); setDrillPeriod(period); setManufacturer(code); }}
              onFlight={flight => { changeTab('recent'); setDrillPeriod(period); setFlightFilter(flight); }} />
            {dashboard.record && <RecordFlight record={dashboard.record} />}
          </> : <div className="collection-empty"><p>{period === 'all' ? 'Tes statistiques apparaîtront après ta première capture.' : 'Aucune capture sur cette période.'}</p>
            <a className="collection-back" href="/">Ouvrir le radar</a></div>)}
          {browsing && (tab === 'recent' || items.length > 0) && <div className="collection-filters">
            <input type="search" aria-label="Rechercher dans cette vue" placeholder={tab === 'recent' ? 'Chercher dans toutes les captures' : 'Rechercher dans cette vue'} value={query}
              onChange={event => { setQuery(event.target.value); setCapturePage(1); }} />
            {tab === 'recent' && <select aria-label="Filtrer par fiabilité du trajet" value={routeFilter} onChange={event => { setRouteFilter(event.target.value); setCapturePage(1); }}>
              <option value="all">Tous les trajets</option>{Object.entries(routeStates).filter(([key]) => key !== 'announced')
                .map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}
            </select>}
            <select aria-label="Trier les résultats" value={sort} onChange={event => { setSort(event.target.value); setCapturePage(1); }}>
              <option value="name">Ordre alphabétique</option>
              <option value="default">{tab === 'recent' ? 'Plus récentes' : 'Kilomètres des trajets cumulés'}</option>
              {tab === 'recent' && <option value="distance">Plus longs trajets</option>}
            </select>
          </div>}
          {tab === 'recent' && flightFilter && <button className="collection-back collection-result" type="button" onClick={() => { setFlightFilter(''); setCapturePage(1); }}>{flightFilter} · Retirer le filtre ×</button>}
          {tab === 'recent' && capturePageData && !capturePageData.error && <p className="collection-note collection-result" role="status">{number.format(capturePageData.total)} capture{capturePageData.total === 1 ? '' : 's'}</p>}
          {browsing && (tab === 'recent' && !capturePageData ? <p className="collection-empty" role="status">Chargement des captures…</p> :
            tab === 'recent' && capturePageData.error ? <div className="collection-empty"><p role="alert">{capturePageData.error}</p>
              <button type="button" onClick={() => { setCaptureResult(null); setAttempt(value => value + 1); }}>Réessayer</button></div> :
            visible.length ? <ul className={tab === 'recent' ? 'capture-entries' : 'collection-list'} aria-label={tabs.find(([key]) => key === tab)[1]}>
            {visible.map(item => tab === 'recent' ? <CaptureRow key={`${item.aircraft}:${item.callsign}:${item.captured_at}`} item={item} onOpen={setDetail} /> :
              <CollectionCard key={item.code} item={item} tab={tab} />)}
          </ul> : <div className="collection-empty">
            {term || flightFilter ? <p>Aucun résultat pour cette recherche.</p> : routeFilter !== 'all' ? <p>Aucune capture avec ce niveau de fiabilité.</p> : data.count ? <p>Aucune entrée dans cette catégorie.</p> : <>
              <p>Sélectionne un avion en direct et clique sur « Capturer » pour commencer.</p>
              <a className="collection-back" href="/">Ouvrir le radar</a>
            </>}
          </div>)}
          {tab === 'recent' && capturePageData?.pages > 1 && <nav className="album-pagination capture-pages" aria-label="Pages des captures">
            <button type="button" disabled={capturePage <= 1} onClick={() => setCapturePage(capturePage - 1)}>Précédente</button>
            <span>Page {capturePage} sur {capturePageData.pages}</span>
            <button type="button" disabled={capturePage >= capturePageData.pages} onClick={() => setCapturePage(capturePage + 1)}>Suivante</button>
          </nav>}
        </section>
      </div>}
      {detail && <CaptureDetail item={detail} onClose={() => setDetail(null)} />}
    </div>
  </main>;
}
