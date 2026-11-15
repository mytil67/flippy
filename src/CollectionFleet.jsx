import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { atlasConnection } from './albumAirports.js';
import { AircraftPhoto } from './CollectionAlbum.jsx';
import { AirportLabel, AirportPair } from './CollectionAirports.jsx';
import { collectionRequest } from './collectionRequest.js';
import { alphabetical, byName } from '../lib/collectionOrder.js';

const number = new Intl.NumberFormat('fr-FR');
const km = value => value == null ? '—' : `${number.format(value)} km`;
const count = (value, label) => `${number.format(value)} ${label}${value === 1 ? '' : 's'}`;
const routeKey = route => `${route.departure}:${route.arrival}`;
const emptyList = [];
const profileViews = [['models', 'Modèles'], ['routes', 'Liaisons'], ['aircraft', 'Appareils']];
const searchText = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const logoPaths = {
  Airbus: 'airbus.svg', Boeing: 'boeing.svg', Embraer: 'embraer.svg'
};

function ProfileLogo({ item, CompanyLogo }) {
  const [failed, setFailed] = useState(false);
  if (CompanyLogo) return <CompanyLogo {...item} />;
  const path = logoPaths[item.code];
  return <span className="collection-logo">
    {path && !failed ? <img src={'/logos/' + path} alt="" loading="lazy" decoding="async"
      onError={() => setFailed(true)} /> : <span className="collection-logo-fallback" aria-hidden="true">{item.name.split(' ').slice(0, 3).map(word => word[0]).join('').toUpperCase()}</span>}
  </span>;
}

function NetworkFit({ points }) {
  const map = useMap();
  useEffect(() => {
    const fit = () => {
      map.invalidateSize();
      map.fitBounds(points, { padding: [24, 24], maxZoom: 7, animate: false });
    };
    const frame = requestAnimationFrame(fit);
    const observer = new ResizeObserver(fit);
    observer.observe(map.getContainer());
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [map, points]);
  return null;
}

export function RouteNetwork({ routes, selected, onSelect }) {
  const lines = useMemo(() => {
    const visible = routes.filter(route => route.from && route.to).slice(0, 60);
    if (selected?.from && selected?.to && !visible.includes(selected)) visible.push(selected);
    return visible.map(route => ({ route, segments: atlasConnection(route.from, route.to) }));
  }, [routes, selected]);
  const points = useMemo(() => {
    const route = selected?.from && selected?.to ? selected : null;
    return route ? [[route.from.lat, route.from.lon], [route.to.lat, route.to.lon + 360 * Math.round((route.from.lon - route.to.lon) / 360)]] :
      lines.flatMap(line => line.segments.flat());
  }, [lines, selected]);
  if (!points.length) return <p className="fleet-empty">La carte apparaîtra dès qu’une liaison sera identifiée.</p>;
  const acrossDateLine = selected?.from && selected?.to && Math.abs(selected.from.lon - selected.to.lon) > 180;
  return <MapContainer className="fleet-map" center={points[0]} zoom={4} scrollWheelZoom={false} aria-label="Carte des liaisons capturées">
    <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" updateWhenIdle keepBuffer={2}
      attribution={'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'} />
    <NetworkFit points={points} />
    {lines.map(({ route, segments }) => <Polyline key={routeKey(route)}
      positions={route === selected && acrossDateLine ? [points] : segments}
      eventHandlers={onSelect ? { click: () => onSelect(route) } : undefined}
      pathOptions={{ color: route === selected ? '#bc5718' : '#106c69', weight: route === selected ? 4 : 2, opacity: selected && route !== selected ? .25 : .78 }}>
      <Tooltip>
        <AirportPair departure={route.departure} arrival={route.arrival} fromName={route.from?.name} toName={route.to?.name} />
        {count(route.count, 'vol')}
      </Tooltip>
    </Polyline>)}
    {selected?.from && selected?.to && [selected.from, selected.to].map((airport, index) =>
      <CircleMarker key={airport.code} center={points[index]} radius={5}
        pathOptions={{ color: '#fff', fillColor: '#bc5718', fillOpacity: 1, weight: 2 }}>
        <Tooltip permanent direction={index === 0 ? 'top' : 'bottom'}><AirportLabel {...airport} /></Tooltip>
      </CircleMarker>)}
  </MapContainer>;
}

function FleetDetails({ query, showRoutes, showAircraft, interactive }) {
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [selectedRoute, setSelectedRoute] = useState('');
  const [fleetPage, setFleetPage] = useState(0);
  const [routePage, setRoutePage] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    collectionRequest('?' + query, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setResult(data);
    }).catch(error => { if (!controller.signal.aborted) setResult({ error: error.message }); });
    return () => controller.abort();
  }, [query, attempt]);
  const routes = useMemo(() => [...(result?.routes ?? emptyList)].sort((a, b) => alphabetical(routeKey(a), routeKey(b))), [result]);
  const fleet = useMemo(() => [...(result?.fleet ?? emptyList)].sort((a, b) => alphabetical(a.registration, b.registration)), [result]);
  const selected = routes.find(route => routeKey(route) === selectedRoute);
  if (!result) return <p className="fleet-empty" role="status">Chargement des vols…</p>;
  if (result.error) return <div className="fleet-empty">
    <p role="alert">{result.error}</p><button type="button" className="collection-back" onClick={() => { setResult(null); setAttempt(value => value + 1); }}>Réessayer</button>
  </div>;
  return <>
      {showRoutes && <section className="fleet-section" aria-labelledby="fleet-routes">
        <header><h3 id="fleet-routes">Carte des liaisons</h3><span>{count(result.routes.length, 'liaison')} · {result.measured}/{result.count} vols avec distance</span></header>
        <RouteNetwork routes={result.routes} selected={selected} onSelect={interactive ? route => {
          setSelectedRoute(routeKey(route));
          setRoutePage(Math.floor(routes.indexOf(route) / 8));
        } : undefined} />
        {result.routes.length > 0 && <>
          <div className="fleet-map-caption"><span>Distance entre aéroports, à vol d’oiseau{result.routes.length > 60 ? ' · 60 liaisons principales sur la carte' : ''}</span>
            {selected && <button className="collection-back" type="button" onClick={() => setSelectedRoute('')}>Vue d’ensemble</button>}</div>
          <ul className="fleet-routes">{routes.slice(routePage * 8, (routePage + 1) * 8).map(route => <li key={routeKey(route)}>
            <button type="button" aria-pressed={selected === route} disabled={!route.from || !route.to}
              onClick={() => setSelectedRoute(selected === route ? '' : routeKey(route))}>
              <AirportPair departure={route.departure} arrival={route.arrival} fromName={route.from?.name} toName={route.to?.name} />
              <span><strong>{km(route.distance)}</strong><small>{count(route.count, 'vol')}{route.count > 1 && route.route_km != null && ` · ${km(route.route_km)} cumulés`}</small></span>
            </button>
          </li>)}</ul>
          <ProfilePages label="Pages des liaisons" page={routePage} setPage={setRoutePage} total={result.routes.length} size={8} />
        </>}
      </section>}
      {showAircraft && <section className="fleet-section" aria-labelledby="fleet-aircraft">
        <header><h3 id="fleet-aircraft">Appareils capturés</h3><span>{count(result.aircraft, 'appareil')} distinct{result.aircraft === 1 ? '' : 's'}</span></header>
        {result.fleet.length ? <ul className="fleet-aircraft">{fleet.slice(fleetPage * 6, (fleetPage + 1) * 6).map(plane => <li key={plane.hex}>
          <AircraftPhoto item={{ code: plane.code || '', name: plane.name || plane.code }} aircraft={plane.hex} compact />
          <div><strong>{plane.registration}</strong><p>{plane.name || plane.code || 'Modèle inconnu'}</p>
            <small>{count(plane.count, 'vol')}{plane.route_km != null && ` · ${km(plane.route_km)}`}</small></div>
        </li>)}</ul> : <p className="fleet-empty">Aucun appareil identifié.</p>}
        <ProfilePages label="Pages des appareils" page={fleetPage} setPage={setFleetPage} total={result.fleet.length} size={6} />
      </section>}
  </>;
}

function FleetMetrics({ values }) {
  return <dl className="fleet-metrics">{values.map(([label, value]) =>
    <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

function Profile({ item, CompanyLogo, onBack, period, headingRef }) {
  const [view, setView] = useState('models');
  const [modelCode, setModelCode] = useState('');
  const routesTab = useRef(null);
  const models = CompanyLogo ? emptyList : [...item.models].sort(byName);
  const params = new URLSearchParams(CompanyLogo ? { fleetAirline: item.code } :
    { fleetModels: modelCode || models.map(model => model.code).join(',') });
  if (period !== 'all') params.set('period', period);
  const query = params.toString();
  return <section className="fleet-profile" aria-labelledby="fleet-title">
    <button className="collection-back fleet-back" type="button" onClick={onBack}>← {CompanyLogo ? 'Compagnies' : 'Constructeurs'}</button>
    <header className="fleet-profile-hero">
      <div className="fleet-brand-heading">
        <ProfileLogo item={item} CompanyLogo={CompanyLogo} />
        <h2 id="fleet-title" ref={headingRef} tabIndex={headingRef ? -1 : undefined}>{item.name}</h2>
      </div>
      <FleetMetrics values={[
        ['Vols capturés', number.format(item.count)],
        ...(!CompanyLogo ? [['Modèles vus', number.format(models.length)]] : []),
        ['Km cumulés', km(item.route_km)]
      ]} />
    </header>
    {!CompanyLogo && <div className="manufacturer-controls">
      <nav className="manufacturer-views" aria-label="Détail du constructeur">
        {profileViews.map(([key, label]) => <button key={key} ref={key === 'routes' ? routesTab : undefined}
          type="button" aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}
      </nav>
      {view !== 'models' && models.length > 1 && <label className="manufacturer-field">Modèle
        <select value={modelCode} onChange={event => setModelCode(event.target.value)}>
          <option value="">Tous les modèles</option>
          {models.map(model => <option key={model.code} value={model.code}>{model.name} ({model.code})</option>)}
        </select>
      </label>}
    </div>}
    {!CompanyLogo && view === 'models' ?
      <section className="fleet-section" aria-labelledby="manufacturer-models">
        <header><h3 id="manufacturer-models">Modèles observés</h3></header>
        <ul className="fleet-aircraft manufacturer-models">{models.map(model => <li key={model.code}>
          <AircraftPhoto item={model} aircraft={model.aircraft} compact />
          <div>
            <small>{model.code}</small>
            <h4>{model.name}</h4>
            <FleetMetrics values={ [['Vols capturés', number.format(model.count)], ['Km cumulés', km(model.route_km)]] } />
            <button type="button" className="collection-back" onClick={() => {
              setModelCode(model.code); setView('routes'); routesTab.current?.focus();
            }}>
              Voir les liaisons <span aria-hidden="true">→</span>
            </button>
          </div>
        </li>)}</ul>
      </section> :
      <FleetDetails key={query} query={query} showRoutes={Boolean(CompanyLogo) || view === 'routes'}
        showAircraft={Boolean(CompanyLogo) || view === 'aircraft'} interactive={!CompanyLogo} />}
  </section>;
}

function ProfilePages({ label, page, setPage, total, size }) {
  const pages = Math.ceil(total / size);
  return pages > 1 && <nav className="album-pagination" aria-label={label}>
    <button type="button" disabled={!page} onClick={() => setPage(page - 1)}>Précédente</button>
    <span>{page + 1} / {pages}</span>
    <button type="button" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Suivante</button>
  </nav>;
}

function ManufacturerDirectory({ items, onOpen }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('name');
  const term = searchText(query.trim());
  const visible = items.filter(item => !term || [item.name, ...item.models.flatMap(model => [model.name, model.code])]
    .some(value => value && searchText(value).includes(term))).sort((a, b) =>
    (sort === 'flights' ? b.count - a.count : sort === 'distance' ? (b.route_km ?? -1) - (a.route_km ?? -1) : 0) || byName(a, b));
  const modelCount = items.reduce((total, item) => total + item.models.length, 0);
  const flightCount = items.reduce((total, item) => total + item.count, 0);
  return <section className="fleet-directory manufacturer-directory" aria-labelledby="fleet-directory-title">
    <header><div><h2 id="fleet-directory-title">Constructeurs</h2><p>Compare les constructeurs des avions que tu as capturés.</p></div></header>
    {items.length > 0 && <>
      <FleetMetrics values={[
        ['Constructeurs identifiés', number.format(items.filter(item => item.code !== 'Constructeur non identifié').length)],
        ['Modèles vus', number.format(modelCount)],
        ['Vols avec modèle renseigné', number.format(flightCount)]
      ]} />
      <div className="manufacturer-controls">
        <label className="manufacturer-field">Rechercher
          <input type="search" value={query} placeholder="Airbus, B738…" onChange={event => setQuery(event.target.value)} />
        </label>
        <label className="manufacturer-field">Trier par
          <select value={sort} onChange={event => setSort(event.target.value)}>
            <option value="name">Nom (A à Z)</option>
            <option value="flights">Vols capturés</option>
            <option value="distance">Km cumulés</option>
          </select>
        </label>
      </div>
    </>}
    {visible.length > 0 ? <ul className="manufacturer-list">{visible.map(item => <li key={item.code}>
      <button type="button" className="manufacturer-row" onClick={event => onOpen(item.code, event.currentTarget)}>
        <span className="fleet-brand-heading"><ProfileLogo item={item} /><strong>{item.name}</strong></span>
        <span className="manufacturer-row-metrics">{[
          ['Modèles', number.format(item.models.length)],
          ['Vols capturés', number.format(item.count)],
          ['Km cumulés', km(item.route_km)]
        ].map(([label, value]) => <span key={label}><small>{label}</small><b>{value}</b></span>)}</span>
        <span className="manufacturer-open" aria-hidden="true">Voir la fiche →</span>
      </button>
    </li>)}</ul> : <p className="fleet-empty">{term ? 'Aucun constructeur ou modèle trouvé.' : 'Aucun modèle identifié parmi les captures de cette période.'}</p>}
    {visible.some(item => item.route_km != null) && <p className="fleet-map-caption">Les kilomètres cumulés additionnent les distances à vol d’oiseau des trajets renseignés.</p>}
  </section>;
}

export default function CollectionFleet({ items, CompanyLogo, initialCode = '', period = 'all' }) {
  const [code, setCode] = useState(initialCode);
  const [query, setQuery] = useState('');
  const opener = useRef(null);
  const profileHeading = useRef(null);
  const selected = items.find(item => item.code === code);
  const selectedCode = selected?.code;
  useEffect(() => {
    if (CompanyLogo) return;
    if (selectedCode) profileHeading.current?.focus();
    else if (opener.current) {
      opener.current.focus();
      opener.current = null;
    }
  }, [CompanyLogo, selectedCode]);
  if (!CompanyLogo) return <>
    <div hidden={Boolean(selected)}><ManufacturerDirectory items={items} onOpen={(next, button) => {
      opener.current = button;
      setCode(next);
    }} /></div>
    {selected && <Profile key={`${code}:${period}`} item={selected} period={period} headingRef={profileHeading} onBack={() => setCode('')} />}
  </>;
  if (selected) return <Profile key={code} item={selected} CompanyLogo={CompanyLogo} period={period} onBack={() => setCode('')} />;
  const term = query.trim().toLocaleLowerCase('fr');
  const visible = items.filter(item => `${item.name} ${item.code}`.toLocaleLowerCase('fr').includes(term)).sort(byName);
  const heading = 'Compagnies';
  return <section className="fleet-directory" aria-labelledby="fleet-directory-title">
    <header><div><h2 id="fleet-directory-title">{heading}</h2><p>Les appareils et les liaisons de tes captures.</p></div>
      {items.length > 1 && <input type="search" value={query} aria-label={`Rechercher dans ${heading.toLowerCase()}`}
        placeholder="Rechercher" onChange={event => setQuery(event.target.value)} />}</header>
    {visible.length ? <ul className="fleet-directory-list">{visible.map(item => <li key={item.code}>
      <button type="button" onClick={() => setCode(item.code)}>
        <ProfileLogo item={item} CompanyLogo={CompanyLogo} />
        <span className="fleet-directory-copy"><strong>{item.name}</strong><small>{count(item.count, 'vol')}{item.models && ` · ${count(item.models.length, 'modèle')}`}</small></span>
        {item.route_km != null && <b>{km(item.route_km)}</b>}<span className="fleet-directory-arrow" aria-hidden="true">›</span>
      </button>
    </li>)}</ul> : <p className="fleet-empty">{term ? 'Aucun résultat.' : 'Tes prochaines captures apparaîtront ici.'}</p>}
  </section>;
}
