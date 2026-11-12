import test from 'node:test';
import assert from 'node:assert/strict';
import { plainText, selectAircraftPhoto, selectPlanespottersPhoto } from '../api/aircraft-photo.js';

test('nettoie les crédits HTML de Wikimedia Commons', () => {
  assert.equal(plainText('<a href="/wiki/User:Jane">Jane&nbsp;Doe</a> &amp; équipe'), 'Jane Doe & équipe');
});

test('choisit une photo et ignore les schémas techniques', () => {
  const image = (title, mime = 'image/jpeg') => ({ title, imageinfo: [{ mime, thumburl: 'https://upload.wikimedia.org/photo.jpg',
    descriptionurl: 'https://commons.wikimedia.org/wiki/File:photo.jpg', extmetadata: {
      Artist: { value: '<b>Jane Doe</b>' }, LicenseShortName: { value: 'CC BY-SA 4.0' }
    } }] });
  const result = selectAircraftPhoto({ query: { pages: [image('File:A320 seat map.jpg'), image('File:Airbus A320.jpg')] } });
  assert.deepEqual(result, {
    url: 'https://upload.wikimedia.org/photo.jpg', page: 'https://commons.wikimedia.org/wiki/File:photo.jpg',
    author: 'Jane Doe', license: 'CC BY-SA 4.0'
  });
});

test('accepte uniquement les miniatures et liens officiels Planespotters', () => {
  const data = { photos: [{ thumbnail_large: { src: 'https://t.plnspttrs.net/21/photo_280.jpg' },
    link: 'https://www.planespotters.net/photo/123/example', photographer: 'Jane Doe' }] };
  assert.equal(selectPlanespottersPhoto(data)?.author, 'Jane Doe');
  data.photos[0].thumbnail_large.src = 'https://example.com/photo.jpg';
  assert.equal(selectPlanespottersPhoto(data), null);
});
