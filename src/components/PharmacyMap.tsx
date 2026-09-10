// ============================================================
//  CarePoint — PharmacyMap component
//
//  Two modes controlled by the `mode` prop:
//
//  mode="staff"    — Draggable pin; staff can drag to set the
//                    exact store location. Fires onCoordsChange
//                    with (lat, lng) on every dragend.
//
//  mode="customer" — Read-only mini-map showing the pharmacy
//                    pin. No interaction. Mirrors the prototype's
//                    initCustomerPharmacyMaps() batch initialiser.
//
//  When the Google Maps SDK is not configured (missing API key)
//  both modes gracefully fall back to a styled placeholder card.
// ============================================================

import React, { useRef, useEffect, useId } from 'react';
import {
  useGoogleMaps,
  initPharmacyMap,
  initCustomerMap,
  setPharmLatLngFields,
} from '../hooks/useGoogleMaps';

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

// ── Staff map (draggable) ────────────────────────────────────

interface StaffMapProps {
  /** Initial latitude — defaults to Manila city centre. */
  lat?: number;
  /** Initial longitude — defaults to Manila city centre. */
  lng?: number;
  /** Called with updated coordinates whenever the marker is dragged. */
  onCoordsChange?: (lat: string, lng: string) => void;
  /** Height of the map canvas in px. Default: 280. */
  height?: number;
}

/**
 * PharmacyMapStaff — draggable pin for the Branch Portal
 * Profile tab. Lets staff set their store's exact lat/lng.
 */
export function PharmacyMapStaff({
  lat = 14.5995,
  lng = 120.9842,
  onCoordsChange,
  height = 280,
}: StaffMapProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const mapRef    = useRef<google.maps.Map | null>(null);
  const { ready, loading } = useGoogleMaps();

  useEffect(() => {
    if (!ready || !canvasRef.current || mapRef.current) return;

    mapRef.current = initPharmacyMap(
      canvasRef.current,
      lat,
      lng,
      (newLat, newLng) => {
        if (onCoordsChange) {
          // Use helper to format to 6dp, then pass as strings
          let lStr = '', gStr = '';
          setPharmLatLngFields(newLat, newLng, (v) => { lStr = v; }, (v) => { gStr = v; });
          onCoordsChange(lStr, gStr);
        }
      },
    );
  }, [ready, lat, lng, onCoordsChange]);

  if (loading) {
    return <MapFallback height={height} message="Loading map…" />;
  }

  if (!ready) {
    return (
      <MapFallback
        height={height}
        message="Map unavailable — add VITE_GOOGLE_MAPS_API_KEY to .env to enable location pin."
      />
    );
  }

  return (
    <div style={{ borderRadius: 'var(--cp-radius-lg, 14px)', overflow: 'hidden', border: '1px solid var(--cp-stone-dark, #ccc)' }}>
      <div ref={canvasRef} style={{ width: '100%', height }} />
      <p style={{ margin: '6px 8px 4px', fontSize: 11.5, color: 'var(--cp-walnut-faint, #999)' }}>
        🖱️ Drag the pin to set the exact store location.
      </p>
    </div>
  );
}

// ── Customer map (read-only) ─────────────────────────────────

interface CustomerMapProps {
  /** Pharmacy latitude — parsed from the pharmacy's stored location string or seed data. */
  lat: number;
  /** Pharmacy longitude. */
  lng: number;
  /** Pharmacy name shown as the marker tooltip. */
  name: string;
  /** Canvas ID — mirrors the prototype's `canvasId` parameter. */
  canvasId?: string;
  /** Height of the map canvas in px. Default: 180. */
  height?: number;
}

/**
 * PharmacyMapCustomer — read-only mini-map shown to customers
 * on product detail, checkout, and pharmacy browse pages.
 * Mirrors pharmacyMapHtml() + initCustomerPharmacyMaps().
 */
export function PharmacyMapCustomer({
  lat,
  lng,
  name,
  canvasId,
  height = 180,
}: CustomerMapProps) {
  // Generate a stable ID when no explicit canvasId is provided
  const autoId = useId();
  const resolvedId = canvasId ?? `phmap-${autoId}`;
  const canvasRef = useRef<HTMLDivElement>(null);
  const mapRef    = useRef<google.maps.Map | null>(null);
  const { ready, loading } = useGoogleMaps();

  // Validate coords — skip map if both are zero (not set by staff yet)
  const hasCoords = lat !== 0 || lng !== 0;

  useEffect(() => {
    if (!ready || !canvasRef.current || mapRef.current || !hasCoords) return;
    mapRef.current = initCustomerMap(canvasRef.current, lat, lng, name);
  }, [ready, lat, lng, name, hasCoords]);

  if (!hasCoords) {
    return <MapFallback height={height} message="Location not set by pharmacy yet." />;
  }

  if (loading) {
    return <MapFallback height={height} message="Loading map…" />;
  }

  if (!ready) {
    return <MapFallback height={height} message="Map preview unavailable." />;
  }

  return (
    <div
      // data-* attrs mirror the prototype's pharmacyMapHtml dataset pattern
      data-lat={lat}
      data-lng={lng}
      data-name={name}
      id={resolvedId}
      className="pharmacy-map-view"
      style={{
        borderRadius: 'var(--cp-radius-lg, 14px)',
        overflow: 'hidden',
        border: '1px solid var(--cp-stone-dark, #ccc)',
      }}
    >
      <div ref={canvasRef} style={{ width: '100%', height }} />
    </div>
  );
}

// ── Default export (staff variant for ergonomic imports) ─────
export default PharmacyMapStaff;
