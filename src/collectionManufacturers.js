const manufacturerCodes = [
  ['Airbus', /^A(?:22[13]|30[06]|31[089]|32[01]|33[02389]|34[02356]|35[9K]|38[08]|(?:19|20|21)N|337|400|3ST)$/],
  ['Boeing', /^B(?:7[0-8][0-9A-Z]|3[789]M|744[DL])$/],
  ['Embraer', /^(?:E(?:1[379][05]|2[9][05]|35L|45X|50P|55P)|E[56]50)$/],
  ['ATR', /^AT(?:4[3567]|7[2356])$/],
  ['Bombardier', /^(?:CRJ[1279X]|CL(?:30|35|60)|GL[5-8]T)$/],
  ['De Havilland Canada', /^DH(?:8[ABCD]|C[2-7])$/],
  ['McDonnell Douglas', /^(?:MD(?:11|8[2378]|90)|DC(?:9[1-5]|10))$/]
];
const manufacturerNames = ['McDonnell Douglas', 'De Havilland Canada', 'Airbus', 'Boeing', 'Embraer', 'ATR', 'Bombardier',
  'Cessna', 'Piper', 'Pilatus', 'Dassault', 'Gulfstream', 'Beechcraft', 'Diamond', 'Cirrus', 'Fokker', 'Saab', 'Antonov', 'Ilyushin', 'Tupolev', 'Sukhoi'];

export function collectionManufacturers(models) {
  const groups = new Map();
  for (const item of models) {
    const name = manufacturerCodes.find(([, pattern]) => pattern.test(item.code))?.[0] ??
      manufacturerNames.find(brand => new RegExp(`\\b${brand}\\b`, 'i').test(item.name ?? '')) ?? 'Constructeur non identifié';
    const group = groups.get(name) ?? { code: name, name, models: [], count: 0, route_km: null };
    group.models.push(item);
    group.count += Number(item.count) || 0;
    if (item.route_km != null) group.route_km = (group.route_km ?? 0) + Number(item.route_km);
    groups.set(name, group);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr'));
}
