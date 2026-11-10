import { memo, useEffect, useMemo, useRef } from 'react';
import { Circle, CircleMarker, MapContainer, Marker, Polyline, ScaleControl, TileLayer, Tooltip, useMap, ZoomControl } from 'react-leaflet';
import { divIcon, latLngBounds, point } from 'leaflet';
import { center, radius, distanceKm } from '../lib/flight.js';

export const planePath = 'M12 2c1 0 1.6 1.1 1.6 2.3v5.1l7.4 5v1.8l-7.4-2.5v4.5l2.3 1.7v1.5L12 20.3l-3.9 1.1v-1.5l2.3-1.7v-4.5L3 16.2v-1.8l7.4-5V4.3C10.4 3.1 11 2 12 2Z';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const timeLabel = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit' });

function MapActions({ recenter, bounds, panel, fitRevision, following, tracked, fitReady }) {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  useEffect(() => {
    if (recenter) map.setView(center, 8, { animate: false });
  }, [map, recenter]);
  useEffect(() => {
    if (!bounds || following || !fitReady) return;
    const frame = requestAnimationFrame(() => {
      const mobile = matchMedia('(max-width: 720px)').matches;
      const overlay = panel.current?.getBoundingClientRect();
      const topLeft = point(60, mobile ? 105 : 120);
      const bottomRight = mobile ? point(38, (overlay?.height ?? 0) + 48) : point((overlay?.width ?? 0) + 52, 65);
      const area = latLngBounds(bounds);
      const zoom = Math.min(9, map.getBoundsZoom(area, false, topLeft.add(bottomRight)));
      const middle = map.project(area.getSouthWest(), zoom).add(map.project(area.getNorthEast(), zoom)).divideBy(2);
      const target = map.unproject(middle.add(bottomRight.subtract(topLeft).divideBy(2)), zoom);
      map.stop();
      if (reducedMotion()) map.setView(target, zoom, { animate: false });
      else map.flyTo(target, zoom, { duration: 0.68 });
    });
    return () => cancelAnimationFrame(frame);
  }, [map, bounds, panel, following, fitRevision, fitReady]);
  const lat = tracked?.lat;
  const lon = tracked?.lon;
  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const overlay = panel.current?.getBoundingClientRect();
    const mobile = matchMedia('(max-width: 720px)').matches;
    const offset = mobile ? point(0, (overlay?.height ?? 0) / 2) : point((overlay?.width ?? 0) / 2, 0);
    const screen = map.latLngToContainerPoint([lat, lon]);
    const target = map.getSize().divideBy(2).subtract(offset);
    if (target.distanceTo(screen) <= 38) return;
    map.stop();
    map.panTo(map.unproject(map.project([lat, lon]).add(offset)), { animate: !reducedMotion(), duration: 0.55 });
  }, [map, panel, lat, lon]);
  return null;
}

function aircraftIcon(heading, active) {
  const angle = Number.isFinite(heading) ? heading : 0;
  return divIcon({
    className: 'aircraft-marker' + (active ? ' is-active at-click' : ''),
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<svg viewBox="0 0 24 24" style="transform:rotate(${angle}deg)" aria-hidden="true"><path d="${planePath}"/></svg>`
  });
}

const traceStyle = { color: '#087a70', weight: 4, opacity: 1, className: 'observed-trace' };
const guideStyle = { color: '#5d6681', weight: 2, opacity: 0.94, dashArray: '4 8' };
const replayStyle = { color: '#b96009', weight: 4, opacity: 1, className: 'observed-trace' };

function TraceLine({ positions }) {
  const line = useRef(null);
  useEffect(() => {
    const path = line.current?.getElement();
    if (!path || reducedMotion()) return;
    path.setAttribute('pathLength', '1');
    const animation = path.animate(
      [{ strokeDasharray: '1 1', strokeDashoffset: '1' }, { strokeDasharray: '1 1', strokeDashoffset: '0' }],
      { duration: 780, easing: 'cubic-bezier(.2,.75,.3,1)' }
    );
    return () => animation.cancel();
  }, [positions]);
  return <Polyline ref={line} positions={positions} interactive={false} pathOptions={traceStyle} />;
}

function buildGeometry(focus, route, segments) {
  if (!focus) return null;
  const point = [focus.plane.lat, focus.plane.lon];
  const wrap = ([lat, lon]) => [lat, lon + 360 * Math.round((point[1] - lon) / 360)];
  const airportPoint = airport => Number.isFinite(airport?.lat) && Number.isFinite(airport?.lon) ? wrap([airport.lat, airport.lon]) : null;
  const from = airportPoint(route?.from);
  const to = airportPoint(route?.to);
  const tracks = segments?.map(segment => segment.map(wrap)) ?? [];
  const first = tracks[0]?.[0] ?? point;
  const guides = [];
  if (from && distanceKm(from, first) > 2) guides.push([from, first]);
  if (to) guides.push([point, to]);
  return { from, to, tracks, guides, bounds: [point, ...[from, to].filter(Boolean), ...tracks.flat()] };
}

function AirportPin({ position, airport, title, arrival = false }) {
  if (!position) return null;
  return <CircleMarker center={position} radius={6} pathOptions={{ color: '#243e60', weight: 2, fillColor: '#fff', fillOpacity: 1 }}>
    <Tooltip permanent direction={arrival ? 'bottom' : 'top'} offset={[0, arrival ? 7 : -7]} className="airport-tooltip">
      <small>{title} {airport.code && <b>{airport.code}</b>}</small><strong>{airport.name || airport.code}</strong>
    </Tooltip>
  </CircleMarker>;
}

const Aircraft = memo(function Aircraft({ plane, active, muted, onSelect }) {
  const label = plane.callsign || plane.registration || plane.id.toUpperCase();
  return <Marker position={[plane.lat, plane.lon]} icon={aircraftIcon(plane.heading, active)}
    title={label} alt={label} opacity={muted ? 0.55 : 1} zIndexOffset={active ? 1000 : 0} eventHandlers={{ click: () => onSelect(plane) }}>
    <Tooltip permanent={active} direction="top" offset={[0, -17]} className={active ? 'click-tooltip' : ''}>
      {active ? label + (plane.observedAt ? ' · ' + timeLabel.format(plane.observedAt) : ' · au clic') : label}
    </Tooltip>
  </Marker>;
});

function LivePosition({ plane }) {
  const marker = useRef(null);
  const initial = useRef([plane.lat, plane.lon]);
  const previous = useRef(plane.observedAt);
  const { lat, lon, observedAt } = plane;
  useEffect(() => {
    const layer = marker.current;
    if (!layer) return;
    const start = layer.getLatLng();
    const since = observedAt - previous.current;
    previous.current = observedAt;
    const delta = ((lon - start.lng + 540) % 360) - 180;
    if (reducedMotion() || since <= 0 || since > 60000 ||
        distanceKm([start.lat, start.lng], [lat, lon]) > 4 + since / 2700) {
      layer.setLatLng([lat, lon]);
      return;
    }
    const began = performance.now();
    let frameId;
    function draw(now) {
      const t = Math.min(1, (now - began) / 680);
      const ease = 1 - (1 - t) ** 3;
      layer.setLatLng([start.lat + (lat - start.lat) * ease, start.lng + delta * ease]);
      if (t < 1) frameId = requestAnimationFrame(draw);
    }
    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, [lat, lon, observedAt]);
  return <CircleMarker ref={marker} center={initial.current} radius={9}
    pathOptions={{ color: '#fff', weight: 2.5, fillColor: '#0966b3', fillOpacity: 1, className: 'live-marker' }}>
    <Tooltip permanent direction="bottom" offset={[0, 7]} className="live-tooltip">Direct · {timeLabel.format(observedAt)}</Tooltip>
  </CircleMarker>;
}

export default function RadarMap({ planes, focus, route, segments, onSelect, recenter, panel, following, tracked, replay, fitRevision, fitReady }) {
  const geometry = useMemo(() => buildGeometry(focus, route, segments), [focus, route, segments]);
  const original = focus?.plane;
  const moved = tracked && (tracked.lat !== original?.lat || tracked.lon !== original?.lon);
  const replayPosition = replay && [
    replay.position[0], replay.position[1] + 360 * Math.round((original.lon - replay.position[1]) / 360)
  ];
  const replayTrack = replayPosition && geometry.tracks[replay.part];
  const replayLine = replayTrack && [...geometry.tracks.slice(0, replay.part), [...replayTrack.slice(0, replay.index + 1), replayPosition]];
  return (
    <MapContainer center={center} zoom={8} minZoom={1} maxZoom={14} zoomControl={false}
      scrollWheelZoom worldCopyJump className="map">
      <MapActions recenter={recenter} bounds={geometry?.bounds} panel={panel} following={following} tracked={tracked} fitRevision={fitRevision} fitReady={fitReady} />
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" updateWhenZooming={false}
        attribution={'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'} />
      <ZoomControl position="topleft" />
      <ScaleControl position="bottomleft" imperial={false} />
      {!focus && [25000, 50000, radius * 1000].map(distance => (
        <Circle key={distance} center={center} radius={distance} interactive={false}
          pathOptions={{ color: '#42636e', opacity: distance === radius * 1000 ? 0.6 : 0.28, dashArray: '5 7', weight: 1, fill: false }} />
      ))}
      <CircleMarker center={center} radius={5} pathOptions={{ color: '#fff', weight: 2, fillColor: '#10263d', fillOpacity: 1 }}>
        <Tooltip direction="bottom" offset={[0, 7]}>Schiltigheim</Tooltip>
      </CircleMarker>
      {!focus && <CircleMarker center={[48.542, 7.634]} radius={4} pathOptions={{ color: '#fff', weight: 1.5, fillColor: '#38627c', fillOpacity: 1 }}>
        <Tooltip direction="bottom" offset={[0, 5]}>Entzheim · SXB</Tooltip>
      </CircleMarker>}
      {geometry && <>
        <Polyline positions={geometry.guides} interactive={false} pathOptions={guideStyle} />
        {geometry.tracks.map((segment, index) => <TraceLine key={index} positions={segment} />)}
        {replayLine && <Polyline positions={replayLine} interactive={false} pathOptions={replayStyle} />}
        <AirportPin position={geometry.from} airport={route?.from} title="Départ" />
        <AirportPin position={geometry.to} airport={route?.to} title="Arrivée" arrival />
      </>}
      {planes.filter(plane => plane.id !== focus?.plane.id).map(plane =>
        <Aircraft key={plane.id} plane={plane} onSelect={onSelect} muted={Boolean(focus)} />
      )}
      {focus && <Aircraft key={focus.revision} plane={focus.plane} active onSelect={onSelect} />}
      {moved && <LivePosition plane={tracked} />}
      {replayPosition && <CircleMarker center={replayPosition} radius={7} interactive={false}
        pathOptions={{ color: '#fff', weight: 2, fillColor: '#ad5700', fillOpacity: 1 }} />}
    </MapContainer>
  );
}
