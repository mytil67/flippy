import { useEffect, useMemo, useState } from 'react';

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

function ModelSilhouette({ unlocked }) {
  return <svg viewBox="0 0 220 90" aria-hidden="true" className="album-plane-silhouette">
    <path d="M11 51 83 43l31-34h18l-14 34 62 3 23-13h9l-12 19 12 19h-9l-23-13-62 3 14 20h-18L83 61l-72-7Z" />
    {unlocked && <path className="album-silhouette-line" d="M24 52h171M110 44v16" />}
  </svg>;
}

function AirportSilhouette({ unlocked }) {
  return <svg viewBox="0 0 220 90" aria-hidden="true" className="album-airport-silhouette">
    <path d="M28 25h164v40H28z" />
    <path className="album-runway-mark" d="M43 45h22m12 0h22m12 0h22m12 0h22" />
    {unlocked && <path className="album-runway-edge" d="M28 20v-8m164 8v-8M28 78v-8m164 8v-8" />}
  </svg>;
}

function AlbumCard({ item, kind, owned }) {
  const airport = kind !== 'models';
  return <li className={'album-card ' + (owned ? 'is-unlocked' : 'is-locked')}>
    <article aria-label={`${item.code}, ${item.name}, ${owned ? 'découvert' : 'à découvrir'}`}>
      <header><strong>{item.code}</strong><span>{owned ? 'Découvert' : 'À découvrir'}</span></header>
      <div className="album-card-art">
        {airport ? <AirportSilhouette unlocked={owned} /> : <ModelSilhouette unlocked={owned} />}
        {!owned && <i aria-hidden="true">?</i>}
      </div>
      <div className="album-card-copy">
        <h3>{item.name || item.code}</h3>
        <p>{airport ? (kind === 'departures' ? 'Aéroport de départ' : 'Aéroport d’arrivée') :
          [item.manufacturer, item.engineCount && item.engineType ? `${item.engineCount} × ${item.engineType}` : null].filter(Boolean).join(' · ') || 'Modèle ICAO'}</p>
      </div>
      <footer>{owned ? <><strong>{owned.count}</strong><span>capture{owned.count === 1 ? '' : 's'}</span></> :
        <span>Capture-le pour compléter la fiche</span>}</footer>
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
    <p className="album-source">Modèles : ICAO Doc 8643 · Aéroports : OurAirports, domaine public.</p>
  </section>;
}
