export async function collectionRequest(query = '', options, path = '/api/collection') {
  const timeout = AbortSignal.timeout(30000);
  const signal = options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const response = await fetch(path + query, { ...options, signal });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'La collection est indisponible.'), { status: response.status });
  return data;
}
