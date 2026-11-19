import { useEffect, useMemo, useState } from 'react';
import { collectionRequest } from './collectionRequest.js';
import { collectionProgress } from './collectionProgress.js';

const number = new Intl.NumberFormat('fr-FR');
const categories = {
  airlines: ['Compagnies', 'OpenFlights · référentiel historique'],
  models: ['Modèles', 'OACI · codes de type'],
  manufacturers: ['Codes constructeur', 'OACI · marques, filiales et coentreprises']
};

export default function CollectionProgress({ data, tab }) {
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    collectionRequest('?view=progress', { signal: controller.signal }, '/api/catalog').then(reference => {
      if (!controller.signal.aborted) setResult({ reference });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ error: true });
    });
    return () => controller.abort();
  }, [attempt]);
  const progress = useMemo(() => collectionProgress(data, result?.reference), [data, result?.reference]);
  const keys = tab === 'stats' || tab === 'album' ? Object.keys(categories) : Object.hasOwn(categories, tab) ? [tab] : [];
  if (!keys.length) return null;
  return <section className="collection-progress" aria-labelledby="collection-progress-title">
    <header><h2 id="collection-progress-title">Progression de la collection</h2><p>Sur l’ensemble de tes captures</p></header>
    <ul>{keys.map(key => {
      const [label, source] = categories[key];
      const { found, total, outside } = progress[key];
      return <li key={key}>
        <h3>{label}</h3>
        <p><strong>{number.format(found)}</strong>{total > 0 ? ` / ${number.format(total)} au catalogue` : ' identifiés'}</p>
        {total > 0 && <progress value={found} max={total} aria-label={`Progression · ${label}`} />}
        <small>{source}{outside > 0 && ` · +${number.format(outside)} hors référentiel`}</small>
      </li>;
    })}</ul>
    {keys.some(key => key !== 'airlines') && (!result ? <p role="status">Chargement des totaux OACI…</p> : result.error &&
      <div className="collection-progress-error"><p role="status">Totaux OACI temporairement indisponibles.</p>
        <button type="button" className="collection-back" onClick={() => { setResult(null); setAttempt(value => value + 1); }}>Réessayer</button></div>)}
  </section>;
}
