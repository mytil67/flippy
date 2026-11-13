# FLIPPY

FLIPPY suit les avions dans un rayon de 100 km autour de Schiltigheim. Le radar affiche la position au clic, le billet de vol et la trace ADS-B disponible. La page Collection rassemble les vols capturés et permet d’explorer leurs liaisons, compagnies et modèles d’avion.

Production · [flippy.stefe.app](https://flippy.stefe.app/) · [flippy-zeta.vercel.app](https://flippy-zeta.vercel.app/)

## Développement local

Utiliser Node.js 22 (22.12 minimum) et npm.

```bash
npm ci
npm run dev
```

Ouvrir le [radar local](http://localhost:8765/) ou la [collection locale](http://localhost:8765/collection). Sous Windows, `Lancer le radar.cmd` installe les dépendances si nécessaire et ouvre le navigateur. Le mode Démo fournit des positions et des traces fictives pour tester le billet et la relecture sans flux ADS-B. Le fond de carte reste chargé depuis OpenStreetMap.

Vite monte les fonctions du radar, des photos, du compte et de la collection sur le serveur local. `/api/catalog` est servi par Vercel.

Le bouton **Station radar** ouvre l’affichage tablette. L’URL `/?station=1&interval=30` ouvre directement ce mode et règle l’intervalle à 30 secondes. Le défilement démarre après un appui sur **Lancer le défilement**. Il privilégie les vols en direct puis les passages récents, et s’arrête lorsqu’un vol est sélectionné à la main. Lors d’une capture, le billet reste à l’écran pendant l’enregistrement. Le défilement reprend ensuite s’il était actif.

### Configuration serveur

| Variable | Utilisation |
| --- | --- |
| `FLYITALYADSB_API_KEY` | Active les traces d’appareil et l’historique des liaisons. Le radar en direct dispose de ses propres sources. |
| `DATABASE_URL` | Connexion à PostgreSQL sur Neon pour les captures, la collection et ses statistiques. |
| `NEON_AUTH_BASE_URL` | URL de Neon Auth pour l’inscription, la connexion et la vérification de session. |

Ces variables sont lues côté serveur via `process.env`. Dans Vercel, les renseigner dans l’environnement visé et redéployer après une modification. Pour travailler en local avec des services de développement, placer les valeurs dans `.env.local`, ignoré par Git, puis les charger explicitement dans le processus Vite.

```bash
node --env-file=.env.local ./node_modules/vite/bin/vite.js --port 8765
```

Dans la station, **Passages** liste les avions détectés qui se rapprochent du radar dans les 20 prochaines minutes. L’estimation projette le cap et la vitesse sol du dernier relevé et donne le temps et la distance au point le plus proche de Schiltigheim. Les relevés de plus d’une minute et les avions qui s’éloignent sont écartés. Toucher un vol ouvre son billet, met le défilement en pause et affiche en pointillés le passage estimé sur la carte.

## Architecture

| Emplacement | Responsabilité |
| --- | --- |
| `src/main.jsx` | Point d’entrée React. Charge le radar sur `/` et la collection sur `/collection`. |
| `src/App.jsx`, `src/RadarMap.jsx` | Sélection du vol, billet, carte Leaflet, suivi et relecture. |
| `src/traceGeometry.js`, `src/liveTrail.js` | Tracé cartographique, coupures de couverture et historique local du radar. |
| `lib/adsb.js`, `lib/trace.js` | Accès aux sources externes, normalisation des positions et reconstruction de la trace. |
| `lib/routeEvidence.js` | Validation du trajet et calcul de la distance, partagés par le radar et l’enregistrement des captures. |
| `src/Collection.jsx`, `src/CollectionAlbum.jsx`, `src/collectionInsights.js` | Collection, carnet et statistiques des liaisons capturées. |
| `api/`, `db/` | Fonctions HTTP Vercel et migrations SQL de la collection. |

Le radar interroge ADSB.lol, avec ADSB.fi en secours. Le fond de carte vient d’OpenStreetMap. Les aéroports sont identifiés à partir du référentiel OurAirports intégré dans `lib/airports.json`. Les logos utilisent le code IATA de la compagnie quand il est disponible.

### API

Les heures de position (`observedAt`, `at`) sont en millisecondes Unix. Les coordonnées sont en degrés décimaux. L’altitude ADS-B est en pieds et la vitesse sol en nœuds.

| Méthode et chemin | Paramètres et résultat |
| --- | --- |
| `GET /api/vols` | Appareils en vol dans le rayon du radar, heure du relevé et source. |
| `GET /api/suivi?hex=…` | Dernière position d’un appareil par adresse ICAO hexadécimale, y compris hors du rayon. |
| `GET /api/trajet?vol=…&hex=…` | Métadonnées de l’indicatif et de l’appareil, route générique et historique disponible. Accepte `vol` ou `hex` seul. |
| `GET /api/trace?vol=…&hex=…&at=…&lat=…&lon=…` | Segments observés, horodatages, départ s’il est reconnu et source de la trace. `vol` est facultatif. Le point demandé doit dater de moins de 30 minutes. |
| `GET /api/collection` | Captures et agrégats du compte. `radar` accepte jusqu’à 150 adresses hex pour la couleur des pastilles. `airport` et `page` ouvrent le détail par aéroport. |
| `POST /api/collection?vol=…&hex=…` | Capture d’un vol encore visible. Requiert une session de compte et une requête provenant de FLIPPY. |
| `POST /api/account?action=…` | `signup`, `login` ou `logout` via Neon Auth. |
| `GET /api/catalog?kind=…&q=…` | Catalogue paginé d’aéroports ou de modèles (`airports` ou `models`). |
| `GET /api/aircraft-photo?code=…&hex=…` | Recherche d’une photo d’appareil ou de modèle, avec les crédits disponibles. |

## Comment FLIPPY détermine une arrivée

1. Au clic, le navigateur conserve la position et l’heure de l’avion et demande en parallèle les métadonnées et la trace. La trace utilise FlyItalyADSB, puis ADSB.lol et OpenSky en secours. La carte conserve les coupures de couverture et peut utiliser les positions déjà reçues par le radar.
2. `resolveFlightRoute` confronte la route ADSBDB au départ ADS-B reconnu et au déplacement de l’avion. Un départ incompatible ou un cap nettement opposé peut écarter la route générique. Le trait plein correspond aux observations. Le guide vers l’arrivée représente la direction de la destination affichée.
3. Une rotation historique du même appareil qui couvre l’heure du clic peut remplacer la route générique. Si cette correspondance manque et que la route générique est absente ou écartée, FLIPPY compare les liaisons des sept derniers jours au cap actuel. Une liaison observée un seul jour exige aussi un départ corroboré. Une seule liaison compatible peut être retenue. Les résultats historiques sont signalés comme probables dans le billet.
4. Une rotation publiée peut exceptionnellement être renseignée dans `scheduledRoutes` avec son indicatif, son adresse ICAO et une fenêtre UTC. L’entrée DAL8861 est limitée au N516DN pour sa rotation du 12 au 13 novembre 2026. Pour RYR11LC, la règle générale retrouve Dublin → Venise à partir du départ observé et de la rotation de la semaine précédente.

Le résultat peut rester incomplet si les sources manquent d’observations ou se contredisent. Les positions ADS-B alimentent la trace. La destination dépend des données de liaison et des indices disponibles pour la rotation.

## Collection et distances

Les logos des constructeurs intégrés au site proviennent de Wikimedia Commons. [Airbus](https://commons.wikimedia.org/wiki/File:Airbus_Logo_2017.svg) · [Boeing](https://commons.wikimedia.org/wiki/File:Boeing_full_logo.svg) · [Embraer](https://commons.wikimedia.org/wiki/File:Embraer_logo.svg)

- Neon Auth permet de retrouver sa collection après connexion depuis un autre navigateur. Les anciennes captures associées au navigateur peuvent être rattachées au compte par `POST /api/collection?access=claim`.
- PostgreSQL déduplique les captures sur `(collector_id, aircraft, callsign, flight_day)`. `flight_day` correspond au jour UTC de la position. La couleur de la pastille utilise la dernière capture du couple appareil et indicatif.
- `observed_km` additionne les distances dans les segments réellement disponibles, sans relier les coupures. `route_km` correspond à la distance à vol d’oiseau entre les aéroports retenus. Si les coordonnées ou les preuves nécessaires manquent, `route_km` reste `NULL`.
- Les statistiques comptent les liaisons présentes dans la collection et distinguent les deux sens, par exemple DUB → VCE et VCE → DUB. Elles décrivent cet échantillon de vols capturés.
- Pour initialiser une base de développement, exécuter les fichiers `db/001_*.sql` à `db/005_*.sql` dans l’ordre. La fonction Collection contient aussi une mise à niveau idempotente des colonnes de preuve de trajet.

## Vérification et mise en production

```bash
npm test
npm run build
```

Le projet Vercel `flippy` utilise la région `fra1`. `vercel.json` réécrit `/collection` vers `index.html` pour permettre l’accès direct à cette page. Pour un déploiement manuel, utiliser la CLI Vercel depuis la racine après avoir vérifié que le dépôt local est lié au projet `flippy` dans la bonne équipe.

```bash
vercel deploy --prod
```

Après publication, vérifier le chargement du radar et de `/collection`, puis sélectionner un vol en direct pour contrôler le billet, la trace, la position au clic et le suivi. Avec un compte de test et une base de développement, vérifier la capture, sa pastille et sa présence dans la collection depuis un second navigateur.

### Diagnostiquer une arrivée manquante

1. Relever immédiatement l’indicatif, l’adresse ICAO, l’heure et la position renvoyées par `/api/vols`. Un même indicatif peut désigner plusieurs rotations.
2. Consulter `/api/trajet` avec l’indicatif et l’adresse ICAO. Comparer `from` et `to` aux entrées `historicalRoutes` et à leurs fenêtres de temps en secondes Unix.
3. Consulter `/api/trace` avec la position d’origine avant l’expiration de la fenêtre de 30 minutes. Comparer `departure` et les derniers segments avec la route annoncée. Une trace partielle peut rester exploitable même quand aucun aéroport de départ n’est observé.
4. Rejouer le relevé dans `test/trace.test.js`. Couvrir la bonne rotation et un cas voisin où une arrivée incompatible ou ambiguë doit être écartée.

Si le radar renvoie `502`, contrôler les flux ADS-B dans les journaux Vercel. Si la collection renvoie `503`, vérifier la connexion Neon, les migrations et, pour un utilisateur connecté, la session Neon Auth. En cas de refus de connexion sur un domaine, vérifier que son origine est autorisée dans Neon Auth. Les sessions sont liées au domaine ouvert dans le navigateur.
