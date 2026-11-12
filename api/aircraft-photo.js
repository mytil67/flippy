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
    license: plainText(metadata.LicenseShortName?.value || 'Licence indiquée sur Wikimedia Commons').slice(0, 60)
  };
}

async function findPhoto(code, name, manufacturer) {
  const key = [code, name, manufacturer].join('|');
  if (!cache.has(key)) {
    const query = [manufacturer, name, code, 'aircraft'].filter(Boolean).join(' ');
    const params = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', generator: 'search',
      gsrsearch: `filetype:bitmap ${query}`, gsrnamespace: '6', gsrlimit: '8',
      prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiurlwidth: '760',
      iiextmetadatafilter: 'Artist|Credit|LicenseShortName'
    });
    cache.set(key, fetch('https://commons.wikimedia.org/w/api.php?' + params, {
      headers: { 'User-Agent': 'Flippy/1.0 (https://github.com/mytil67/flippy)' }, signal: AbortSignal.timeout(12000)
    }).then(response => {
      if (!response.ok) throw new Error('Wikimedia indisponible');
      return response.json();
    }).then(selectAircraftPhoto).catch(error => {
      cache.delete(key);
      throw error;
    }));
  }
  return cache.get(key);
}

export default async function handler(request, response) {
  if (request.method !== 'GET') return reply(response, 405, { error: 'Méthode non autorisée' });
  const { searchParams } = new URL(request.url, 'http://localhost');
  const code = (searchParams.get('code') || '').trim().toUpperCase();
  const name = (searchParams.get('name') || '').trim().slice(0, 80);
  const manufacturer = (searchParams.get('manufacturer') || '').trim().slice(0, 60);
  if (!/^[A-Z0-9]{2,5}$/.test(code) || !name) return reply(response, 400, { error: 'Modèle invalide' });
  try {
    return reply(response, 200, { photo: await findPhoto(code, name, manufacturer) }, 604800);
  } catch {
    return reply(response, 503, { error: 'Photo temporairement indisponible' }, 300);
  }
}
