import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { atlasConnection } from './albumAirports.js';
import { AircraftPhoto } from './CollectionAlbum.jsx';
import { collectionRequest } from './collectionRequest.js';
import './collectionFleet.css';

const number = new Intl.NumberFormat('fr-FR');
const km = value => value == null ? '—' : `${number.format(value)} km`;
const count = (value, label) => `${number.format(value)} ${label}${value === 1 ? '' : 's'}`;
const routeKey = route => `${route.departure}:${route.arrival}`;
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

function RouteNetwork({ routes, selected }) {
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
      pathOptions={{ color: route === selected ? '#bc5718' : '#106c69', weight: route === selected ? 4 : 2, opacity: selected && route !== selected ? .25 : .78 }}>
      <Tooltip>{route.departure} → {route.arrival} · {count(route.count, 'vol')}</Tooltip>
    </Polyline>)}
    {selected?.from && selected?.to && [selected.from, selected.to].map((airport, index) =>
      <CircleMarker key={airport.code} center={points[index]} radius={5}
        pathOptions={{ color: '#fff', fillColor: '#bc5718', fillOpacity: 1, weight: 2 }}>
        <Tooltip permanent direction={index === 0 ? 'top' : 'bottom'}>{airport.code} · {airport.name}</Tooltip>
      </CircleMarker>)}
  </MapContainer>;
}

function Profile({ item, CompanyLogo, onBack }) {
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [selectedRoute, setSelectedRoute] = useState('');
  const [fleetPage, setFleetPage] = useState(0);
  const [routePage, setRoutePage] = useState(0);
  const query = new URLSearchParams(CompanyLogo ? { fleetAirline: item.code } : { fleetModels: item.models.map(model => model.code).join(',') }).toString();
  useEffect(() => {
    const controller = new AbortController();
    collectionRequest('?' + query, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setResult(data);
    }).catch(error => { if (!controller.signal.aborted) setResult({ error: error.message }); });
    return () => controller.abort();
  }, [query, attempt]);
  const selected = result?.routes?.find(route => routeKey(route) === selectedRoute);
  return <section className="fleet-profile" aria-labelledby="fleet-title">
    <button className="collection-back fleet-back" type="button" onClick={onBack}>← {CompanyLogo ? 'Compagnies' : 'Constructeurs'}</button>
    <header className="fleet-profile-hero">
      <ProfileLogo item={item} CompanyLogo={CompanyLogo} />
      <h2 id="fleet-title">{item.name}</h2>
      <dl><div><dt>Vols capturés</dt><dd>{number.format(result?.count ?? item.count)}</dd></div>
        <div><dt>Appareils distincts</dt><dd>{result?.aircraft ?? '—'}</dd></div>
        <div><dt>Trajets cumulés</dt><dd>{km(result?.routeKm ?? item.route_km)}</dd></div></dl>
    </header>
    {!result ? <p className="fleet-empty" role="status">Chargement des vols…</p> : result.error ? <div className="fleet-empty">
      <p role="alert">{result.error}</p><button type="button" className="collection-back" onClick={() => { setResult(null); setAttempt(value => value + 1); }}>Réessayer</button>
    </div> : <>
      <section className="fleet-section" aria-labelledby="fleet-routes">
        <header><h3 id="fleet-routes">Carte des liaisons</h3><span>{count(result.routes.length, 'liaison')} · {result.measured}/{result.count} vols avec distance</span></header>
        <RouteNetwork routes={result.routes} selected={selected} />
        {result.routes.length > 0 && <>
          <div className="fleet-map-caption"><span>Distance entre aéroports, à vol d’oiseau{result.routes.length > 60 ? ' · 60 liaisons principales sur la carte' : ''}</span>
            {selected && <button className="collection-back" type="button" onClick={() => setSelectedRoute('')}>Vue d’ensemble</button>}</div>
          <ul className="fleet-routes">{result.routes.slice(routePage * 8, (routePage + 1) * 8).map(route => <li key={routeKey(route)}>
            <button type="button" aria-pressed={selected === route} onClick={() => setSelectedRoute(selected === route ? '' : routeKey(route))}>
              <span><strong>{route.departure} → {route.arrival}</strong><small>{route.from?.name || route.departure} → {route.to?.name || route.arrival}</small></span>
              <span><strong>{km(route.distance)}</strong><small>{count(route.count, 'vol')}{route.count > 1 && route.route_km != null && ` · ${km(route.route_km)} cumulés`}</small></span>
            </button>
          </li>)}</ul>
          <ProfilePages label="Pages des liaisons" page={routePage} setPage={setRoutePage} total={result.routes.length} size={8} />
        </>}
      </section>
      <section className="fleet-section" aria-labelledby="fleet-aircraft">
        <header><h3 id="fleet-aircraft">Appareils capturés</h3><span>{count(new Set(result.fleet.map(plane => plane.code).filter(Boolean)).size, 'modèle')}</span></header>
        {result.fleet.length ? <ul className="fleet-aircraft">{result.fleet.slice(fleetPage * 6, (fleetPage + 1) * 6).map(plane => <li key={plane.hex}>
          <AircraftPhoto item={{ code: plane.code || '', name: plane.name || plane.code }} aircraft={plane.hex} compact />
          <div><strong>{plane.registration}</strong><p>{plane.name || plane.code || 'Modèle inconnu'}</p>
            <small>{count(plane.count, 'vol')}{plane.route_km != null && ` · ${km(plane.route_km)}`}</small></div>
        </li>)}</ul> : <p className="fleet-empty">Aucun appareil identifié.</p>}
        <ProfilePages label="Pages des appareils" page={fleetPage} setPage={setFleetPage} total={result.fleet.length} size={6} />
      </section>
    </>}
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

export default function CollectionFleet({ items, CompanyLogo }) {
  const [code, setCode] = useState('');
  const [query, setQuery] = useState('');
  const selected = items.find(item => item.code === code);
  if (selected) return <Profile key={code} item={selected} CompanyLogo={CompanyLogo} onBack={() => setCode('')} />;
  const term = query.trim().toLocaleLowerCase('fr');
  const visible = items.filter(item => `${item.name} ${item.code}`.toLocaleLowerCase('fr').includes(term));
  const heading = CompanyLogo ? 'Compagnies' : 'Constructeurs';
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
