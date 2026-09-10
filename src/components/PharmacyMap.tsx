// ============================================================
//  CarePoint — PharmacyMap component (Leaflet / OpenStreetMap)
//
//  No API key required. Uses:
//    • leaflet 1.9      — map renderer
//    • OpenStreetMap    — free tile provider
//
//  Two named exports:
//  ─────────────────
//  PharmacyMapStaff     — Draggable pin. Branch Portal Profile
//                         tab. Staff drags to set store lat/lng.
//
//  PharmacyMapCustomer  — Read-only mini-map. Shown to customers
//                         on product detail / checkout / browse.
//
//  Both gracefully degrade to a styled placeholder when coords
//  are not set (lat === 0 && lng === 0).
// ============================================================

import React, { useRef, useEffect, useId } from 'react';
import L from 'leaflet';

// Leaflet's CSS must be imported once somewhere in the app.
// Importing here guarantees it's always loaded with the component.
import 'leaflet/dist/leaflet.css';

import {
  initPharmacyMap,
  initCustomerMap,
  setPharmLatLngFields,
  destroyMap,
  OSM_TILE_URL,
  OSM_ATTRIBUTION,
} from '../hooks/useLeafletMap';

// Suppress unused-import warnings — OSM_TILE_URL / OSM_ATTRIBUTION
// are exported for consumers who need the raw strings.
void OSM_TILE_URL;
void OSM_ATTRIBUTION;

// ── Shared fallback ──────────────────────────────────────────

function MapFallback({ height, message }: { height: number | string; message: string }) {
  return (
    <div
      style={{
        height,
        borderRadius: 'var(--cp-radius-lg, 14px)',
        border: '1.5px dashed var(--cp-stone-dark, #ccc)',
        background: 'var(--cp-parchment, #faf7f2)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        color: 'var(--cp-walnut-faint, #999)',
        fontSize: 13,
        textAlign: 'center',
        padding: '0 16px',
      }}
    >
      <span style={{ fontSize: 28 }}>🗺️</span>
      <span>{message}</span>
    </div>
  );
}

// ── Staff map — draggable pin ────────────────────────────────

interface StaffMapProps {
  /** Initial latitude. Defaults to Manila city centre (14.5995). */
  lat?: number;
  /** Initial longitude. Defaults to Manila city centre (120.9842). */
  lng?: number;
  /** Called with formatted string coords whenever the marker is dragged. */
  onCoordsChange?: (lat: string, lng: string) => void;
  /** Canvas height in px. Default: 280. */
  height?: number;
}

/**
 * PharmacyMapStaff
 *
 * Interactive Leaflet map with a draggable marker.
 * Used in the Branch Portal → Profile tab so staff can pin
 * their store location on an OpenStreetMap base layer.
 *
 * Lifecycle: map instance is created on mount and destroyed on
 * unmount to prevent Leaflet's "map container already initialized"
 * error during React hot-module replacement.
 */
export function PharmacyMapStaff({
  lat = 14.5995,
  lng = 120.9842,
  onCoordsChange,
  height = 280,
}: StaffMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = initPharmacyMap(
      containerRef.current,
      lat,
      lng,
      (newLat, newLng) => {
        if (onCoordsChange) {
          let lStr = '', gStr = '';
          setPharmLatLngFields(newLat, newLng, (v) => { lStr = v; }, (v) => { gStr = v; });
          onCoordsChange(lStr, gStr);
        }
      },
    );

    // invalidateSize fixes tiles not loading inside flex/grid parents
    setTimeout(() => mapRef.current?.invalidateSize(), 0);

    return () => {
      destroyMap(mapRef.current);
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount — lat/lng changes handled via map.setView below

  // Sync external lat/lng prop changes to the live map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView([lat || 14.5995, lng || 120.9842]);
  }, [lat, lng]);

  return (
    <div
      style={{
        borderRadius: 'var(--cp-radius-lg, 14px)',
        overflow: 'hidden',
        border: '1px solid var(--cp-stone-dark, #ccc)',
      }}
    >
      {/* Leaflet requires explicit height on the container */}
      <div ref={containerRef} style={{ width: '100%', height }} />
      <p style={{ margin: '6px 8px 4px', fontSize: 11.5, color: 'var(--cp-walnut-faint, #999)' }}>
        🖱️ Drag the pin to set the exact store location. Powered by{' '}
        <a href="https://www.openstreetmap.org" target="_blank" rel="noopener noreferrer"
          style={{ color: 'var(--cp-terracotta, #b5634a)' }}>
          OpenStreetMap
        </a>.
      </p>
    </div>
  );
}

// ── Customer map — read-only mini-map ────────────────────────

interface CustomerMapProps {
  /** Pharmacy latitude. */
  lat: number;
  /** Pharmacy longitude. */
  lng: number;
  /** Pharmacy name — shown in the marker popup. */
  name: string;
  /**
   * Optional explicit element id.
   * Mirrors the prototype's pharmacyMapHtml canvasId parameter.
   */
  canvasId?: string;
  /** Canvas height in px. Default: 180. */
  height?: number;
}

/**
 * PharmacyMapCustomer
 *
 * Read-only Leaflet mini-map centred on the pharmacy location.
 * Shown to customers on product detail, checkout, and pharmacy
 * browse pages. All pointer interaction is disabled.
 *
 * Mirrors the prototype's pharmacyMapHtml() + initCustomerPharmacyMaps().
 */
export function PharmacyMapCustomer({
  lat,
  lng,
  name,
  canvasId,
  height = 180,
}: CustomerMapProps) {
  const autoId       = useId();
  const resolvedId   = canvasId ?? `phmap-${autoId}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<L.Map | null>(null);

  // Treat 0,0 as "not set" — show friendly placeholder instead
  const hasCoords = lat !== 0 || lng !== 0;

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !hasCoords) return;

    mapRef.current = initCustomerMap(containerRef.current, lat, lng, name);
    setTimeout(() => mapRef.current?.invalidateSize(), 0);

    return () => {
      destroyMap(mapRef.current);
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!hasCoords) {
    return <MapFallback height={height} message="Location not yet set by the pharmacy." />;
  }

  return (
    <div
      id={resolvedId}
      className="pharmacy-map-view"
      // data-* attrs mirror the prototype's dataset pattern used by
      // initCustomerPharmacyMaps() querySelectorAll batch initialiser
      data-lat={lat}
      data-lng={lng}
      data-name={name}
      style={{
        borderRadius: 'var(--cp-radius-lg, 14px)',
        overflow: 'hidden',
        border: '1px solid var(--cp-stone-dark, #ccc)',
      }}
    >
      <div ref={containerRef} style={{ width: '100%', height }} />
    </div>
  );
}

// ── Default export ───────────────────────────────────────────
export default PharmacyMapStaff;
