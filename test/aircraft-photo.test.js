import test from 'node:test';
import assert from 'node:assert/strict';
import { plainText, selectAircraftPhoto } from '../api/aircraft-photo.js';

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
