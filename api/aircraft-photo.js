import { reply } from '../lib/adsb.js';

const cache = new Map();
const unsuitable = /\b(logo|cabin|cockpit|interior|seat|map|diagram|drawing|icon|scheme|museum)\b/i;

export function plainText(value = '') {
  return value.replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|#160);/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ').trim();
}

export function selectAircraftPhoto(data) {
  const pages = data?.query?.pages ?? [];
  const page = pages.find(candidate => {
    const image = candidate.imageinfo?.[0];
    return image?.thumburl && /^image\/(?:jpeg|png|webp)$/i.test(image.mime || '') && !unsuitable.test(candidate.title || '');
  });
  if (!page) return null;
  const image = page.imageinfo[0];
  const metadata = image.extmetadata ?? {};
  return {
    url: image.thumburl,
    page: image.descriptionurl,
    author: plainText(metadata.Artist?.value || metadata.Credit?.value || 'Contributeur Wikimedia Commons').slice(0, 120),
    license: plainText(metadata.LicenseShortName?.value || 'Licence indiquée sur la page source').slice(0, 60)
  };
}

export function selectPlanespottersPhoto(data) {
  const candidate = data?.photos?.[0];
  if (!candidate?.thumbnail_large?.src || !candidate?.link || !candidate?.photographer) return null;
  const image = new URL(candidate.thumbnail_large.src);
  const page = new URL(candidate.link);
  if (!image.hostname.endsWith('.plnspttrs.net') || page.hostname !== 'www.planespotters.net') return null;
  return { url: image.href, page: page.href, author: plainText(candidate.photographer).slice(0, 120),
    license: 'Photo liée à sa page source', source: 'Planespotters.net' };
}

async function mediaWiki(host, params) {
  const response = await fetch(`https://${host}/w/api.php?${params}`, {
    headers: { 'User-Agent': 'Flippy/1.0 (https://github.com/mytil67/flippy)' }, signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`${host} indisponible`);
  return response.json();
}

async function commonsPhoto(query) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', generator: 'search',
    gsrsearch: `filetype:bitmap ${query}`, gsrnamespace: '6', gsrlimit: '8',
    prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiurlwidth: '760',
    iiextmetadatafilter: 'Artist|Credit|LicenseShortName'
  });
  const photo = selectAircraftPhoto(await mediaWiki('commons.wikimedia.org', params));
  return photo && { ...photo, source: 'Wikimedia Commons' };
}

async function wikipediaPhoto(query) {
  const search = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', generator: 'search', gsrsearch: query,
    gsrnamespace: '0', gsrlimit: '6', prop: 'pageimages', piprop: 'name|thumbnail', pithumbsize: '760', pilicense: 'free'
  });
  const pages = (await mediaWiki('en.wikipedia.org', search))?.query?.pages ?? [];
  const article = pages.find(page => page.pageimage && page.thumbnail?.source && !unsuitable.test(page.title || ''));
  if (!article) return null;
  const details = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', titles: `File:${article.pageimage}`,
    prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiurlwidth: '760',
    iiextmetadatafilter: 'Artist|Credit|LicenseShortName'
  });
  const photo = selectAircraftPhoto(await mediaWiki('en.wikipedia.org', details));
  return photo && { ...photo, source: 'Wikipédia' };
}

async function planespottersPhoto(hex) {
  if (!/^[0-9a-f]{6}$/.test(hex)) return null;
  const response = await fetch(`https://api.planespotters.net/pub/photos/hex/${hex}`, {
    headers: { 'User-Agent': 'Flippy/1.0 (https://github.com/mytil67/flippy)' }, signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) return null;
  return selectPlanespottersPhoto(await response.json());
}

async function findPhoto(code, name, manufacturer, hex) {
  const key = [code, name, manufacturer, hex].join('|');
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;
  if (!cached || cached.expires <= Date.now()) {
    const query = [manufacturer, name, code, 'aircraft'].filter(Boolean).join(' ');
    const promise = planespottersPhoto(hex).catch(() => null).then(photo => photo || commonsPhoto(query).catch(() => null))
      .then(photo => photo || wikipediaPhoto(query)).catch(error => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, { promise, expires: Date.now() + (hex ? 86400000 : 604800000) });
  }
  return cache.get(key).promise;
}

export default async function handler(request, response) {
  if (request.method !== 'GET') return reply(response, 405, { error: 'Méthode non autorisée' });
  const { searchParams } = new URL(request.url, 'http://localhost');
  const code = (searchParams.get('code') || '').trim().toUpperCase();
  const name = (searchParams.get('name') || '').trim().slice(0, 80);
  const manufacturer = (searchParams.get('manufacturer') || '').trim().slice(0, 60);
  const hex = (searchParams.get('hex') || '').trim().toLowerCase();
  if (!/^[A-Z0-9]{2,5}$/.test(code) || !name) return reply(response, 400, { error: 'Modèle invalide' });
  try {
    const photo = await findPhoto(code, name, manufacturer, hex);
    return reply(response, 200, { photo }, photo?.source === 'Planespotters.net' ? 86400 : 604800);
  } catch {
    return reply(response, 503, { error: 'Photo temporairement indisponible' }, 300);
  }
}
