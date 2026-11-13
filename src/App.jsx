import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { center, distanceKm, knownAirline, radius } from '../lib/flight.js';
import RadarMap, { planePath } from './RadarMap.jsx';
import { collectionRequest } from './collectionRequest.js';
import { captureFlightKey, captureLabels, captureStatus } from './captureStatus.js';
import { playbackFrames, useReplay } from './replay.js';
import { buildTraceGeometry } from './traceGeometry.js';
import { flightDurationLabel } from './flightDuration.js';
import { resolveFlightRoute, routeDistance, validateRouteDirection } from '../lib/routeEvidence.js';
import { appendLiveSample, isFollowPosition, liveTrailSegments, radarTrace, recordRadarHistory } from './liveTrail.js';
import { orderTraffic } from './trafficSort.js';

const demo = [
  { id: 'demo-af', callsign: 'AFR1234', registration: 'F-GKXJ', type: 'A320', model: 'Airbus A320', lat: 48.78, lon: 7.98, altitude: 12400, heading: 150, speed: 390,
    track: [[[49.01, 2.57], [48.98, 3.02], [48.86, 3.6], [48.81, 4.82], [48.72, 6.42], [48.78, 7.98]]],
    route: { number: 'AF1234', from: { code: 'CDG', name: 'Paris–Charles de Gaulle', lat: 49.01, lon: 2.55 }, to: { code: 'NCE', name: 'Nice Côte d’Azur', lat: 43.66, lon: 7.22 } } },
  { id: 'demo-lh', callsign: 'DLH401', registration: 'D-ABYD', type: 'B748', model: 'Boeing 747-8', lat: 48.97, lon: 7.28, altitude: 28000, heading: 44, speed: 370,
    track: [[[40.65, -73.77], [43, -68], [47, -58], [52, -42], [53, -24], [51, -9], [50.2, 1], [48.97, 7.28]]],
    route: { number: 'LH401', from: { code: 'JFK', name: 'New York–JFK', lat: 40.64, lon: -73.78 }, to: { code: 'FRA', name: 'Francfort', lat: 50.04, lon: 8.57 } } },
  { id: 'demo-u2', callsign: 'EZY72X', registration: 'G-EZWM', type: 'A320', lat: 48.24, lon: 8.23, altitude: 18900, heading: 315, speed: 340 }
].map(plane => ({ ...plane, distance: distanceKm(center, [plane.lat, plane.lon]), airline: knownAirline(plane.callsign) }));

const format = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const clock = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
const preciseClock = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const searchText = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const unit = (value, label) => Number.isFinite(value) ? format.format(value) + ' ' + label : '—';

function ageLabel(at, now) {
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 5) return 'à l’instant';
  return seconds < 60 ? 'il y a ' + seconds + ' s' : 'il y a ' + Math.floor(seconds / 60) + ' min';
}

function PlaneIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d={planePath} /></svg>;
}

const icons = {
  radar: 'M12 2v4m0 12v4M2 12h4m12 0h4 M18.5 12a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z M12 11v2',
  fullscreen: 'M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5',
  frame: 'M8 4H4v4m12-4h4v4m0 8v4h-4m-8 0H4v-4m4-1 3-4 2 2 3-4',
  back: 'M19 12H5m6-6-6 6 6 6',
  play: 'm9 5 11 7-11 7V5Z',
  pause: 'M9 5v14m6-14v14',
  close: 'm6 6 12 12M18 6 6 18',
  previous: 'm15 6-6 6 6 6',
  next: 'm9 6 6 6-6 6',
  collection: 'M4 7h16v13H4zM3 4h18v3H3zM10 12h4'
};

function Icon({ name }) {
  return <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={icons[name]} /></svg>;
}

function AirlineLogo({ airline, loading = 'lazy' }) {
  const code = airline?.iata;
  const [failed, setFailed] = useState();
  return <span className="airline-logo">
    {/^[A-Z0-9]{2}$/.test(code ?? '') && code !== failed
      ? <img src={'https://pics.avs.io/160/54/' + code + '.png'} alt="" loading={loading} onError={() => setFailed(code)} />
      : <PlaneIcon />}
  </span>;
}

async function read(url, signal) {
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]) });
  if (!response.ok) throw new Error('Flux indisponible');
  return response.json();
}

function useTraffic(mode) {
  const [snapshot, setSnapshot] = useState(null);
  const [failed, setFailed] = useState(false);
  const [radarHistory, setRadarHistory] = useState(() => new Map());
  useEffect(() => {
    if (mode === 'demo') return;
    const controller = new AbortController();
    let timer;
    async function update() {
      try {
        const data = await read('/api/vols', controller.signal);
        if (!controller.signal.aborted) {
          setSnapshot(data);
          setRadarHistory(history => recordRadarHistory(
            recordRadarHistory(history, data.previousAircraft ?? [], data.updatedAt),
            data.aircraft,
            data.updatedAt
          ));
          setFailed(false);
        }
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(update, 15000);
      }
    }
    update();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [mode]);
  return { planes: mode === 'demo' ? demo : snapshot?.aircraft ?? [], snapshot, failed, radarHistory };
}

function lookupParams(plane) {
  const params = new URLSearchParams();
  if (/^[A-Z0-9]{2,10}$/.test(plane.callsign)) params.set('vol', plane.callsign);
  if (/^[a-f0-9]{6}$/.test(plane.id)) params.set('hex', plane.id);
  return params.toString();
}

function FlightTicket({ plane, route, loading, mode, failed }) {
  const airline = route?.airline ?? plane?.airline;
  const flight = route?.number || plane?.callsign || plane?.registration || (plane ? plane.id.toUpperCase() : '—');
  const destination = route?.to;
  const totalDistance = routeDistance(route);
  const distance = plane && Number.isFinite(destination?.lat) && Number.isFinite(destination?.lon)
    ? distanceKm([plane.lat, plane.lon], [destination.lat, destination.lon]) : null;
  const observedAt = mode === 'demo' ? Date.now() : plane?.observedAt;
  const minutes = distance !== null && !route?.unverified && !failed && plane.speed > 0 &&
    Number.isFinite(observedAt) && Date.now() - observedAt < 90000
    ? Math.ceil(distance / (plane.speed * 1.852) * 60) : null;
  return <section className="ticket" aria-label="Billet du vol sélectionné">
    <header className="ticket-header"><PlaneIcon /><span>Carte d’embarquement</span><span className="ticket-tag">{mode === 'demo' ? 'Démo' : 'Radar'}</span></header>
    <div className="ticket-body">
      <div className="flight-identity">
        <div><p className="label">Vol sélectionné</p><h2>{flight}</h2><p>{airline?.name || (plane ? 'Compagnie non identifiée' : 'Sélectionnez un avion')}</p></div>
        <AirlineLogo key={airline?.iata} airline={airline} loading="eager" />
      </div>
      <div className="route">
        {[[route?.observedDeparture ? 'Départ observé' : route?.probableDeparture ? 'Départ probable' : 'Départ annoncé', route?.from],
          [destination ? route?.historicalRoute ? 'Arrivée probable' : 'Arrivée annoncée' : 'Arrivée', destination]].map(([label, airport], index) => (
          <div className="airport" key={label}>
            <p className="label">{label}</p><strong>{airport?.code || '—'}</strong>
            {airport?.name && <span>{airport.name}</span>}
            {index === 0 && <span className="route-plane"><PlaneIcon /></span>}
          </div>
        ))}
      </div>
      {plane && (!route?.from || !destination) && <p className="route-note" role="status">{
        loading ? 'Vérification du trajet…' : route?.routeConflict
          ? route.directionConflict
            ? 'La destination annoncée (' + route.reportedDestination + ') est opposée au déplacement observé. Trajet écarté.'
            : 'Le départ annoncé (' + route.reportedOrigin + ') ne correspond pas ' +
            (route.probableDeparture ? 'au début de la montée.' : 'à la position au sol.') + ' Arrivée non confirmée.'
          : route?.observedDeparture || route?.probableDeparture ? 'Arrivée non confirmée.' :
          route?.routeUnavailable ? 'Service de trajets indisponible.' : 'Trajet inconnu pour cet indicatif.'
      }</p>}
      {route?.historicalRoute ? <p className="route-note">Arrivée déduite de l’historique du vol (FlyItalyADSB).</p> :
        route?.unverified && <p className="route-note">Itinéraire annoncé. Départ non vérifié par ADS-B.</p>}
      {totalDistance !== null && <p className="ticket-distance"><span>Départ → arrivée</span><strong>{unit(totalDistance, 'km')}</strong><small>à vol d’oiseau</small></p>}
      <dl className="metrics">
        <div><dt>Altitude</dt><dd>{unit(plane?.altitude, 'pi')}</dd></div>
        <div><dt>Vitesse sol</dt><dd>{unit(plane?.speed * 1.852, 'km/h')}</dd></div>
        <div><dt>Distance radar</dt><dd>{unit(plane?.distance, 'km')}</dd></div>
        <div><dt>Arrivée estimée</dt><dd>{minutes === null ? '—' : clock.format(observedAt + minutes * 60000)}</dd></div>
      </dl>
      {minutes !== null && <p className="route-note">{unit(distance, 'km')} restants à vol d’oiseau · {unit(minutes, 'min')} · heure de Paris</p>}
    </div>
    <div className="ticket-stub">
      <div><p className="label">Appareil</p><strong>{route?.airframe?.model || plane?.model || plane?.type || route?.airframe?.type || '—'}</strong>
        <span>{route?.airframe?.registration || plane?.registration || (plane && 'Mode S ' + plane.id.toUpperCase()) || '—'}</span>
      </div>
      <div className="barcode" aria-hidden="true" />
    </div>
  </section>;
}

function trafficPageSize() {
  const height = window.innerHeight;
  if (height < 360) return 1;
  if (height < 470) return 2;
  if (height < 650) return 3;
  return 4;
}

function TrafficPanel({ planes, matches, selected, query, searching, status, route, searchDetails, onQuery, onSelect, onClose }) {
  const [pageSize, setPageSize] = useState(trafficPageSize);
  const [requestedPage, setRequestedPage] = useState(0);
  const [sort, setSort] = useState('distance');
  const closeButton = useRef(null);
  useEffect(() => {
    closeButton.current.focus({ preventScroll: true });
    const resize = () => setPageSize(trafficPageSize());
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const orderedMatches = useMemo(() => orderTraffic(matches, sort), [matches, sort]);
  const lastPage = Math.max(0, Math.ceil(orderedMatches.length / pageSize) - 1);
  const page = Math.min(requestedPage, lastPage);
  const start = page * pageSize;
  const end = Math.min(orderedMatches.length, start + pageSize);
  const summary = lastPage > 0 ? `${start + 1}–${end} sur ${orderedMatches.length}` :
    `${orderedMatches.length} ${query.trim() ? 'résultat' : 'vol'}${orderedMatches.length === 1 ? '' : 's'}`;
  const nearest = planes[0];
  const highest = planes.reduce((current, plane) => !current || (plane.altitude ?? -1) > (current.altitude ?? -1) ? plane : current, null);

  return <aside id="nearby-flights" className="traffic" aria-labelledby="traffic-title" onKeyDown={event => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  }}>
    <header>
      <h2 id="traffic-title">Trafic local <span>{planes.length}</span></h2>
      <button type="button" className="nearest-flight" disabled={!planes.length} onClick={() => {
        onQuery('');
        onSelect(planes[0]);
      }}>Le plus proche</button>
      <button ref={closeButton} type="button" className="traffic-icon" aria-label="Fermer les vols à proximité" onClick={onClose}><Icon name="close" /></button>
    </header>
    <label className="traffic-search">
      <span>Rechercher dans le trafic</span>
      <input type="search" aria-label="Rechercher un vol, une compagnie ou un appareil" value={query}
        onChange={event => { setRequestedPage(0); onQuery(event.target.value); }}
        placeholder="Indicatif, compagnie ou appareil" maxLength={60} />
    </label>
    <div className="traffic-sort" role="group" aria-label="Trier les vols">
      <span>Trier</span>
      {[['distance', 'Proximité'], ['altitude', 'Altitude'], ['speed', 'Vitesse']].map(([key, label]) =>
        <button key={key} type="button" aria-pressed={sort === key} onClick={() => { setSort(key); setRequestedPage(0); }}>{label}</button>)}
    </div>
    {planes.length > 0 && <dl className="traffic-overview">
      <div><dt>Le plus proche</dt><dd>{unit(nearest?.distance, 'km')}</dd></div>
      <div><dt>Altitude maximale</dt><dd>{unit(highest?.altitude, 'pi')}</dd></div>
    </dl>}
    {orderedMatches.length ? <ul className="traffic-list">
      {orderedMatches.slice(start, end).map(plane => {
        const details = plane.id === selected?.id ? route ?? searchDetails[plane.callsign] :
          plane.route ?? validateRouteDirection(searchDetails[plane.callsign], plane);
        const airline = details?.airline ?? plane.airline;
        const routeLabel = details?.from?.code && details?.to?.code ? `${details.from.code} → ${details.to.code}` : null;
        return <li key={plane.id}><button type="button" onClick={() => onSelect(plane)} aria-current={plane.id === selected?.id ? 'true' : undefined}>
          <AirlineLogo key={airline?.iata} airline={airline} /><span className="traffic-name">
            <strong>{details?.number || plane.callsign || plane.registration || plane.id.toUpperCase()}</strong>
            <small>{routeLabel || airline?.name || plane.model || plane.type || 'Avion non identifié'}</small>
          </span><span className="traffic-data"><strong>{unit(plane.distance, 'km')}</strong><small>{unit(plane.altitude, 'pi')}</small></span><Icon name="next" />
        </button></li>;
      })}
    </ul> : <p className="traffic-empty" role="status">{query.trim() ? (searching ? 'Recherche en cours…' : 'Aucun vol trouvé.') :
      status === 'En direct' ? 'Aucun avion signalé dans la zone.' : status}</p>}
    {orderedMatches.length > 0 && <footer>
      <p role="status">{summary}{searching && ' · Recherche…'}</p>
      {lastPage > 0 && <div className="traffic-pages" role="group" aria-label="Pages de vols">
        <button type="button" className="traffic-icon" aria-label="Vols précédents" aria-disabled={page === 0}
          onClick={() => { if (page > 0) setRequestedPage(page - 1); }}><Icon name="previous" /></button>
        <button type="button" className="traffic-icon" aria-label="Vols suivants" aria-disabled={page === lastPage}
          onClick={() => { if (page < lastPage) setRequestedPage(page + 1); }}><Icon name="next" /></button>
      </div>}
    </footer>}
  </aside>;
}

export default function App() {
  const [mode, setMode] = useState('live');
  const [focus, setFocus] = useState(null);
  const [showTraffic, setShowTraffic] = useState(false);
  const [capture, setCapture] = useState(null);
  const [captureHistory, setCaptureHistory] = useState({});
  const [captureNow, setCaptureNow] = useState(Date.now);
  const [recenter, setRecenter] = useState(0);
  const [fitRevision, setFitRevision] = useState(0);
  const [following, setFollowing] = useState(false);
  const [liveSamples, setLiveSamples] = useState([]);
  const [external, setExternal] = useState(null);
  const [clockNow, setClockNow] = useState(Date.now);
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState(null);
  const [trace, setTrace] = useState(null);
  const [traceAttempt, setTraceAttempt] = useState(0);
  const [searchDetails, setSearchDetails] = useState({});
  const [searching, setSearching] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');
  const [panelExpanded, setPanelExpanded] = useState(() => window.innerWidth >= 1100);
  const display = useRef(null);
  const panel = useRef(null);
  const trafficToggle = useRef(null);
  const { planes, snapshot, failed, radarHistory } = useTraffic(mode);
  const selected = focus?.plane;
  const captureKey = selected && `${selected.id}:${selected.callsign}:${Math.floor((selected.observedAt ?? 0) / 86400000)}`;
  const selectedCapture = capture?.key === captureKey ? capture : null;
  const radarAircraft = mode === 'live' ? [...new Set([...planes, selected].filter(plane =>
    /^[0-9a-f]{6}$/.test(plane?.id ?? '')).map(plane => plane.id))].sort().join(',') : '';
  const captureColors = useMemo(() => mode === 'live' ? Object.fromEntries(Object.entries(captureHistory)
    .map(([key, at]) => [key, captureStatus(at, captureNow)])) : {}, [mode, captureHistory, captureNow]);
  const selectedCaptureColor = selected && captureColors[captureFlightKey(selected)];
  const canCapture = mode === 'live' && /^[0-9a-f]{6}$/.test(selected?.id ?? '');
  useEffect(() => {
    if (!radarAircraft) return;
    let controller;
    let revision = 0;
    async function refresh() {
      if (document.hidden) return;
      setCaptureNow(Date.now());
      controller?.abort();
      controller = new AbortController();
      const request = ++revision;
      try {
        const ids = radarAircraft.split(',');
        const batches = [];
        for (let offset = 0; offset < ids.length; offset += 150) {
          batches.push(collectionRequest('?radar=' + ids.slice(offset, offset + 150).join(','), { signal: controller.signal }));
        }
        const matches = (await Promise.all(batches)).flatMap(batch => batch.matches);
        if (request !== revision) return;
        setCaptureHistory(Object.fromEntries(matches.map(row =>
          [captureFlightKey({ id: row.aircraft, callsign: row.callsign }), row.capturedAt])));
      } catch {
        // A collection outage must not interrupt the live radar.
      }
    }
    refresh();
    const timer = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      revision++;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [radarAircraft, capture]);
  const params = selected && mode === 'live' ? lookupParams(selected) : '';
  const reportedRoute = detail?.params === params ? detail.data : null;
  const traceParams = mode === 'live' && selected && /^[0-9a-f]{6}$/.test(selected.id) && Number.isFinite(selected.observedAt)
    ? new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(params)), at: selected.observedAt, lat: selected.lat, lon: selected.lon }).toString()
    : '';
  const traceResult = trace?.params === traceParams ? trace.data : null;
  const traceLoading = Boolean(traceParams && !traceResult);
  const radarSamples = radarHistory.get(selected?.id);
  const firstClickSample = focus?.extraSample;
  const localTrace = useMemo(() => mode === 'live' && selected && !traceResult?.segments?.length ?
    radarTrace(radarSamples, selected, firstClickSample) : null,
  [mode, selected, traceResult, radarSamples, firstClickSample]);
  const segments = mode === 'demo' ? selected?.track : traceResult?.segments?.length ? traceResult.segments : localTrace?.segments;
  const route = useMemo(() => {
    if (mode === 'demo') return selected?.route;
    return resolveFlightRoute(reportedRoute, traceResult?.departure, selected, segments, traceLoading);
  }, [mode, selected, reportedRoute, traceResult, traceLoading, segments]);
  const geometry = useMemo(() => buildTraceGeometry(focus, route, segments), [focus, route, segments]);
  const routeLoading = Boolean(params && detail?.params !== params);
  const timestamps = localTrace?.timestamps ?? traceResult?.timestamps;
  const coverage = timestamps?.length ? { start: timestamps[0][0], end: timestamps.at(-1).at(-1) } : null;
  const duration = mode === 'demo' && selected?.track ? 'En vol depuis environ ' +
    (selected.id === 'demo-af' ? '45 min' : '6 h 10 min') :
    flightDurationLabel(selected?.observedAt, traceResult?.departure?.takeoffAt, coverage?.start);
  const frames = useMemo(() => playbackFrames(segments, timestamps), [segments, timestamps]);
  const replay = useReplay(frames);
  const clearReplay = replay.clear;
  const lastSample = liveSamples.at(-1);
  const landed = Boolean(lastSample?.ground);
  const localPosition = following && !failed && !landed ?
    planes.find(plane => isFollowPosition(selected, lastSample, plane)) : null;
  const outsideId = following && !landed && !localPosition && /^[0-9a-f]{6}$/.test(selected?.id ?? '') ? selected.id : '';
  const outsideKey = outsideId ? outsideId + ':' + focus.revision : '';
  const outside = outsideKey && external?.key === outsideKey ? external : null;
  const outsidePosition = outside?.plane && clockNow - outside.plane.observedAt <= 65000 &&
    isFollowPosition(selected, lastSample, outside.plane) ? outside.plane : null;
  const tracked = localPosition ?? outsidePosition;
  const trail = useMemo(() => liveTrailSegments(liveSamples), [liveSamples]);
  const livePosition = following ? tracked ?? lastSample : null;
  const followSource = localPosition ? snapshot?.source : outsidePosition ? outside.source : null;
  const term = searchText(query.trim());
  const callsigns = term && mode === 'live' ? [...new Set(planes.map(plane => plane.callsign)
    .filter(code => /^[A-Z0-9]{2,10}$/.test(code)))].sort().join(',') : '';
  const uncachedCallsigns = useEffectEvent(codes => codes.filter(code => !Object.hasOwn(searchDetails, code)));

  useEffect(() => {
    if (!params) return;
    const controller = new AbortController();
    read('/api/trajet?' + params, controller.signal).then(data => {
      if (!controller.signal.aborted) setDetail({ params, data });
    }).catch(() => {
      if (!controller.signal.aborted) setDetail({ params, data: { routeUnavailable: true } });
    });
    return () => controller.abort();
  }, [params]);

  useEffect(() => {
    if (!traceParams) return;
    const controller = new AbortController();
    read('/api/trace?' + traceParams, controller.signal).then(data => {
      if (!controller.signal.aborted) setTrace({ params: traceParams, data });
    }).catch(() => {
      if (!controller.signal.aborted) setTrace({ params: traceParams, data: { failed: true } });
    });
    return () => controller.abort();
  }, [traceParams, traceAttempt]);

  const needsFirstClickSample = mode === 'live' && Boolean(selected && /^[a-f0-9]{6}$/.test(selected.id) && !segments?.length);
  useEffect(() => {
    if (!needsFirstClickSample) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const { plane } = await read('/api/suivi?hex=' + selected.id, controller.signal);
        if (!controller.signal.aborted && isFollowPosition(selected, null, plane) && !plane.ground &&
            plane.observedAt > selected.observedAt) {
          setFocus(current => current?.plane === selected ? { ...current, extraSample: plane } : current);
        }
      } catch {
        // The regular radar refresh can still provide the next observation.
      }
    }, 2500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [needsFirstClickSample, selected]);

  useEffect(() => {
    if (tracked) setLiveSamples(samples => appendLiveSample(samples, tracked));
  }, [tracked]);

  useEffect(() => {
    if (!outsideId) return;
    const controller = new AbortController();
    let timer;
    async function update() {
      try {
        const data = await read('/api/suivi?hex=' + outsideId, controller.signal);
        if (!controller.signal.aborted) setExternal({ key: outsideKey, ...data });
      } catch {
        if (!controller.signal.aborted) setExternal({ key: outsideKey, failed: true });
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(update, 15000);
      }
    }
    update();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [outsideId, outsideKey]);

  useEffect(() => {
    if (!following) return;
    const timer = setInterval(() => setClockNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, [following]);

  useEffect(() => {
    if (!callsigns) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const unknown = uncachedCallsigns(callsigns.split(','));
      if (!unknown.length) {
        setSearching(false);
        return;
      }
      setSearching(true);
      for (let offset = 0; offset < unknown.length && !controller.signal.aborted; offset += 4) {
        const entries = await Promise.all(unknown.slice(offset, offset + 4).map(async code => {
          try {
            const data = await read('/api/trajet?vol=' + code, controller.signal);
            return data.routeUnavailable ? null : [code, data];
          } catch {
            return null;
          }
        }));
        if (!controller.signal.aborted) setSearchDetails(previous => Object.fromEntries(
          [...Object.entries(previous), ...entries.filter(Boolean)].slice(-500)
        ));
      }
      if (!controller.signal.aborted) setSearching(false);
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [callsigns, term]);

  const matches = planes.filter(plane => {
    const details = plane.id === selected?.id ? route ?? searchDetails[plane.callsign] :
      plane.route ?? validateRouteDirection(searchDetails[plane.callsign], plane);
    const airline = details?.airline ?? plane.airline;
    return !term || searchText([plane.callsign, plane.registration, plane.id, plane.type, airline?.name, airline?.iata, details?.number].join(' ')).includes(term);
  });

  const status = mode === 'demo' ? 'Vols fictifs' : failed ? (snapshot ? 'Positions figées' : 'Signal indisponible') : snapshot ? 'En direct' : 'Connexion au radar…';
  const traceStatus = mode === 'demo' ? 'Trajectoire fictive' :
    localTrace ? 'Trace locale · positions reçues par FLIPPY' :
    traceLoading ? 'Chargement de l’historique ADS-B…' :
    traceResult?.failed ? 'Historique externe indisponible · trace locale en cours' :
    traceResult?.source === 'OpenSky' ? 'Trace ADS-B · OpenSky' :
    traceResult?.source === 'FlyItalyADSB' ? 'Trace ADS-B' :
    segments?.length ? (geometry?.partial ? 'Trace ADS-B partielle' : 'Trace enregistrée') : 'Aucune trace exploitable pour ce vol';

  const choosePlane = useCallback(plane => {
    const latest = planes.find(item => item.id === plane.id) ?? plane;
    clearReplay();
    setFollowing(false);
    setLiveSamples([]);
    setExternal(null);
    setShowTraffic(false);
    setFocus(previous => ({ plane: latest, revision: (previous?.revision ?? 0) + 1 }));
  }, [planes, clearReplay]);

  function closeTraffic() {
    setShowTraffic(false);
    trafficToggle.current.focus({ preventScroll: true });
  }

  async function capturePlane() {
    setCapture({ key: captureKey, pending: true });
    try {
      const params = new URLSearchParams({ hex: selected.id, vol: selected.callsign });
      const result = await collectionRequest('?' + params, { method: 'POST' });
      if (result.capturedAt) setCaptureHistory(previous => ({ ...previous, [captureFlightKey(selected)]: result.capturedAt }));
      setCaptureNow(Date.now());
      setCapture({ key: captureKey, saved: true, message: result.already ? 'Déjà dans ta collection.' : 'Ajouté à ta collection !' });
    } catch (error) {
      setCapture({ key: captureKey, message: error.message, failed: true, needsAccount: error.status === 401 });
    }
  }

  function returnToRadar() {
    replay.clear();
    setFollowing(false);
    setLiveSamples([]);
    setExternal(null);
    setFocus(null);
    setRecenter(value => value + 1);
  }

  function toggleFollowing() {
    replay.clear();
    if (following) setFitRevision(value => value + 1);
    else {
      setClockNow(Date.now());
      setExternal(null);
      setLiveSamples(samples => samples.length ? samples : appendLiveSample([], selected));
    }
    setFollowing(!following);
  }

  function retryTrace() {
    setTrace(null);
    setTraceAttempt(attempt => attempt + 1);
  }

  function showReplay() {
    if (following || replay.progress === null) setFitRevision(value => value + 1);
    setFollowing(false);
  }

  function changeMode(next) {
    if (mode === next) return;
    returnToRadar();
    setDetail(null);
    setSearching(false);
    setMode(next);
  }

  async function toggleFullscreen() {
    setFullscreenError('');
    try {
      if (document.fullscreenElement === display.current) await document.exitFullscreen();
      else await display.current.requestFullscreen();
    } catch {
      setFullscreenError('Le navigateur ne permet pas le plein écran.');
    }
  }

  return <main className="app" ref={display}>
    <section className="map-wrap" aria-label="Carte interactive des avions autour de Schiltigheim">
      <RadarMap planes={planes} focus={focus} route={route} geometry={geometry} coverage={coverage} captureColors={captureColors}
        flightNumber={route?.number || selected?.callsign || 'Numéro inconnu'}
        flightTime={duration ?? (traceLoading ? 'Calcul du temps de vol…' : 'Temps de vol indisponible')}
        onSelect={choosePlane} fitReady={Boolean(segments?.length) || (!routeLoading && !traceLoading)} localTrace={Boolean(localTrace)}
        recenter={recenter} fitRevision={fitRevision} panel={panel} following={following} tracked={tracked}
        livePosition={livePosition} trail={trail} replay={replay.frame} />
    </section>
    <header className="masthead">
      <div className="masthead-identity">
        <a className="brand" href="./" aria-label="Flippy, accueil"><span className="brand-icon"><PlaneIcon /></span>flippy<span className="brand-dot">.</span></a>
        <div className="masthead-station"><h1>Radar de Schiltigheim</h1><span>Alsace · Secteur SXB</span></div>
      </div>
      <div className="masthead-actions">
        <div className="mode-switch" role="group" aria-label="Source des positions">
          <button type="button" aria-pressed={mode === 'live'} onClick={() => changeMode('live')}><span className="live-dot" />Direct</button>
          <button type="button" aria-pressed={mode === 'demo'} onClick={() => changeMode('demo')}>Démo</button>
        </div>
        <div className="radar-actions">
          <button ref={trafficToggle} type="button" className="traffic-toggle" aria-label={'Vols à proximité, ' + planes.length}
            aria-expanded={showTraffic} aria-controls={showTraffic ? 'nearby-flights' : undefined}
            onClick={() => setShowTraffic(value => !value)}>Vols <strong>{planes.length}</strong></button>
          <button type="button" onClick={returnToRadar} aria-label="Recentrer sur le radar" title="Recentrer sur le radar"><Icon name="radar" /></button>
          <button type="button" onClick={toggleFullscreen} aria-label="Basculer le plein écran" title="Plein écran"><Icon name="fullscreen" /></button>
        </div>
      </div>
    </header>
    {fullscreenError && <p role="status" className="map-error">{fullscreenError}</p>}
    <div className={'signal' + (failed && mode === 'live' ? ' signal-failed' : '')} role="status">
      <span className="live-dot" />{status}<span className="signal-detail">· 100 km</span>
      {mode === 'live' && snapshot && <a href={snapshot.source === 'ADSB.fi' ? 'https://adsb.fi/' : 'https://www.adsb.lol/'}>{snapshot.source} · {clock.format(snapshot.updatedAt)}</a>}
    </div>
    <a className="collection-launch" href="/collection"><Icon name="collection" /> Collection</a>
    {mode === 'live' && planes.some(plane => captureColors[captureFlightKey(plane)]) && <div className="capture-legend" aria-label="Couleurs des captures">
      <span className="capture-today">Aujourd’hui</span><span className="capture-previous">Jours précédents</span>
    </div>}
    {!focus && !showTraffic && planes.length > 0 && <p className="map-hint"><Icon name="radar" /> Sélectionne un avion pour ouvrir son billet</p>}
    {focus && <aside className={'flight-column' + (panelExpanded ? '' : ' is-compact') + (showTraffic ? ' behind-traffic' : '')}
      ref={panel} aria-label="Informations sur les vols">
      <div className="flight-panel">
        <div className="panel-header">
          <button type="button" onClick={returnToRadar}><Icon name="back" /> Radar</button>
          {segments?.length > 0 && <button type="button" aria-label="Cadrer le trajet" onClick={() => {
            setFollowing(false);
            setFitRevision(value => value + 1);
          }}><Icon name="frame" /> Cadrer</button>}
          <button type="button" className="panel-toggle" aria-expanded={panelExpanded}
            onClick={() => setPanelExpanded(value => !value)}>{panelExpanded ? 'Réduire' : 'Détails'}</button>
          <span>Position au clic {selected.observedAt ? '· ' + preciseClock.format(selected.observedAt) : ''}</span>
        </div>
        <FlightTicket plane={selected} route={route} loading={routeLoading || traceLoading} mode={mode} failed={mode === 'live' && failed} />
        {canCapture && <div className="capture-row">
          {selectedCaptureColor && !selectedCapture?.message && <span>{captureLabels[selectedCaptureColor]}</span>}
          <button type="button" onClick={capturePlane} disabled={capture?.pending || selectedCapture?.saved}>
            <Icon name="collection" />{selectedCapture?.pending ? 'Capture en cours…' : selectedCapture?.saved ? 'Capturé' : 'Capturer'}
          </button>
          {selectedCapture?.message && <span role={selectedCapture.failed ? 'alert' : 'status'}>{selectedCapture.message}</span>}
          {selectedCapture?.saved && <a className="capture-collection" href="/collection">Voir ma collection</a>}
          {selectedCapture?.needsAccount && <a className="capture-collection" href="/collection#compte">Se connecter</a>}
        </div>}
        <div className="trace-legend" aria-live="polite">
          <span><i className={segments?.length ? 'legend-trace' : 'legend-empty'} />{traceStatus}</span>
          {traceResult?.source === 'FlyItalyADSB' && <span><a href="https://flyitalyadsb.com/">FlyItalyADSB</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a></span>}
          {geometry?.guides.length > 0 && <span><i className="legend-guide" />Portion estimée</span>}
          {geometry?.tracks.length > 1 && <span><i className="legend-gap" />Coupures de réception</span>}
          {trail.length > 0 && <span><i className="legend-live" />Positions reçues en direct</span>}
        </div>
        {coverage && <dl className="trace-coverage">
          <div><dt>Début de la trace</dt><dd>{preciseClock.format(coverage.start)}</dd></div>
          <div><dt>Fin de la trace</dt><dd>{preciseClock.format(coverage.end)}</dd></div>
        </dl>}
        {traceParams && traceResult && !traceResult.segments?.length && <button type="button" className="retry-trace" onClick={retryTrace}>Réessayer l’historique</button>}
        {(frames.length > 1 || mode === 'live') && <section className="flight-tools" aria-label="Relecture et suivi">
          <div className="flight-tool-buttons">
            {frames.length > 1 && <button type="button" className="replay-button" onClick={() => { showReplay(); replay.toggle(); }}>
              <Icon name={replay.playing ? 'pause' : 'play'} />
              {replay.playing ? 'Pause' : replay.progress > 0 && replay.progress < 1 ? 'Reprendre' : 'Rejouer la trace'}
            </button>}
            {mode === 'live' && <button type="button" aria-pressed={following} onClick={toggleFollowing}><Icon name="radar" />Suivre en direct</button>}
          </div>
          {frames.length > 1 && <div className="replay-timeline">
            <input type="range" min="0" max="1000" value={Math.round((replay.progress ?? 0) * 1000)}
              aria-label="Position dans la relecture" aria-valuetext={replay.frame?.at ? preciseClock.format(replay.frame.at) : undefined}
              onChange={event => { showReplay(); replay.seek(Number(event.target.value) / 1000); }} />
            <output>{replay.frame?.at ? preciseClock.format(replay.frame.at) : replay.frame ? Math.round(replay.progress * 100) + ' %' : 'Relecture accélérée'}</output>
          </div>}
          {following && <div className="follow-readout">
            <p className="follow-status" role="status">
              {landed ? 'Avion reçu au sol · Suivi terminé' : tracked
                ? tracked.distance > radius ? 'Suivi actif hors du radar local' : 'Suivi actif dans le radar local'
                : outsideId && !outside ? 'Recherche de l’avion hors du radar…'
                  : outside?.failed ? 'Source de suivi indisponible'
                    : 'Aucune nouvelle position reçue'}
              {followSource && <> · <a href={followSource === 'ADSB.fi' ? 'https://adsb.fi/' : 'https://www.adsb.lol/'}>{followSource}</a></>}
            </p>
            {livePosition && <p className="follow-freshness">
              Dernière position reçue à <strong>{preciseClock.format(livePosition.observedAt)}</strong> · {ageLabel(livePosition.observedAt, clockNow)}
            </p>}
          </div>}
        </section>}
      </div>
    </aside>}
    {showTraffic && <TrafficPanel planes={planes} matches={matches} selected={selected} query={query} searching={searching}
      status={status} route={route} searchDetails={searchDetails} onQuery={value => { setQuery(value); setSearching(false); }}
      onSelect={choosePlane} onClose={closeTraffic} />}
  </main>;
}
