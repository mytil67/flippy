import airlineReference from '../lib/airlineReference.json' with { type: 'json' };
import { collectionManufacturers } from './collectionManufacturers.js';

const airlineCodes = new Set(airlineReference.codes);
const normalizeCode = code => code?.trim().toUpperCase();

export function collectionProgress({ airlines = [], models = [] }, reference) {
  const seenAirlines = new Set(airlines.map(item => {
    const code = normalizeCode(item.code);
    return airlineReference.aliases[code] ?? code;
  }).filter(Boolean));
  const seenModels = new Set(models.map(item => normalizeCode(item.code)).filter(Boolean));
  const matchedAirlines = [...seenAirlines].filter(code => airlineCodes.has(code)).length;
  const airlineProgress = { found: matchedAirlines, total: airlineCodes.size, outside: seenAirlines.size - matchedAirlines };

  if (!reference) {
    return { airlines: airlineProgress, models: { found: seenModels.size },
      manufacturers: { found: collectionManufacturers(models).filter(item => item.code !== 'Constructeur non identifié').length } };
  }

  const { modelManufacturers, manufacturerTotal } = reference;
  const matchedModels = [...seenModels].filter(code => Object.hasOwn(modelManufacturers, code));
  const manufacturers = new Set(matchedModels.map(code => modelManufacturers[code]).filter(Boolean));
  return {
    airlines: airlineProgress,
    models: { found: matchedModels.length, total: Object.keys(modelManufacturers).length, outside: seenModels.size - matchedModels.length },
    manufacturers: { found: manufacturers.size, total: manufacturerTotal }
  };
}
