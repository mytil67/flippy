import { memo, useEffect, useMemo, useRef } from 'react';
import { Circle, CircleMarker, MapContainer, Marker, Polyline, ScaleControl, TileLayer, Tooltip, useMap, ZoomControl } from 'react-leaflet';
import { divIcon, latLngBounds, point } from 'leaflet';
import { center, radius, distanceKm } from '../lib/flight.js';
import { nearLongitude } from './traceGeometry.js';
import { captureFlightKey, captureLabels } from './captureStatus.js';

export const planePath = 'M12 2c1 0 1.6 1.1 1.6 2.3v5.1l7.4 5v1.8l-7.4-2.5v4.5l2.3 1.7v1.5L12 20.3l-3.9 1.1v-1.5l2.3-1.7v-4.5L3 16.2v-1.8l7.4-5V4.3C10.4 3.1 11 2 12 2Z';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const timeLabel = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit' });

function mapPadding(map, panel) {
  const { x: width, y: height } = map.getSize();
  const mobile = matchMedia('(max-width: 720px)').matches;
  const side = Math.min(mobile ? 84 : 96, Math.floor(width / 4));
  const right = !mobile && panel ? width - panel.offsetLeft + side : side;
  const bottom = mobile && panel ? height - panel.offsetTop + 30 : 64;
  const top = Math.min(mobile ? 128 : 146, Math.floor((height - bottom) * 0.6));
  return { topLeft: point(side, top), bottomRight: point(right, bottom) };
}

function MapActions({ recenter, bounds, panel, fitRevision, following, tracked, fitReady, localFocus }) {
  const map = useMap();
  const lastLocalFit = useRef(null);
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
    const overlay = panel.current;
    let frame;
    let previousLayout;
    function fit() {
      const { topLeft, bottomRight } = mapPadding(map, overlay);
      const layout = [map.getSize().x, map.getSize().y, topLeft.x, topLeft.y, bottomRight.x, bottomRight.y].join(':');
      if (layout === previousLayout) return;
      previousLayout = layout;
      const last = lastLocalFit.current;
      if (localFocus && last?.focus === localFocus && last.revision === fitRevision && last.layout === layout) return;
      lastLocalFit.current = localFocus ? { focus: localFocus, revision: fitRevision, layout } : null;
      const area = latLngBounds(bounds);
      const zoom = Math.min(9, map.getBoundsZoom(area, false, topLeft.add(bottomRight)));
      const middle = map.project(area.getSouthWest(), zoom).add(map.project(area.getNorthEast(), zoom)).divideBy(2);
      const target = map.unproject(middle.add(bottomRight.subtract(topLeft).divideBy(2)), zoom);
      map.stop();
      if (reducedMotion() || Math.abs(map.getZoom() - zoom) > 1) map.setView(target, zoom, { animate: false });
      else map.flyTo(target, zoom, { duration: 0.68 });
    }
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    });
    observer.observe(map.getContainer());
    if (overlay) observer.observe(overlay);
    frame = requestAnimationFrame(fit);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [map, bounds, panel, following, fitRevision, fitReady, localFocus]);
  const lat = tracked?.lat;
  const lon = tracked?.lon;
  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const { topLeft, bottomRight } = mapPadding(map, panel.current);
    const offset = bottomRight.subtract(topLeft).divideBy(2);
    const screen = map.latLngToContainerPoint([lat, lon]);
    const target = map.getSize().divideBy(2).subtract(offset);
    if (target.distanceTo(screen) <= 38) return;
    map.stop();
    map.panTo(map.unproject(map.project([lat, lon]).add(offset)), { animate: !reducedMotion(), duration: 0.55 });
  }, [map, panel, lat, lon]);
  return null;
}

function aircraftIcon(heading, active, captureColor) {
  const angle = Number.isFinite(heading) ? heading : 0;
  return divIcon({
    className: 'aircraft-marker' + (active ? ' is-active at-click' : '') + (captureColor ? ` capture-${captureColor}` : ''),
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<svg viewBox="0 0 24 24" style="transform:rotate(${angle}deg)" aria-hidden="true"><path d="${planePath}"/></svg>${captureColor ? '<span class="capture-check" aria-hidden="true">✓</span>' : ''}`
  });
}

const traceStyle = { color: '#087a70', weight: 4, opacity: 1 };
const guideStyle = { color: '#4d5d77', weight: 3, opacity: 0.9, dashArray: '3 9' };
const gapStyle = { color: '#087a70', weight: 2, fillColor: '#fff', fillOpacity: 1 };
const replayStyle = { color: '#b96009', weight: 4, opacity: 1 };
const liveTrailStyle = { color: '#0966b3', weight: 4, opacity: 0.95 };

function TraceLine({ positions, animate }) {
  const line = useRef(null);
  useEffect(() => {
    const path = line.current?.getElement();
    if (!path || !animate || reducedMotion()) return;
    path.setAttribute('pathLength', '1');
    const animation = path.animate(
      [{ strokeDasharray: '1 1', strokeDashoffset: '1' }, { strokeDasharray: '1 1', strokeDashoffset: '0' }],
      { duration: 780, easing: 'cubic-bezier(.2,.75,.3,1)' }
    );
    return () => animation.cancel();
  }, [positions, animate]);
  return <Polyline ref={line} positions={positions} interactive={false} className="observed-trace" pathOptions={traceStyle} />;
}

function CoveragePin({ position, label, at }) {
  if (!position) return null;
  return <CircleMarker center={position} radius={4} pathOptions={{ color: '#087a70', weight: 2, fillColor: '#fff', fillOpacity: 1 }}>
    <Tooltip direction="top" offset={[0, -4]}>{label}{Number.isFinite(at) ? ' · ' + timeLabel.format(at) : ''}</Tooltip>
  </CircleMarker>;
}

function AirportPin({ position, airport, title, arrival = false }) {
  if (!position) return null;
  return <CircleMarker center={position} radius={6} pathOptions={{ color: '#243e60', weight: 2, fillColor: '#fff', fillOpacity: 1 }}>
    <Tooltip permanent direction={arrival ? 'bottom' : 'top'} offset={[0, arrival ? 7 : -7]} className="airport-tooltip">
      <small>{title} {airport.code && <b>{airport.code}</b>}</small><strong>{airport.name || airport.code}</strong>
    </Tooltip>
  </CircleMarker>;
}

const Aircraft = memo(function Aircraft({ plane, active, muted, flightNumber, flightTime, onSelect, captureColor }) {
  const marker = useRef(null);
  const label = plane.callsign || plane.registration || plane.id.toUpperCase();
  const markerLabel = captureColor ? `${label} · ${captureLabels[captureColor]}` : label;
  const icon = useMemo(() => aircraftIcon(plane.heading, active, captureColor), [plane.heading, active, captureColor]);
  useEffect(() => {
    const element = marker.current?.getElement();
    element?.setAttribute('aria-label', markerLabel);
    element?.setAttribute('title', markerLabel);
  }, [icon, markerLabel]);
  return <Marker ref={marker} position={[plane.lat, plane.lon]} icon={icon}
    opacity={muted ? (captureColor ? 0.8 : 0.55) : 1} zIndexOffset={active ? 1000 : 0} eventHandlers={{ click: () => onSelect(plane) }}>
    <Tooltip permanent={active} direction="top" offset={[0, -17]} className={active ? 'click-tooltip' : ''}>
      {active ? <><strong>{flightNumber}</strong><span>{flightTime}</span></> : markerLabel}
    </Tooltip>
  </Marker>;
});

function LivePosition({ plane, stale }) {
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
    pathOptions={{ color: '#fff', weight: 2.5, fillColor: stale ? '#526a80' : '#0966b3', fillOpacity: 1, className: 'live-marker' }}>
    <Tooltip permanent direction="bottom" offset={[0, 7]} className="live-tooltip">{stale ? 'Dernière position' : 'Direct'} · {timeLabel.format(observedAt)}</Tooltip>
  </CircleMarker>;
}

export default function RadarMap({ planes, focus, route, geometry, coverage, flightNumber, flightTime, onSelect, recenter, panel, following, tracked, livePosition, trail, replay, fitRevision, fitReady, localTrace, captureColors }) {
  const original = focus?.plane;
  const moved = livePosition && (livePosition.lat !== original?.lat || livePosition.lon !== original?.lon);
  const replayTrack = replay && geometry?.tracks[replay.part];
  const replayAnchor = replayTrack?.[replay.index];
  const replayPosition = replayAnchor && [replay.position[0], nearLongitude(replay.position[1], replayAnchor[1])];
  const replayLine = replayTrack && [...geometry.tracks.slice(0, replay.part), [...replayTrack.slice(0, replay.index + 1), replayPosition]];
  return (
    <MapContainer center={center} zoom={8} minZoom={1} maxZoom={14} zoomControl={false}
      scrollWheelZoom worldCopyJump className="map">
      <MapActions recenter={recenter} bounds={geometry?.bounds} panel={panel} following={following}
        tracked={tracked} fitRevision={fitRevision} fitReady={fitReady} localFocus={localTrace ? focus : null} />
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" updateWhenIdle={false} updateInterval={100} keepBuffer={4}
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
        <Polyline positions={geometry.guides} interactive={false} className="observed-trace" pathOptions={guideStyle} />
        {geometry.tracks.map((segment, index) => <TraceLine key={index} positions={segment} animate={!localTrace} />)}
        {geometry.tracks.slice(1).map((segment, index) => <GapPins key={index}
          before={geometry.tracks[index].at(-1)} after={segment[0]} />)}
        {replayLine && <Polyline positions={replayLine} interactive={false} className="observed-trace" pathOptions={replayStyle} />}
        <AirportPin position={geometry.from} airport={route?.from}
          title={route?.observedDeparture ? 'Départ observé' : route?.probableDeparture ? 'Départ probable' : 'Départ annoncé'} />
        <AirportPin position={geometry.to} airport={route?.to} title={route?.historicalRoute ? 'Arrivée probable' : 'Arrivée annoncée'} arrival />
        <CoveragePin position={geometry.startOfCoverage} label="Début de la trace" at={coverage?.start} />
        <CoveragePin position={geometry.endOfCoverage} label="Fin de la trace" at={coverage?.end} />
      </>}
      {planes.filter(plane => plane.id !== focus?.plane.id).map(plane =>
        <Aircraft key={plane.id} plane={plane} onSelect={onSelect} muted={Boolean(focus)} captureColor={captureColors[captureFlightKey(plane)]} />
      )}
      {focus && <Aircraft key={focus.revision} plane={focus.plane} active captureColor={captureColors[captureFlightKey(focus.plane)]}
        flightNumber={flightNumber} flightTime={flightTime} onSelect={onSelect} />}
      {trail.length > 0 && <Polyline positions={trail} interactive={false} className="observed-trace" pathOptions={liveTrailStyle} />}
      {moved && <LivePosition plane={livePosition} stale={!tracked} />}
      {replayPosition && <CircleMarker center={replayPosition} radius={7} interactive={false}
        pathOptions={{ color: '#fff', weight: 2, fillColor: '#ad5700', fillOpacity: 1 }} />}
    </MapContainer>
  );
}

function GapPins({ before, after }) {
  return <>
    <CircleMarker center={before} radius={3} interactive={false} pathOptions={gapStyle} />
    <CircleMarker center={after} radius={3} interactive={false} pathOptions={gapStyle} />
  </>;
}
