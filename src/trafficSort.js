const value = (plane, key, fallback) => Number.isFinite(plane?.[key]) ? plane[key] : fallback;

export function orderTraffic(planes, sort = 'distance') {
  return [...planes].sort((a, b) => {
    const comparison = sort === 'distance'
      ? value(a, 'distance', Infinity) - value(b, 'distance', Infinity)
      : value(b, sort, -Infinity) - value(a, sort, -Infinity);
    return comparison || value(a, 'distance', Infinity) - value(b, 'distance', Infinity);
  });
}
