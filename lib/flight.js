export const center = [48.60749, 7.74931];
export const radius = 100;

export function distanceKm([lat1, lon1], [lat2, lon2]) {
  const radians = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * radians / 2) ** 2 +
    Math.cos(lat1 * radians) * Math.cos(lat2 * radians) *
    Math.sin((lon2 - lon1) * radians / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, a)));
}

const operators = {
  AFR: ['Air France', 'AF'], AUA: ['Austrian Airlines', 'OS'],
  BAW: ['British Airways', 'BA'], BEL: ['Brussels Airlines', 'SN'],
  CFG: ['Condor', 'DE'], CLX: ['Cargolux', 'CV'], DLH: ['Lufthansa', 'LH'],
  EIN: ['Aer Lingus', 'EI'], EJU: ['easyJet Europe', 'EC'],
  EZS: ['easyJet Switzerland', 'DS'], EZY: ['easyJet', 'U2'],
  EWG: ['Eurowings', 'EW'], FBU: ['French bee', 'BF'], FDX: ['FedEx Express', 'FX'],
  FIN: ['Finnair', 'AY'], IBE: ['Iberia', 'IB'],
  KLM: ['KLM', 'KL'], LGL: ['Luxair', 'LG'],
  LOT: ['LOT Polish Airlines', 'LO'], OCN: ['Discover Airlines', '4Y'], RYR: ['Ryanair', 'FR'],
  SAS: ['Scandinavian Airlines', 'SK'], SWR: ['Swiss International Air Lines', 'LX'],
  TAP: ['TAP Air Portugal', 'TP'], THY: ['Turkish Airlines', 'TK'],
  TVF: ['Transavia France', 'TO'], UAE: ['Emirates', 'EK'],
  VLG: ['Vueling', 'VY'], VLO: ['Volotea', 'V7'],
  WMT: ['Wizz Air Malta', 'W4'], WZZ: ['Wizz Air', 'W6']
};

export function operatorCode(callsign) {
  return callsign.match(/^([A-Z]{3})(?=[A-Z]*\d)/)?.[1];
}

export function knownAirline(callsign) {
  const icao = operatorCode(callsign);
  const operator = operators[icao];
  return operator ? { name: operator[0], iata: operator[1], icao } : null;
}
