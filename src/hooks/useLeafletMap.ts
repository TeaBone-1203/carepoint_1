// ============================================================
//  CarePoint — Leaflet / OpenStreetMap map utilities
//
//  100 % free, no API key required.
//  Tile provider: OpenStreetMap (https://www.openstreetmap.org)
//  Map library:   Leaflet 1.9 (https://leafletjs.com)
//
//  Exports
//  ───────
//  useLeafletMap()        React hook — returns { ready: true } immediately
//                         (Leaflet is bundled, not loaded async)
//  initPharmacyMap()      Draggable marker — staff sets store pin
//  initCustomerMap()      Read-only pin — customer mini-map
//  setPharmLatLngFields() Helper — formats coords to 6dp string setters
// ============================================================

import L from 'leaflet';

// ── Fix Leaflet's broken default icon paths under Vite/bundlers ──
// Leaflet 1.x resolves marker images relative to the CSS file, which
// breaks in bundled environments. We point them at the CDN instead.
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon   from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl:       markerIcon,
  shadowUrl:     markerShadow,
});

// ── OSM tile layer constants ─────────────────────────────────
export const OSM_TILE_URL        = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OSM_ATTRIBUTION     = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export const OSM_MAX_ZOOM        = 19;

// ── Default centre — Manila, Philippines ────────────────────
export const DEFAULT_LAT  = 14.5995;
export const DEFAULT_LNG  = 120.9842;
export const DEFAULT_ZOOM = 15;

// ── Hook ─────────────────────────────────────────────────────
/**
 * Lightweight hook that mirrors the old useGoogleMaps() API.
 * Leaflet is bundled (no async load), so `ready` is always true.
 * The `loading` flag is kept for API compatibility.
 */
export function useLeafletMap(): { ready: boolean; loading: boolean } {
  return { ready: true, loading: false };
}

// ── Staff map — draggable pin ────────────────────────────────
/**
 * Initialises a Leaflet map with a draggable marker.
 * Staff drag the pin to set the pharmacy's exact coordinates.
 *
 * @param container       DOM element to mount the map into.
 * @param initLat         Starting latitude.
 * @param initLng         Starting longitude.
 * @param onCoordsChange  Called with (lat, lng) on every dragend.
 * @returns               The Leaflet map instance.
 */
export function initPharmacyMap(
  container: HTMLElement,
  initLat: number,
  initLng: number,
  onCoordsChange: (lat: number, lng: number) => void,
): L.Map {
  const lat = initLat || DEFAULT_LAT;
  const lng = initLng || DEFAULT_LNG;

  const map = L.map(container, { zoomControl: true }).setView([lat, lng], DEFAULT_ZOOM);

  L.tileLayer(OSM_TILE_URL, {
    attribution: OSM_ATTRIBUTION,
    maxZoom: OSM_MAX_ZOOM,
  }).addTo(map);

  const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
  marker.bindPopup('<b>Drag me</b><br>Set your store location').openPopup();

  marker.on('dragend', () => {
    const pos = marker.getLatLng();
    const newLat = parseFloat(pos.lat.toFixed(6));
    const newLng = parseFloat(pos.lng.toFixed(6));
    marker.setPopupContent(`<b>${newLat}, ${newLng}</b>`).openPopup();
    onCoordsChange(newLat, newLng);
  });

  return map;
}

// ── Customer map — read-only pin ─────────────────────────────
/**
 * Initialises a static Leaflet map centred on the pharmacy.
 * Interaction is intentionally disabled for the mini-map view.
 *
 * @param container DOM element to mount the map into.
 * @param lat       Pharmacy latitude.
 * @param lng       Pharmacy longitude.
 * @param name      Pharmacy name — shown in the marker popup.
 * @returns         The Leaflet map instance.
 */
export function initCustomerMap(
  container: HTMLElement,
  lat: number,
  lng: number,
  name: string,
): L.Map {
  const map = L.map(container, {
    zoomControl:          false,
    dragging:             false,
    touchZoom:            false,
    scrollWheelZoom:      false,
    doubleClickZoom:      false,
    boxZoom:              false,
    keyboard:             false,
  }).setView([lat, lng], DEFAULT_ZOOM);

  L.tileLayer(OSM_TILE_URL, {
    attribution: OSM_ATTRIBUTION,
    maxZoom: OSM_MAX_ZOOM,
  }).addTo(map);

  L.marker([lat, lng])
    .addTo(map)
    .bindPopup(`<b>${name}</b>`)
    .openPopup();

  return map;
}

// ── Coordinate helper ────────────────────────────────────────
/**
 * Formats lat/lng to 6 decimal places and pushes them into a
 * pair of React state setters. Mirrors the prototype's
 * setPharmLatLngFields(lat, lng) helper.
 */
export function setPharmLatLngFields(
  lat: number,
  lng: number,
  setLat: (v: string) => void,
  setLng: (v: string) => void,
): void {
  setLat(lat.toFixed(6));
  setLng(lng.toFixed(6));
}

// ── Cleanup helper ───────────────────────────────────────────
/**
 * Safely removes a Leaflet map instance and frees resources.
 * Call this in a useEffect cleanup to prevent memory leaks.
 */
export function destroyMap(map: L.Map | null): void {
  if (map) {
    try { map.remove(); } catch { /* already removed */ }
  }
}

// Re-export useLeafletMap under the old name so any future
// references to useGoogleMaps still compile after a find-replace.
export { useLeafletMap as useGoogleMaps };
