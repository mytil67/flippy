import { useEffect, useState } from 'react';
import { knownAirline } from '../lib/flight.js';

const number = new Intl.NumberFormat('fr-FR');
const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' });
const tabs = [['recent', 'Captures'], ['planes', 'Avions'], ['models', 'Modèles'], ['airlines', 'Compagnies']];
const distance = km => km == null ? 'Distance indisponible' : number.format(km) + ' km';
const searchText = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const names = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

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
  const [failed, setFailed] = useState('');
  const logo = iata || (/^[A-Z0-9]{2}$/.test(code) ? code : knownAirline((code || '') + '1')?.iata) || flight?.match(/^([A-Z0-9]{2})(?=\d)/)?.[1];
  return <span className="collection-logo">
    {/^[A-Z0-9]{2}$/.test(logo) && failed !== logo ? <img src={`https://pics.avs.io/160/54/${logo}.png`} alt={name ? `Logo ${name}` : ''} loading="lazy" onError={() => setFailed(logo)} /> : <span>{code || '✈'}</span>}
  </span>;
}

export async function collectionRequest(query = '', options, path = '/api/collection') {
  const timeout = AbortSignal.timeout(30000);
  const signal = options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const response = await fetch(path + query, { ...options, signal });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'La collection est indisponible.'), { status: response.status });
  return data;
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

function CollectionCard({ item, tab }) {
  const recent = tab === 'recent';
  const airline = tab === 'airlines';
  const flight = item.flight_number || item.callsign || item.registration || item.aircraft?.toUpperCase();
  return <li className="collection-card">
    {airline ? <div className="company-art"><CompanyLogo code={item.code} iata={item.iata} name={item.name} /></div> :
      <AircraftArt code={tab === 'models' ? item.code : item.model_code} />}
    <div className="collection-card-body">
      <h3>{recent ? flight : item.name}</h3>
      {recent && item.departure_code && item.arrival_code && <p className="collection-route">{item.departure_code} → {item.arrival_code}</p>}
      {recent && <p>{[item.model || item.model_code, item.airline].filter(Boolean).join(' · ') || 'Appareil non identifié'}</p>}
      {tab === 'planes' && item.model && <p>{item.model}</p>}
      {recent && item.airline && <CompanyLogo code={item.airline_code} iata={item.airline_iata} flight={item.flight_number} name={item.airline} />}
    </div>
    <div className="collection-card-meta">
      <div><strong>{item.route_km == null ? 'Trajet inconnu' : distance(item.route_km)}</strong>
        <span>{item.route_km != null && (recent ? ' · départ → arrivée' : ' · trajets cumulés')}</span></div>
      <span>{distance(recent ? item.observed_km : item.kilometers)}{(recent ? item.observed_km : item.kilometers) != null && ' observés'}</span>
      <span>{recent ? date.format(new Date(item.captured_at)) : `${item.count} capture${item.count === 1 ? '' : 's'}`}</span></div>
  </li>;
}

export default function Collection() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('recent');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('default');
  const [accountOpen, setAccountOpen] = useState(window.location.hash === '#compte');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    document.title = 'Ma collection — Flippy';
    const controller = new AbortController();
    collectionRequest('', { signal: controller.signal }).then(setData).catch(error => {
      if (!controller.signal.aborted) setError(error.message);
    });
    return () => controller.abort();
  }, [attempt]);

  const items = data?.[tab] ?? [];
  const term = searchText(query.trim());
  const filtered = term ? items.filter(item => searchText([
    item.name, item.code, item.flight_number, item.callsign, item.registration, item.aircraft,
    item.model, item.model_code, item.airline, item.airline_code, item.airline_iata, item.departure_code, item.arrival_code
  ].filter(Boolean).join(' ')).includes(term)) : items;
  const visible = sort === 'distance' ? [...filtered].sort((a, b) =>
    (b.route_km ?? -1) - (a.route_km ?? -1)) :
    sort === 'name' ? [...filtered].sort((a, b) => names.compare(a.name ?? a.flight_number ?? a.callsign, b.name ?? b.flight_number ?? b.callsign)) : filtered;
  const showAccount = Boolean(data && (!data.account || data.localCount || accountOpen));

  function changeTab(next) {
    setTab(next);
    setQuery('');
    setSort('default');
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
        <div className="collection-intro">
          <h1>Mon carnet de vol</h1>
          <p>Les avions croisés au-dessus de l’Alsace, leurs routes et les kilomètres parcourus.</p>
        </div>
        <AircraftArt code="A359" />
      </header>
      {error ? <div className="collection-empty"><p role="alert">{error}</p><button type="button" onClick={() => {
        setError(''); setAttempt(value => value + 1);
      }}>Réessayer</button></div> : !data ? <p role="status" className="collection-empty">Chargement…</p> : <div className={'collection-layout' + (showAccount ? ' has-account' : '')}>
        <section className="collection-board" aria-label="Tableau de chasse">
          <dl className="collection-stats">
            <div><dt>Captures</dt><dd>{number.format(data.count)}</dd><span>{number.format(data.aircraft)} avion{data.aircraft === 1 ? '' : 's'} distinct{data.aircraft === 1 ? '' : 's'}</span></div>
            <div><dt>Total départ → arrivée</dt><dd>{data.routeKilometers == null ? '—' : distance(data.routeKilometers)}</dd></div>
            <div><dt>Distance observée</dt><dd>{distance(data.kilometers)}</dd></div>
            {data.record && <div className="collection-record"><dt>Plus long trajet</dt><dd>{distance(data.record.kilometers)}</dd><span>{data.record.flight}</span></div>}
          </dl>
          {data.count > 0 && <p className="collection-note">Trajets calculés à vol d’oiseau entre aéroports pour {data.routeCount ?? 0} captures sur {data.count}. La distance observée couvre les segments ADS-B disponibles.</p>}
          <nav className="collection-tabs" aria-label="Vues de la collection">
            {tabs.map(([key, label]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => { if (key !== tab) changeTab(key); }}>
              {label}{key !== 'recent' && <span> {data[key].length}</span>}
            </button>)}
          </nav>
          {items.length > 0 && <div className="collection-filters">
            <input type="search" aria-label="Rechercher dans cette vue" placeholder="Rechercher dans cette vue" value={query} onChange={event => setQuery(event.target.value)} />
            <select aria-label="Trier les résultats" value={sort} onChange={event => setSort(event.target.value)}>
              <option value="default">{tab === 'recent' ? 'Plus récentes' : 'Kilomètres des trajets cumulés'}</option>
              {tab === 'recent' && <option value="distance">Plus longs trajets</option>}
              <option value="name">Ordre alphabétique</option>
            </select>
          </div>}
          {term && <p className="collection-note collection-result" role="status">{visible.length} résultat{visible.length === 1 ? '' : 's'}</p>}
          {visible.length ? <ul className="collection-list" aria-label={tabs.find(([key]) => key === tab)[1]}>
            {visible.map(item => <CollectionCard key={item.code ?? `${item.aircraft}:${item.callsign}:${item.captured_at}`} item={item} tab={tab} />)}
          </ul> : <div className="collection-empty">
            {term ? <p>Aucun résultat pour cette recherche.</p> : data.count ? <p>Aucune entrée dans cette catégorie.</p> : <>
              <p>Sélectionne un avion en direct et clique sur « Capturer » pour commencer.</p>
              <a className="collection-back" href="/">Ouvrir le radar</a>
            </>}
          </div>}
        </section>
        {showAccount && <Account data={data} onUpdate={next => { setData(next); changeTab('recent'); }} />}
      </div>}
    </div>
  </main>;
}
