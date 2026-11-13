import { useEffect, useRef, useState } from 'react';
import { routeDistance } from '../lib/routeEvidence.js';
import { planePath } from './RadarMap.jsx';
import { stationIntervals } from './stationTraffic.js';

const time = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const measure = (value, unit) => Number.isFinite(value) ? number.format(value) + ' ' + unit : '—';
const passageTime = seconds => seconds < 60 ? '< 1 min' : '~' + measure(Math.round(seconds / 60), 'min');
const passageDistance = km => km < 1 ? '< 1 km' : '~' + measure(km, 'km');
const stockPhotos = {
  A320: ['a320', 'Patrick Ludolph', 'Lufthansa_Airbus_A320_front-on_view.jpg', 'by/2.0'],
  A359: ['a359', 'Acroterion', 'Air_France_A350-900_F-HTYT_MD1.jpg', 'by-sa/4.0'],
  B738: ['b738', 'AndrewDawes', 'Ryanair_Boeing_737.jpg', 'by-sa/4.0'],
  E190: ['e190', 'Marcin Jagodziński', 'Embraer_ERJ-190.jpg', 'by-sa/3.0']
};

const paths = {
  radar: 'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5m-5 0 8-8',
  fullscreen: 'M9 4H4v5m11-5h5v5m0 6v5h-5M4 15v5h5',
  pause: 'M9 5v14m6-14v14',
  play: 'm8 5 12 7-12 7V5Z',
  close: 'm6 6 12 12M18 6 6 18',
  next: 'm9 6 6 6-6 6',
  board: 'M4 6h16M4 12h16M4 18h16M8 4v16',
  back: 'M19 12H5m7-7-7 7 7 7'
};

function StationIcon({ name }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

export function StationControls({ count, status, updated, interval, onInterval, paused, onPause, onExit, onFullscreen, passagesOpen, onPassages }) {
  return <header className="station-header">
    <div className="station-identity">
      <span className="station-emblem"><StationIcon name="radar" /></span>
      <div><p>FLIPPY</p><h1>Station radar</h1></div>
    </div>
    <div className="station-signal" role="status">
      <i className={status === 'En direct' ? 'is-live' : ''} />
      <span>{status}{updated ? ' · ' + time.format(updated) : ''}</span>
      <strong>{count} {count === 1 ? 'vol' : 'vols'}</strong>
    </div>
    <div className="station-actions">
      <label><span>Un billet toutes les</span>
        <select aria-label="Intervalle entre les billets" value={interval} onChange={event => onInterval(Number(event.target.value))}>
          {stationIntervals.map(seconds => <option key={seconds} value={seconds}>{seconds < 60 ? seconds + ' s' : seconds / 60 + ' min'}</option>)}
        </select>
      </label>
      <button type="button" className="station-rotation station-passages-toggle" aria-label="Passages" aria-expanded={passagesOpen}
        aria-controls={passagesOpen ? 'station-passages' : undefined} onClick={onPassages}>
        <StationIcon name="board" /><span>Passages</span>
      </button>
      <button type="button" className="station-rotation" aria-label={paused ? 'Lancer le défilement' : 'Mettre le défilement en pause'} onClick={onPause}>
        <StationIcon name={paused ? 'play' : 'pause'} />
        <span>{paused ? 'Lancer le défilement' : 'Pause'}</span>
      </button>
      <button type="button" aria-label="Basculer le plein écran" title="Plein écran" onClick={onFullscreen}><StationIcon name="fullscreen" /></button>
      <button type="button" aria-label="Quitter la station radar" title="Quitter la station radar" onClick={onExit}><StationIcon name="back" /></button>
    </div>
  </header>;
}

export function StationPassages({ passages, offline, demo, onSelect, onClose }) {
  return <aside className="station-board" id="station-passages" aria-labelledby="station-passages-title" onKeyDown={event => {
    if (event.key === 'Escape') onClose();
  }}>
    <div className="station-board-header">
      <div><h2 id="station-passages-title">Prochains passages</h2><p>Au plus près de Schiltigheim{demo ? ' · Démo' : ''}</p></div>
      <button type="button" className="station-close" aria-label="Fermer les passages" onClick={onClose}><StationIcon name="close" /></button>
    </div>
    {passages.length > 0 ? <>
      <div className="station-board-columns" aria-hidden="true"><span>Vol</span><span>Dans</span><span>Au plus près</span></div>
      <ul className="station-board-list">
        {passages.map(({ plane, seconds, closestKm }) => <li key={plane.id}>
          <button type="button" onClick={() => onSelect(plane)}>
            <span className="station-board-flight"><strong>{plane.callsign || plane.registration || plane.id.toUpperCase()}</strong>
              <small>{[plane.airline?.name, plane.model || plane.type].filter(Boolean).join(' · ')}</small></span>
            <span className="station-board-eta">{passageTime(seconds)}</span>
            <span>{passageDistance(closestKm)}</span>
          </button>
        </li>)}
      </ul>
      <p className="station-board-note">Estimations d’après le cap et la vitesse actuels.</p>
    </> : <p className="station-board-note" role="status">{offline ? 'En attente d’un nouveau relevé du radar.' : 'Aucun rapprochement estimé dans les 20 prochaines minutes.'}</p>}
  </aside>;
}

function StationPhoto({ plane, code, model }) {
  const [photo, setPhoto] = useState(null);
  const [failed, setFailed] = useState('');
  useEffect(() => {
    if (!/^[a-f0-9]{6}$/.test(plane.id) || !/^[A-Z0-9]{2,5}$/.test(code ?? '')) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ hex: plane.id, code, name: model || code, size: 'compact' });
    fetch('/api/aircraft-photo?' + params, { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (!controller.signal.aborted) setPhoto(data?.photo ?? null); })
      .catch(() => {});
    return () => controller.abort();
  }, [plane.id, code, model]);

  const stock = stockPhotos[code];
  const exact = photo?.source === 'Planespotters.net';
  const candidate = photo?.url !== failed ? photo : null;
  const stockUrl = stock && '/aircraft/' + stock[0] + '.jpg';
  const url = candidate?.url || (stockUrl !== failed ? stockUrl : null);
  const attribution = candidate?.page ?? (stock && 'https://commons.wikimedia.org/wiki/File:' + stock[2]);
  return <figure className="station-photo">
    {url ? <img src={url} alt={candidate && exact ? 'Appareil ' + (plane.registration || plane.id.toUpperCase()) : 'Illustration du modèle ' + model}
      decoding="async" onError={() => setFailed(url)} /> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d={planePath} /></svg>}
    {url && <figcaption>
      <span>{candidate && exact ? 'Appareil photographié' : 'Photo du modèle'}</span>
      {attribution && <a href={attribution} target="_blank" rel="noreferrer">© {candidate?.author ?? stock?.[1]}</a>}
      {candidate?.license && !exact && <span>{candidate.license}</span>}
      {!candidate && stock && <a href={'https://creativecommons.org/licenses/' + stock[3] + '/'} target="_blank" rel="noreferrer">CC {stock[3]}</a>}
    </figcaption>}
  </figure>;
}

export function StationTicket({ plane, route, loading, duration, automatic, onClose, onNext, canCapture, capture, onCapture, passage, showPassage }) {
  const swipeStart = useRef(null);
  const code = route?.airframe?.type || plane.type;
  const model = route?.airframe?.model || plane.model || code || 'Modèle inconnu';
  const airline = route?.airline?.name || plane.airline?.name;
  const distance = routeDistance(route);
  return <aside className="station-ticket" aria-label="Billet du vol" onTouchStart={event => {
    const touch = event.touches[0];
    swipeStart.current = event.touches.length === 1 ? [touch.clientX, touch.clientY] : null;
  }} onTouchCancel={() => { swipeStart.current = null; }} onTouchEnd={event => {
    const start = swipeStart.current;
    swipeStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch || event.touches.length) return;
    const left = start[0] - touch.clientX;
    if (left >= 56 && left > Math.abs(start[1] - touch.clientY) * 1.5) onNext?.();
  }}>
    <StationPhoto plane={plane} code={code} model={model} />
    <div className="station-ticket-actions">
      <button className="station-close" type="button" aria-label="Vol suivant" title="Vol suivant" disabled={!onNext} onClick={onNext}><StationIcon name="next" /></button>
      <button className="station-close" type="button" aria-label="Fermer le billet" onClick={onClose}><StationIcon name="close" /></button>
    </div>
    <div className="station-ticket-body">
      <p className="station-ticket-label">{automatic ? 'Vol mis en avant' : 'Vol sélectionné'}
        {Number.isFinite(plane.observedAt) && <span> · Vu à {time.format(plane.observedAt)}</span>}</p>
      <h2>{route?.number || plane.callsign || plane.registration || plane.id.toUpperCase()}</h2>
      {airline && <p className="station-airline">{airline}</p>}
      <div className="station-route">
        {[route?.from, route?.to].map((airport, index) => <div key={index}>
          <span>{index === 0 ? 'Départ' : route?.historicalRoute ? 'Arrivée probable' : 'Arrivée'}</span>
          <strong>{airport?.code || '—'}</strong>
          {airport?.name && <small>{airport.name}</small>}
        </div>)}
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={planePath} /></svg>
      </div>
      {loading && !route?.to ? <p className="station-route-note">Recherche du trajet…</p> :
        !route?.to ? <p className="station-route-note">Arrivée inconnue</p> :
        route.unverified ? <p className="station-route-note">Trajet non vérifié</p> :
        distance !== null && <p className="station-route-note">{measure(distance, 'km')} à vol d’oiseau</p>}
      <div className="station-specs"><strong>{model}</strong><span>{route?.airframe?.registration || plane.registration}</span></div>
      <dl className="station-metrics">
        <div><dt>Altitude</dt><dd>{measure(plane.altitude, 'pi')}</dd></div>
        <div><dt>Vitesse sol</dt><dd>{measure(plane.speed * 1.852, 'km/h')}</dd></div>
      </dl>
      {duration && <p className="station-duration">{duration}</p>}
      {showPassage && <div className="station-passage-readout">
        <span>Passage au plus près</span>
        <strong>{passage ? `${passageTime(passage.seconds)} · ${passageDistance(passage.closestKm)}` : 'Estimation indisponible'}</strong>
      </div>}
      {canCapture && <button className="station-capture" type="button" onClick={onCapture} disabled={capture?.pending || capture?.saved}>
        {capture?.pending ? 'Capture en cours…' : capture?.saved ? 'Capturé' : 'Capturer le vol'}
      </button>}
      {capture?.message && <p className="station-capture-status" role={capture.failed ? 'alert' : 'status'}>{capture.message}
        {capture.needsAccount && <> <a href="/collection#compte">Se connecter</a></>}
      </p>}
    </div>
  </aside>;
}
