import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { center, distanceKm, knownAirline, radius } from '../lib/flight.js';
import RadarMap, { planePath } from './RadarMap.jsx';
import { playbackFrames, useReplay } from './replay.js';
import { buildTraceGeometry } from './traceGeometry.js';
import { flightDurationLabel } from './flightDuration.js';
import { reconcileRoute } from '../lib/routeEvidence.js';
import { appendLiveSample, isFollowPosition, liveTrailSegments, radarTrace, recordRadarHistory } from './liveTrail.js';

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
  back: 'M19 12H5m6-6-6 6 6 6',
  play: 'm9 5 11 7-11 7V5Z',
  pause: 'M9 5v14m6-14v14'
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
          [destination ? 'Arrivée annoncée' : 'Arrivée', destination]].map(([label, airport], index) => (
          <div className="airport" key={label}>
            <p className="label">{label}</p><strong>{airport?.code || '—'}</strong>
            {airport?.name && <span>{airport.name}</span>}
            {index === 0 && <span className="route-plane"><PlaneIcon /></span>}
          </div>
        ))}
      </div>
      {plane && (!route?.from || !destination) && <p className="route-note" role="status">{
        loading ? 'Vérification du trajet…' : route?.routeConflict
          ? 'Le départ annoncé (' + route.reportedOrigin + ') ne correspond pas ' +
            (route.probableDeparture ? 'au début de la montée.' : 'à la position au sol.') + ' Arrivée non confirmée.'
          : route?.observedDeparture || route?.probableDeparture ? 'Arrivée non confirmée.' :
          route?.routeUnavailable ? 'Service de trajets indisponible.' : 'Trajet inconnu pour cet indicatif.'
      }</p>}
      {route?.unverified && <p className="route-note">Itinéraire annoncé. Départ non vérifié par ADS-B.</p>}
      <dl className="metrics">
        <div><dt>Altitude</dt><dd>{unit(plane?.altitude, 'pi')}</dd></div>
        <div><dt>Vitesse sol</dt><dd>{unit(plane?.speed * 1.852, 'km/h')}</dd></div>
        <div><dt>Distance radar</dt><dd>{unit(plane?.distance, 'km')}</dd></div>
        <div><dt>Arrivée estimée</dt><dd>{minutes === null ? '—' : clock.format(observedAt + minutes * 60000)}</dd></div>
      </dl>
      {minutes !== null && <p className="route-note">{unit(distance, 'km')} à vol d’oiseau · {unit(minutes, 'min')} · heure de Paris</p>}
    </div>
    <div className="ticket-stub">
      <div><p className="label">Appareil</p><strong>{route?.airframe?.model || plane?.model || plane?.type || route?.airframe?.type || '—'}</strong>
        <span>{route?.airframe?.registration || plane?.registration || (plane && 'Mode S ' + plane.id.toUpperCase()) || '—'}</span>
      </div>
      <div className="barcode" aria-hidden="true" />
    </div>
  </section>;
}

export default function App() {
  const [mode, setMode] = useState('live');
  const [focus, setFocus] = useState(null);
  const [showTraffic, setShowTraffic] = useState(false);
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
  const display = useRef(null);
  const panel = useRef(null);
  const { planes, snapshot, failed, radarHistory } = useTraffic(mode);
  const selected = focus?.plane;
  const params = selected && mode === 'live' ? lookupParams(selected) : '';
  const reportedRoute = detail?.params === params ? detail.data : null;
  const traceParams = mode === 'live' && selected && /^[0-9a-f]{6}$/.test(selected.id) && Number.isFinite(selected.observedAt)
    ? new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(params)), at: selected.observedAt, lat: selected.lat, lon: selected.lon }).toString()
    : '';
  const traceResult = trace?.params === traceParams ? trace.data : null;
  const traceLoading = Boolean(traceParams && !traceResult);
  const route = useMemo(() => mode === 'demo' ? selected?.route :
    reconcileRoute(reportedRoute, traceResult?.departure, traceLoading),
  [mode, selected, reportedRoute, traceResult, traceLoading]);
  const radarSamples = radarHistory.get(selected?.id);
  const firstClickSample = focus?.extraSample;
  const localTrace = useMemo(() => mode === 'live' && selected && !traceResult?.segments?.length ?
    radarTrace(radarSamples, selected, firstClickSample) : null,
  [mode, selected, traceResult, radarSamples, firstClickSample]);
  const segments = mode === 'demo' ? selected?.track : traceResult?.segments?.length ? traceResult.segments : localTrace?.segments;
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
    const details = plane.id === selected?.id ? route ?? searchDetails[plane.callsign] : plane.route ?? searchDetails[plane.callsign];
    const airline = details?.airline ?? plane.airline;
    return !term || searchText([plane.callsign, plane.registration, plane.id, plane.type, airline?.name, airline?.iata, details?.number].join(' ')).includes(term);
  });

  const status = mode === 'demo' ? 'Vols fictifs' : failed ? (snapshot ? 'Positions figées' : 'Signal indisponible') : snapshot ? 'En direct' : 'Connexion au radar…';
  const traceStatus = mode === 'demo' ? 'Trajectoire fictive' :
    localTrace ? 'Trace locale · positions reçues par FLIPPY' :
    traceLoading ? 'Chargement de l’historique ADS-B…' :
    traceResult?.failed ? 'Historique externe indisponible · trace locale en cours' :
    traceResult?.source === 'OpenSky' ? 'Trace ADS-B · OpenSky' :
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
      <RadarMap planes={planes} focus={focus} route={route} geometry={geometry} coverage={coverage}
        flightNumber={route?.number || selected?.callsign || 'Numéro inconnu'}
        flightTime={duration ?? (traceLoading ? 'Calcul du temps de vol…' : 'Temps de vol indisponible')}
        onSelect={choosePlane} fitReady={!routeLoading && (!traceLoading || Boolean(localTrace))} localTrace={Boolean(localTrace)}
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
          <button type="button" className="traffic-toggle" aria-expanded={showTraffic} onClick={() => setShowTraffic(value => !value)}>Vols <strong>{planes.length}</strong></button>
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
    {!focus && !showTraffic && planes.length > 0 && <p className="map-hint"><Icon name="radar" /> Sélectionne un avion pour ouvrir son billet</p>}
    {(focus || showTraffic) && <aside className="flight-column" ref={panel} aria-label="Informations sur les vols">
      {focus && <div className="flight-panel">
        <div className="panel-header"><button type="button" onClick={returnToRadar}><Icon name="back" /> Radar</button><span>Position au clic {selected.observedAt ? '· ' + preciseClock.format(selected.observedAt) : ''}</span></div>
        <FlightTicket plane={selected} route={route} loading={routeLoading || traceLoading} mode={mode} failed={mode === 'live' && failed} />
        <div className="trace-legend" aria-live="polite">
          <span><i className={segments?.length ? 'legend-trace' : 'legend-empty'} />{traceStatus}</span>
          {geometry?.guides.length > 0 && <span><i className="legend-guide" />Portion indicative</span>}
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
      </div>}
      {showTraffic && <section className="traffic" aria-labelledby="traffic-title">
            <header><h2 id="traffic-title">Vols à proximité</h2><button type="button" disabled={!planes.length} onClick={() => { setQuery(''); choosePlane(planes[0]); }}>Le plus proche</button></header>
            <input type="search" aria-label="Rechercher un vol, une compagnie ou un appareil" value={query}
              onChange={event => { setQuery(event.target.value); setSearching(false); }} placeholder="Rechercher un vol ou une compagnie" maxLength={60} />
            {term && <p className="search-status" role="status">{matches.length} résultat{matches.length !== 1 ? 's' : ''}{searching ? ' · Identification en cours…' : ''}</p>}
            <ul className="traffic-list">
              {matches.map(plane => {
                const details = plane.id === selected?.id ? route ?? searchDetails[plane.callsign] : plane.route ?? searchDetails[plane.callsign];
                const airline = details?.airline ?? plane.airline;
                return <li key={plane.id}><button type="button" onClick={() => choosePlane(plane)} aria-pressed={plane.id === selected?.id}>
                  <AirlineLogo key={airline?.iata} airline={airline} /><span className="traffic-name">
                    <strong>{details?.number || plane.callsign || plane.registration || plane.id.toUpperCase()}</strong>
                    <small>{airline?.name || plane.model || plane.type || 'Avion non identifié'}</small>
                  </span><span className="traffic-distance">{unit(plane.distance, 'km')}</span>
                </button></li>;
              })}
            </ul>
            {!term && !matches.length && <p className="search-status">{status === 'En direct' ? 'Aucun avion signalé dans la zone.' : status}</p>}
      </section>}
    </aside>}
  </main>;
}
