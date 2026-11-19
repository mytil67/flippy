import { discoveryLabels } from './radarDiscoveries.js';

export function DiscoveryBadges({ discoveries }) {
  return discoveries.length > 0 && <ul className="discovery-badges" aria-label="Découvertes possibles">
    {discoveries.map(key => <li key={key}>{discoveryLabels[key]}</li>)}
  </ul>;
}

export function DiscoveryToggle({ active, onToggle }) {
  return <button type="button" className="discovery-toggle" aria-pressed={active} onClick={onToggle}>
    <span aria-hidden="true">✦</span> À découvrir
  </button>;
}
