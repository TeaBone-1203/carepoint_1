// ============================================================
//  CarePoint — Google Maps loader hook
//
//  Mirrors the prototype's loadGoogleMaps() + onGoogleMapsLoaded()
//  pattern, adapted for React with a shared singleton promise so
//  the SDK is only injected once no matter how many components
//  call this hook simultaneously.
// ============================================================

import { useState, useEffect, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────
// @types/google.maps provides the global `google` namespace.
// We only need to extend Window for our custom callback.
declare global {
  interface Window {
    onGoogleMapsLoaded: () => void;
    _cpMapsPromise: Promise<boolean> | null;
  }
}

// ── Singleton promise (survives re-renders) ──────────────────
let _mapsPromise: Promise<boolean> | null = null;

/**
 * Dynamically loads the Google Maps JS SDK.
 * Uses VITE_GOOGLE_MAPS_API_KEY from .env.
 * Returns a promise that resolves to true when ready,
 * false when the key is missing or loading fails.
 */
function loadGoogleMaps(): Promise<boolean> {
  // Already loaded
  if (typeof window !== 'undefined' && window.google?.maps) {
    return Promise.resolve(true);
  }

  // Reuse in-flight load
  if (_mapsPromise) return _mapsPromise;

  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim();

  if (!apiKey || apiKey === 'your_google_maps_api_key_here') {
    console.warn('[CarePoint] VITE_GOOGLE_MAPS_API_KEY is not set — maps disabled.');
    return Promise.resolve(false);
  }

  _mapsPromise = new Promise<boolean>((resolve) => {
    // Callback invoked by the SDK once it finishes loading
    window.onGoogleMapsLoaded = () => {
      resolve(true);
    };

    const existing = document.getElementById('googleMapsScript');
    if (existing) {
      // Script tag already in DOM (e.g. HMR / fast-refresh) — wait for it
      if (window.google?.maps) { resolve(true); return; }
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }

    const script = document.createElement('script');
    script.id  = 'googleMapsScript';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=onGoogleMapsLoaded`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      console.error('[CarePoint] Failed to load Google Maps SDK.');
      resolve(false);
    };
    document.head.appendChild(script);
  });

  return _mapsPromise;
}

// ── Hook ─────────────────────────────────────────────────────
/**
 * React hook that loads the Google Maps SDK and returns
 * `{ ready, loading }` — safe to call from multiple components.
 *
 * @example
 *   const { ready } = useGoogleMaps();
 *   if (!ready) return <div>Loading map…</div>;
 */
export function useGoogleMaps(): { ready: boolean; loading: boolean } {
  const [ready,   setReady]   = useState<boolean>(!!window.google?.maps);
  const [loading, setLoading] = useState<boolean>(!window.google?.maps);

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    setLoading(true);
    void loadGoogleMaps().then((ok) => {
      if (!cancelled) { setReady(ok); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [ready]);

  return { ready, loading };
}

// ── Map initializers (mirror prototype functions) ─────────────

/**
 * initPharmacyMap — mirrors initPharmacyMapIfVisible().
 * Creates a draggable marker on the staff profile map canvas.
 * Calls `onCoordsChange(lat, lng)` whenever the marker is dragged.
 *
 * @param canvasEl  The DOM element to render the map into.
 * @param initLat   Starting latitude  (falls back to Manila centre).
 * @param initLng   Starting longitude (falls back to Manila centre).
 * @param onCoordsChange  Called with updated lat/lng on dragend.
 */
export function initPharmacyMap(
  canvasEl: HTMLElement,
  initLat: number,
  initLng: number,
  onCoordsChange: (lat: number, lng: number) => void,
): google.maps.Map {
  const center = { lat: initLat || 14.5995, lng: initLng || 120.9842 };
  const map = new google.maps.Map(canvasEl, {
    center,
    zoom: 16,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
  });

  const marker = new google.maps.Marker({
    position: center,
    map,
    draggable: true,
    title: 'Drag to set pharmacy location',
  });

  marker.addListener('dragend', () => {
    const pos = marker.getPosition();
    if (pos) {
      const lat = parseFloat(pos.lat().toFixed(6));
      const lng = parseFloat(pos.lng().toFixed(6));
      onCoordsChange(lat, lng);
    }
  });

  return map;
}

/**
 * initCustomerMap — mirrors initCustomerPharmacyMaps() for a single canvas.
 * Renders a static (non-draggable) map pin for a pharmacy location.
 *
 * @param canvasEl  The container element.
 * @param lat       Pharmacy latitude.
 * @param lng       Pharmacy longitude.
 * @param title     Pharmacy name shown as the marker tooltip.
 */
export function initCustomerMap(
  canvasEl: HTMLElement,
  lat: number,
  lng: number,
  title: string,
): google.maps.Map {
  const center = { lat, lng };
  const map = new google.maps.Map(canvasEl, {
    center,
    zoom: 15,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    draggable: false,
    zoomControl: false,
    scrollwheel: false,
    disableDoubleClickZoom: true,
  });

  new google.maps.Marker({ position: center, map, title });
  return map;
}

/**
 * setPharmLatLngFields — mirrors setPharmLatLngFields().
 * Formats and writes lat/lng values to a pair of controlled
 * state setters (or input elements) to 6 decimal precision.
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

export { loadGoogleMaps };
