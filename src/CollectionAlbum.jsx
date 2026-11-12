import { useEffect, useMemo, useRef, useState } from 'react';

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

function AircraftPhoto({ item }) {
  const target = useRef(null);
  const [photo, setPhoto] = useState();
  useEffect(() => {
    const controller = new AbortController();
    const node = target.current;
    const load = async () => {
      const params = new URLSearchParams({ code: item.code, name: item.name || item.code });
      if (item.manufacturer) params.set('manufacturer', item.manufacturer);
      try {
        const response = await fetch('/api/aircraft-photo?' + params, { signal: controller.signal });
        const result = await response.json();
        if (response.ok) setPhoto(result.photo || null);
      } catch (error) {
        if (!controller.signal.aborted) setPhoto(null);
      }
    };
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); load(); }
    }, { rootMargin: '320px' });
    if (node) observer.observe(node);
    return () => { observer.disconnect(); controller.abort(); };
  }, [item.code, item.name, item.manufacturer]);
  return <figure ref={target} className="album-aircraft-visual">
    {photo ? <><img src={photo.url} alt={`${item.name || item.code}, photo d’appareil`} loading="lazy"
      onError={() => setPhoto(null)} /><figcaption><a href={photo.page} target="_blank" rel="noreferrer">
        © {photo.author} · {photo.license}</a></figcaption></> : <ModelSilhouette item={item} />}
  </figure>;
}

function AirportMap({ item, direction }) {
  const located = Number.isFinite(item.lat) && Number.isFinite(item.lon);
  const markerX = located ? (item.lon + 180) / 360 * 300 : 150;
  const markerY = located ? (90 - item.lat) / 180 * 150 : 75;
  return <svg viewBox="0 0 300 150" aria-hidden="true" className="album-airport-silhouette">
    <g className="album-world-grid"><path d="M0 37.5h300M0 75h300M0 112.5h300M75 0v150M150 0v150M225 0v150" /></g>
    <g className="album-world-land">
      <path d="M18 29 37 17l35 2 18 13 16 6-9 14-18 3-12 17-17 3-9-15-17-9Z" />
      <path d="m82 79 17 9 9 18-7 28-13 12-7-26-10-23Z" />
      <path d="m127 32 17-10 18 5 11-8 34 2 23 14 38 4 20 17-13 15-24-4-13 12-29-6-21 4-16-10-18 4-15-14-21-6Z" />
      <path d="m146 70 28 3 17 15-8 33-16 20-16-14-9-28Z" />
      <path d="m241 105 25-7 19 14-7 19-29 3-15-13Z" />
      <path d="m106 14 13-10 10 6-8 13Z" />
    </g>
    <g className={'album-map-direction is-' + direction}><circle cx="273" cy="22" r="14" /><path d="m267 22 6-7 6 7m-6-7v14" /></g>
    {located && <g className="album-airport-marker" transform={`translate(${markerX} ${markerY})`}>
      <circle className="album-marker-halo" r="13" /><path d="M0 8c6-7 9-12 9-17a9 9 0 1 0-18 0c0 5 3 10 9 17Z" /><circle r="3" />
    </g>}
    <text x="16" y="137">{located ? `${item.lat.toFixed(2)}°, ${item.lon.toFixed(2)}°` : 'Position inconnue'}</text>
  </svg>;
}

function AlbumCard({ item, kind, owned }) {
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
        {airport ? <AirportMap item={item} direction={kind} /> : <AircraftPhoto item={item} />}
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

export default function CollectionAlbum({ data }) {
  const [kind, setKind] = useState('models');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [catalog, setCatalog] = useState(null);
  const [totals, setTotals] = useState({});
  const [error, setError] = useState('');
  const ownedItems = data[kind] ?? [];
  const ownedByCode = useMemo(() => new Map(ownedItems.map(item => [item.code, item])), [ownedItems]);
  const term = normalize(query.trim());
  const localOwned = useMemo(() => ownedItems.filter(item => !term ||
    normalize([item.code, item.name].filter(Boolean).join(' ')).includes(term)), [ownedItems, term]);

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
        setCatalog({ ...result, key: `${kind}:${filter}:${query.trim()}:${page}` });
        setTotals(current => ({ ...current, [kind]: result.catalogTotal }));
      } catch (requestError) {
        if (!controller.signal.aborted) setError(requestError.message);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [kind, filter, query, page, ownedItems]);

  const ownedPages = Math.max(1, Math.ceil(localOwned.length / pageSize));
  const requestKey = `${kind}:${filter}:${query.trim()}:${page}`;
  const loading = filter !== 'owned' && catalog?.key !== requestKey && !error;
  const sourceItems = filter === 'owned' ? localOwned.slice((page - 1) * pageSize, page * pageSize) : loading ? [] : catalog?.items ?? [];
  const pages = filter === 'owned' ? ownedPages : catalog?.pages ?? 1;
  const total = filter === 'owned' ? localOwned.length : catalog?.total ?? 0;
  const catalogTotal = totals[kind] ?? Math.max(ownedItems.length, 1);
  const progress = Math.min(100, ownedItems.length / catalogTotal * 100);
  const label = categories.find(([key]) => key === kind)?.[2];

  return <section className="collection-album" aria-labelledby="album-title">
    <header className="album-heading">
      <div><h2 id="album-title">Album du ciel</h2><p>Chaque capture révèle une nouvelle fiche dans ton hangar personnel.</p></div>
      <div className="album-progress-copy"><strong>{number.format(ownedItems.length)}</strong><span>sur {number.format(catalogTotal)} découvert{ownedItems.length === 1 ? '' : 's'}</span></div>
    </header>
    <div className="album-progress" role="progressbar" aria-label={`Progression ${label}`} aria-valuemin="0"
      aria-valuemax={catalogTotal} aria-valuenow={ownedItems.length}><span style={{ width: `${progress}%` }} /></div>
    <nav className="album-categories" aria-label="Collections de l’album">
      {categories.map(([key, short, full]) => <button key={key} type="button" aria-pressed={kind === key}
        onClick={() => { setKind(key); setFilter('all'); setQuery(''); }}>{short}<span>{full}</span></button>)}
    </nav>
    <div className="album-toolbar">
      <div role="group" aria-label="Filtrer les fiches">
        {[['all', 'Toutes'], ['owned', 'Découvertes'], ['missing', 'À découvrir']].map(([key, text]) =>
          <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{text}</button>)}
      </div>
      <input type="search" value={query} onChange={event => setQuery(event.target.value)}
        aria-label={`Rechercher dans ${label}`} placeholder={kind === 'models' ? 'Code, modèle ou constructeur' : 'Code ou nom d’aéroport'} />
    </div>
    <div className="album-results"><p role="status">{number.format(total)} fiche{total === 1 ? '' : 's'}</p>
      {catalog?.updated && kind === 'models' && <span>Catalogue ICAO actualisé le {catalogDate(catalog.updated)}</span>}</div>
    {error ? <div className="collection-empty"><p role="alert">{error}</p></div> : loading ?
      <div className="collection-empty"><p role="status">Ouverture du catalogue…</p></div> : sourceItems.length ?
      <ul className="album-grid">{sourceItems.map(item => <AlbumCard key={item.code} item={item} kind={kind} owned={ownedByCode.get(item.code)} />)}</ul> :
      <div className="collection-empty"><p>{filter === 'owned' ? 'Aucune fiche découverte ne correspond à cette recherche.' : 'Aucune fiche ne correspond à cette recherche.'}</p></div>}
    {pages > 1 && <nav className="album-pagination" aria-label="Pages de l’album">
      <button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Précédente</button>
      <span>Page {page} sur {pages}</span>
      <button type="button" disabled={page >= pages} onClick={() => setPage(value => value + 1)}>Suivante</button>
    </nav>}
    <p className="album-source">Modèles : ICAO Doc 8643 · Photos : Wikimedia Commons, créditées sur chaque fiche · Aéroports : OurAirports, domaine public.</p>
  </section>;
}
