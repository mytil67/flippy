export function captureIdentity(item) {
  const flight = item.flight_number?.trim();
  const callsign = item.callsign?.trim();
  const registration = item.registration?.trim();
  if (flight) return { title: `Vol ${flight}`, callsign: callsign?.toUpperCase() === flight.toUpperCase() ? undefined : callsign };
  if (callsign) return { title: `Indicatif ${callsign}` };
  if (registration) return { title: `Immatriculation ${registration}` };
  const aircraft = item.aircraft?.trim().toUpperCase();
  return { title: aircraft ? `Adresse ICAO ${aircraft}` : 'Vol non identifié' };
}
