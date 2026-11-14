import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { latLngBounds } from 'leaflet';
import { albumAirports, atlasConnection } from './albumAirports.js';
import { alphabetical, byName } from '../lib/collectionOrder.js';

const pageSize = 24;
const number = new Intl.NumberFormat('fr-FR');
const categories = [
  ['models', 'Modèles', 'Types d’appareils'],
  ['departures', 'Départs', 'Aéroports de départ'],
  ['arrivals', 'Arrivées', 'Aéroports d’arrivée']
];
const normalize = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const catalogDate = value => {
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? value : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(instant);
};

const hash = value => [...value].reduce((total, character) => total + character.charCodeAt(0), 0);
const cardPalettes = [
  ['#ff714a', '#ffd0c3'], ['#2e9f91', '#b8eee2'], ['#4c83b6', '#c9e4ff'],
  ['#b67b36', '#f5d8ae'], ['#7b6eb5', '#ded7ff']
];
const modelFamily = item => {
  const category = `${item.category || ''} ${item.name || ''}`.toLowerCase();
  if (/heli|rotor/.test(category)) return 'Hélicoptère';
  if (/glider|planeur/.test(category)) return 'Planeur';
  if (/amphib|sea plane|seaplane/.test(category)) return 'Hydravion';
  if (item.engineType?.toLowerCase().includes('turboprop')) return 'Turbopropulseur';
  return item.engineType === 'Jet' ? 'Avion à réaction' : 'Aéronef';
};

function ModelSilhouette({ item }) {
  const family = modelFamily(item);
  if (family === 'Hélicoptère') return <svg viewBox="0 0 300 150" aria-hidden="true" className="album-plane-silhouette">
    <path d="M44 91c2-24 24-42 54-42h33c28 0 51 16 60 39l43 4 18 13-64 3c-10 20-31 32-58 32H90c-24 0-44-20-46-49Zm61-42-23-24h13l34 24Zm28 0 28-33h13l-17 33Z" />
    <path className="album-silhouette-line" d="M17 18h205M120 18v31M78 140h112M91 140l-14-14m99 14 14-14" />
  </svg>;
  if (family === 'Planeur') return <svg viewBox="0 0 300 150" aria-hidden="true" className="album-plane-silhouette">
    <path d="m18 84 111-15 24-48h13l-8 47 114 16-114 12-7 36h-12l-9-36Z" />
    <path className="album-silhouette-line" d="M41 84h203M150 70v25" />
  </svg>;
  return <svg viewBox="0 0 300 150" aria-hidden="true" className="album-plane-silhouette">
    <path d="m20 86 103-13 34-57h19l-14 55 76 6 31-18h12l-17 28 17 29h-12l-31-19-76 7 14 31h-19l-34-30L20 91Z" />
    <path className="album-silhouette-line" d="M39 87h214M151 73v31" />
    {family === 'Turbopropulseur' && <path className="album-propellers" d="M108 58v58m-15-29h30m70-29v58m-15-29h30" />}
  </svg>;
}

function useNearViewport() {
  const target = useRef(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const node = target.current;
    if (!node || !('IntersectionObserver' in window)) { setNear(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setNear(true); observer.disconnect(); }
    }, { rootMargin: '240px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [target, near];
}

export function AircraftPhoto({ item, aircraft, compact = false }) {
  const [target, near] = useNearViewport();
  const [photo, setPhoto] = useState();
  useEffect(() => {
    if (!near) return;
    const controller = new AbortController();
    const load = async () => {
      const params = new URLSearchParams({ code: item.code, name: item.name || item.code });
      if (compact) params.set('size', 'compact');
      if (item.manufacturer) params.set('manufacturer', item.manufacturer);
      if (aircraft) params.set('hex', aircraft);
      try {
        const response = await fetch('/api/aircraft-photo?' + params, { signal: controller.signal });
        const result = await response.json();
        if (response.ok) setPhoto(result.photo || null);
      } catch (error) {
        if (!controller.signal.aborted) setPhoto(null);
      }
    };
    load();
    return () => controller.abort();
  }, [near, item.code, item.name, item.manufacturer, aircraft, compact]);
  return <figure ref={target} className="album-aircraft-visual">
    {photo ? <><img src={photo.url} alt={`${item.name || item.code}, photo d’appareil`} loading="lazy"
      onError={() => setPhoto(null)} /><figcaption><a href={photo.page} target="_blank" rel="noreferrer">
        © {photo.author} · {photo.license}{photo.source && ` · ${photo.source}`}</a></figcaption></> : <ModelSilhouette item={item} />}
  </figure>;
}

function AirportMap({ item, direction, preview, onPreview }) {
  const located = Number.isFinite(item.lat) && Number.isFinite(item.lon);
  return <div className="album-airport-map">
    {preview && located ? <MapContainer center={[item.lat, item.lon]} zoom={10} zoomControl={false} dragging={false}
      scrollWheelZoom={false} doubleClickZoom={false} touchZoom={false} keyboard={false} attributionControl>
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution={'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'} />
      <CircleMarker center={[item.lat, item.lon]} radius={9} pathOptions={{ color: '#fff', weight: 3, fillColor: '#ff714a', fillOpacity: 1 }} />
    </MapContainer> : <div className="album-map-placeholder" aria-hidden="true" />}
    <span className={'album-map-direction is-' + direction} aria-hidden="true">{direction === 'departures' ? '↑' : '↓'}</span>
    {located && !preview && <button type="button" className="album-map-open" onClick={onPreview}
      aria-label={`Afficher la carte de ${item.code}`}>Afficher la carte</button>}
    {located && preview && <a className="album-map-open" href={`https://www.openstreetmap.org/?mlat=${item.lat}&mlon=${item.lon}#map=11/${item.lat}/${item.lon}`}
      target="_blank" rel="noreferrer">Voir autour de {item.code}</a>}
  </div>;
}

function AirportAtlasFit({ airports }) {
  const map = useMap();
  useEffect(() => {
    const fit = () => {
      map.invalidateSize();
      if (airports.length === 1) map.setView([airports[0].lat, airports[0].lon], 6, { animate: false });
      else if (airports.length > 1) map.fitBounds(latLngBounds(airports.map(item => [item.lat, item.lon])),
        { padding: [38, 38], maxZoom: 6, animate: false });
    };
    const frame = requestAnimationFrame(fit);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    observer?.observe(map.getContainer());
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); };
  }, [map, airports]);
  return null;
}

export function AirportCaptures({ airport, route, model, direction, onOpenCapture }) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page });
    if (model) params.set('model', model.code);
    else params.set('airport', airport.code);
    if (direction) params.set('direction', direction);
    if (route) {
      params.set('departure', route.departure);
      params.set('arrival', route.arrival);
    }
    fetch('/api/collection?' + params, { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Captures indisponibles.');
      if (!controller.signal.aborted) setResult({ ...data, page });
    }).catch(() => {
      if (!controller.signal.aborted) setError('Impossible de charger ces captures.');
    });
    return () => controller.abort();
  }, [airport?.code, model?.code, direction, route, page, attempt]);

  const ready = result?.page === page;
  return <div className="album-atlas-captures">
    {error ? <><p role="alert">{error}</p><button type="button" onClick={() => { setError(''); setAttempt(value => value + 1); }}>Réessayer</button></> :
      !ready ? <p role="status">Chargement des captures…</p> : <>
        <p role="status">{result.total} capture{result.total === 1 ? '' : 's'} · {route ? `${route.departure} → ${route.arrival}` : model?.name || airport?.name || model?.code || airport?.code}</p>
        {result.items.length > 0 && <ul>{result.items.map(item => <li key={`${item.aircraft}:${item.callsign}:${item.captured_at}`}>
          <button type="button" onClick={() => onOpenCapture(item)}>
            <strong>{item.flight_number || item.callsign || item.registration || item.aircraft.toUpperCase()}</strong>
            <span>{item.departure_code || '—'} → {item.arrival_code || '—'}</span>
            <span>{catalogDate(item.captured_at)}</span>
          </button>
        </li>)}</ul>}
      </>}
    {result?.pages > 1 && <nav className="album-pagination" aria-label="Pages des captures">
      <button type="button" disabled={!ready || page <= 1} onClick={() => setPage(page - 1)}>Précédente</button>
      <span>Page {page} sur {result.pages}</span>
      <button type="button" disabled={!ready || page >= result.pages} onClick={() => setPage(page + 1)}>Suivante</button>
    </nav>}
  </div>;
}

const routeKey = route => `${route.departure}:${route.arrival}`;
const noRoutes = [];

function AirportAtlas({ departures, arrivals, routes = noRoutes, onOpenCapture }) {
  const airports = useMemo(() => albumAirports(departures, arrivals).sort(byName), [departures, arrivals]);
  const byCode = useMemo(() => new Map(airports.map(airport => [airport.code, airport])), [airports]);
  const [selection, setSelection] = useState('');
  const [selectedRoute, setSelectedRoute] = useState('');
  const selected = byCode.get(selection);
  const connections = useMemo(() => routes.filter(route => route.departure === selection || route.arrival === selection)
    .sort((a, b) => alphabetical(routeKey(a), routeKey(b))), [routes, selection]);
  const route = connections.find(item => routeKey(item) === selectedRoute);
  // The same line can represent both directions. A select keeps them independently accessible.
  const linkedAirports = new Set(connections.map(item => item.departure === selection ? item.arrival : item.departure));
  const markerTone = airport => airport.departures && airport.arrivals ? '#f2c66d' : airport.departures ? '#ff714a' : '#55cdb7';
  function chooseAirport(code) {
    setSelection(code);
    setSelectedRoute('');
  }
  return <section className="album-atlas" aria-labelledby="album-atlas-title">
    <header><div><h3 id="album-atlas-title">Mon réseau aérien</h3>
      <p>Sélectionne un aéroport pour afficher ses liaisons et retrouver tes captures.</p></div>
      <strong>{airports.length} aéroport{airports.length === 1 ? '' : 's'} épinglé{airports.length === 1 ? '' : 's'}</strong></header>
    <div className="album-atlas-legend" aria-label="Légende de la carte">
      <span className="is-departure">Départ</span><span className="is-arrival">Arrivée</span><span className="is-both">Les deux</span>
      {connections.length > 0 && <span className="is-connection">Liaison entre aéroports</span>}
    </div>
    {airports.length ? <div className="album-atlas-map">
      <MapContainer center={[30, 0]} zoom={2} minZoom={2} maxZoom={12} scrollWheelZoom={false} attributionControl>
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution={'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'} />
        <AirportAtlasFit airports={airports} />
        {selected && [...linkedAirports].map(code => {
          const other = byCode.get(code);
          if (!other) return null;
          const active = route && (route.departure === code || route.arrival === code);
          return <Polyline key={code} positions={atlasConnection(selected, other)} interactive={false}
            pathOptions={{ color: active ? '#9a4c0a' : '#166d71', weight: active ? 4 : 2, opacity: active ? 1 : .7, dashArray: '5 6' }} />;
        })}
        {airports.map(airport => <CircleMarker key={airport.code} center={[airport.lat, airport.lon]}
          radius={Math.min(14, 7 + Math.sqrt(airport.departures + airport.arrivals))}
          pathOptions={{ color: selected?.code === airport.code ? '#102b38' : '#fff', weight: selected?.code === airport.code ? 4 : 2, fillColor: markerTone(airport), fillOpacity: .96 }}
          eventHandlers={{ click: () => chooseAirport(airport.code) }}>
          <Tooltip direction="top" offset={[0, -7]}><strong>{airport.code}</strong><span>{airport.name}</span>
            <small>{airport.departures} départ{airport.departures === 1 ? '' : 's'} · {airport.arrivals} arrivée{airport.arrivals === 1 ? '' : 's'}</small></Tooltip>
        </CircleMarker>)}
      </MapContainer>
    </div> : <div className="album-atlas-empty"><p>Capture un trajet identifié pour placer ton premier aéroport.</p></div>}
    {airports.length > 0 && <div className="album-atlas-selection">
      <label htmlFor="atlas-airport">Captures par aéroport</label>
      <select id="atlas-airport" value={selected?.code ?? ''} onChange={event => chooseAirport(event.target.value)}>
        <option value="">Choisir un aéroport</option>
        {airports.map(airport => <option key={airport.code} value={airport.code}>{airport.code} · {airport.name}</option>)}
      </select>
      {connections.length > 0 && <>
        <label htmlFor="atlas-route">Liaison</label>
        <select id="atlas-route" value={route ? routeKey(route) : ''} onChange={event => setSelectedRoute(event.target.value)}>
          <option value="">Toutes les liaisons</option>
          {connections.map(item => <option key={routeKey(item)} value={routeKey(item)}>
            {item.departure} → {item.arrival} · {item.count} capture{item.count === 1 ? '' : 's'}
          </option>)}
        </select>
      </>}
      {selected && <AirportCaptures key={`${selected.code}:${selectedRoute}`} airport={selected} route={route} onOpenCapture={onOpenCapture} />}
    </div>}
  </section>;
}

function AlbumCard({ item, kind, owned, preview, onPreview }) {
  const airport = kind !== 'models';
  const [accent, tint] = cardPalettes[hash(item.code) % cardPalettes.length];
  const family = airport ? (kind === 'departures' ? 'Point de départ' : 'Destination') : modelFamily(item);
  const details = airport ? 'Code aéroport · ICAO' :
    [item.manufacturer, item.engineCount && item.engineType ? `${item.engineCount} × ${item.engineType}` : item.engineType].filter(Boolean).join(' · ') || 'Référence ICAO';
  return <li className={'album-card ' + (owned ? 'is-unlocked' : 'is-locked')}>
    <article style={{ '--card-accent': accent, '--card-tint': tint }} aria-label={`${item.code}, ${item.name}, ${owned ? 'découvert' : 'à découvrir'}`}>
      <header><span>{family}</span><strong>{owned ? 'Dans ton hangar' : 'Fiche à débloquer'}</strong></header>
      <div className="album-card-art">
        <span className="album-card-code" aria-hidden="true">{item.code}</span>
        {airport ? <AirportMap item={item} direction={kind} preview={preview} onPreview={onPreview} /> : <AircraftPhoto item={item} aircraft={owned?.aircraft} />}
        {!owned && <i aria-hidden="true"><span>?</span></i>}
      </div>
      <div className="album-card-copy">
        <span className="album-card-designator">{item.code}</span>
        <h3>{item.name || item.code}</h3><p>{details}</p>
      </div>
      <footer>{owned ? <><span className="album-card-seal" aria-hidden="true">✓</span><p><strong>{owned.count}</strong> rencontre{owned.count === 1 ? '' : 's'}<small>Fiche authentifiée</small></p></> :
        <><span className="album-card-lock" aria-hidden="true">◇</span><p>Pas encore croisé<small>Repère-le sur le radar</small></p></>}</footer>
    </article>
  </li>;
}

export default function CollectionAlbum({ data, onOpenCapture }) {
  const [kind, setKind] = useState('models');
  const [filter, setFilter] = useState('owned');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [airportPreview, setAirportPreview] = useState('');
  const [catalog, setCatalog] = useState(null);
  const [selection, setSelection] = useState('');
  const [atlasOpen, setAtlasOpen] = useState(false);
  const [error, setError] = useState('');
  const ownedItems = data[kind] ?? [];
  const ownedByCode = useMemo(() => new Map(ownedItems.map(item => [item.code, item])), [ownedItems]);
  const term = normalize(query.trim());
  const localOwned = useMemo(() => ownedItems.filter(item => !term ||
    normalize([item.code, item.name].filter(Boolean).join(' ')).includes(term))
    .sort(byName), [ownedItems, term]);

  useEffect(() => {
    setPage(1);
  }, [kind, filter, query]);

  useEffect(() => {
    if (filter === 'owned') return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setError('');
      const params = new URLSearchParams({ kind: kind === 'models' ? 'models' : 'airports', page: String(page) });
      if (query.trim()) params.set('q', query.trim());
      if (filter === 'missing' && ownedItems.length) params.set('exclude', ownedItems.map(item => item.code).join(','));
      try {
        const response = await fetch('/api/catalog?' + params, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Catalogue indisponible.');
        if (!controller.signal.aborted) setCatalog({ ...result, key: `${kind}:${filter}:${query.trim()}:${page}` });
      } catch (requestError) {
        if (!controller.signal.aborted) setError(requestError.message);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [kind, filter, query, page, ownedItems]);

  const ownedPages = Math.max(1, Math.ceil(localOwned.length / pageSize));
  const requestKey = `${kind}:${filter}:${query.trim()}:${page}`;
  const catalogError = filter !== 'owned' && error;
  const loading = filter !== 'owned' && catalog?.key !== requestKey && !catalogError;
  const sourceItems = filter === 'owned' ? localOwned.slice((page - 1) * pageSize, page * pageSize) : loading ? [] : catalog?.items ?? [];
  const pages = filter === 'owned' ? ownedPages : catalog?.pages ?? 1;
  const total = filter === 'owned' ? localOwned.length : catalog?.total ?? 0;
  const label = categories.find(([key]) => key === kind)?.[2];

  return <section className="collection-album" aria-labelledby="album-title">
    <header className="album-heading">
      <h2 id="album-title">Catalogue</h2>
    </header>
    <nav className="album-categories" aria-label="Collections de l’album">
      {categories.map(([key, short]) => <button key={key} type="button" aria-pressed={kind === key}
        onClick={() => { setKind(key); setFilter('owned'); setQuery(''); setSelection(''); setAtlasOpen(false); }}>{short}
        <span>{number.format(data[key]?.length ?? 0)}</span></button>)}
    </nav>
    <div className="album-toolbar">
      <div role="group" aria-label="Filtrer les fiches">
        {[['owned', 'Capturés'], ['missing', 'À découvrir'], ['all', 'Tous']].map(([key, text]) =>
          <button key={key} type="button" aria-pressed={filter === key} onClick={() => { setFilter(key); setError(''); setSelection(''); }}>{text}</button>)}
        {kind !== 'models' && <button type="button" aria-expanded={atlasOpen} onClick={() => setAtlasOpen(value => !value)}>Carte des aéroports</button>}
      </div>
      <input type="search" value={query} onChange={event => { setQuery(event.target.value); setError(''); setSelection(''); }}
        aria-label={`Rechercher dans ${label}`} placeholder={kind === 'models' ? 'Nom ou code du modèle' : 'Nom ou code de l’aéroport'} />
    </div>
    {kind !== 'models' && atlasOpen && <AirportAtlas departures={data.departures} arrivals={data.arrivals} routes={data.routes} onOpenCapture={onOpenCapture} />}
    {!loading && !catalogError && <div className="album-results"><p role="status">{number.format(total)} {filter === 'owned' ? 'dans ta collection' : total === 1 ? 'fiche' : 'fiches'}</p></div>}
    {catalogError ? <div className="collection-empty"><p role="alert">{catalogError}</p></div> : loading ?
      <div className="collection-empty"><p role="status">Ouverture du catalogue…</p></div> : sourceItems.length ?
      <ul className={filter === 'owned' ? 'album-owned-list' : 'album-grid'}>{sourceItems.map(item => filter === 'owned' ?
        <li key={item.code} className="album-owned-entry">
          <button className="album-owned-row" type="button" aria-expanded={selection === item.code}
            onClick={() => setSelection(selection === item.code ? '' : item.code)}>
            <span className="album-owned-code">{item.code}</span>
            <strong>{item.name || item.code}</strong>
            <span className="album-owned-count">{number.format(item.count)} vol{item.count === 1 ? '' : 's'}</span>
            <span className="album-owned-chevron" aria-hidden="true">›</span>
          </button>
          {selection === item.code && <div className="album-owned-detail">
            {kind === 'models' && <AircraftPhoto item={item} aircraft={item.aircraft} />}
            <AirportCaptures key={`${kind}:${item.code}`} model={kind === 'models' ? item : undefined}
              airport={kind === 'models' ? undefined : item} direction={kind === 'departures' ? 'departure' : kind === 'arrivals' ? 'arrival' : undefined}
              onOpenCapture={onOpenCapture} />
          </div>}
        </li> : <AlbumCard key={item.code} item={item} kind={kind} owned={ownedByCode.get(item.code)}
          preview={airportPreview === `${kind}:${item.code}`} onPreview={() => setAirportPreview(`${kind}:${item.code}`)} />)}</ul> :
      <div className="collection-empty"><p>{term ? 'Aucun résultat pour cette recherche.' : filter === 'owned' ? 'Tes captures apparaîtront ici.' : 'Aucune fiche disponible.'}</p></div>}
    {!loading && !catalogError && pages > 1 && <nav className="album-pagination" aria-label="Pages du catalogue">
      <button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Précédente</button>
      <span>Page {page} sur {pages}</span>
      <button type="button" disabled={page >= pages} onClick={() => setPage(value => value + 1)}>Suivante</button>
    </nav>}
    <p className="album-source">Modèles : ICAO Doc 8643 · Photos : Planespotters.net, Wikimedia Commons et Wikipédia, créditées sur chaque fiche · Cartes : © contributeurs OpenStreetMap · Aéroports : OurAirports.</p>
  </section>;
}
