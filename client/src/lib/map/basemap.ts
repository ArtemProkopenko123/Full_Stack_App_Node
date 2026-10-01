// A tiny adapter that hides the difference between two map providers.
//
// The demo draws its data with deck.gl (WebGL) on top of the map. deck.gl can sit on top of
// both Google Maps and MapLibre, so everything above this file (PointsMap) talks only to the
// `BaseMap` interface and does not care which provider is underneath:
//
//   PointsMap  ->  BaseMap  ->  Google Maps + GoogleMapsOverlay(deck)
//                           ->  MapLibre GL + MapboxOverlay(deck)
//
// Provider libraries are imported with dynamic `import()`, so Vite splits them into separate
// chunks: the one you don't use is never downloaded.

import type { Layer } from "@deck.gl/core";
import type { IControl, Marker } from "maplibre-gl";
import { loadGoogleMaps } from "./loadGoogleMaps";

export type Provider = "google" | "maplibre";

/** What the data layer needs to know about the current camera. */
export interface View {
  west: number;
  south: number;
  east: number;
  north: number;
  /**
   * Zoom normalised to "512px tiles" — the convention Supercluster (and MapLibre) use.
   * Google's zoom is based on 256px tiles, so Google zoom N == this zoom N-1.
   */
  zoom: number;
}

export interface MarkerSpec {
  lng: number;
  lat: number;
  color: string; // CSS color
}

export interface BaseMap {
  getView(): View;
  /** Called after every pan/zoom has settled (NOT on every frame of the gesture). */
  onIdle(callback: () => void): void;
  /** Replace the deck.gl layers drawn over the map. */
  setLayers(layers: Layer[], getTooltip?: (info: { index: number; layer: Layer | null }) => string | null): void;
  zoomToward(lng: number, lat: number, zoomDelta: number): void;
  /** Replace ALL DOM markers (the deliberately slow approach, kept for comparison). */
  setMarkers(markers: MarkerSpec[]): void;
  dispose(): void;
}

// Europe-ish, where the synthetic data lives
const CENTER = { lng: 15, lat: 49 };

function markerElement(color: string) {
  const el = document.createElement("div");
  el.style.cssText = `width:10px;height:10px;border-radius:50%;background:${color};border:1px solid #fff;box-shadow:0 0 2px #0006`;
  return el;
}

// ------------------------------------------------------------------------------------
// MapLibre GL (free, no API key). Base tiles: Carto "positron" style.
// ------------------------------------------------------------------------------------
export async function createMapLibre(container: HTMLElement): Promise<BaseMap> {
  const [maplibregl, { MapboxOverlay }] = await Promise.all([
    import("maplibre-gl"),
    import("@deck.gl/mapbox"),
    import("maplibre-gl/dist/maplibre-gl.css"),
  ]);

  const map = new maplibregl.Map({
    container,
    style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    center: [CENTER.lng, CENTER.lat],
    zoom: 3.5,
  });
  // interleaved:false => deck.gl draws on its OWN canvas stacked over the map (simplest, robust)
  const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
  map.addControl(overlay as unknown as IControl);

  let markers: Marker[] = [];

  return {
    getView() {
      const b = map.getBounds();
      return { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth(), zoom: map.getZoom() };
    },
    // "moveend" fires once when a pan/zoom animation finishes — the equivalent of Google's "idle"
    onIdle: (cb) => { map.on("moveend", cb); },
    setLayers(layers, getTooltip) {
      overlay.setProps({ layers, getTooltip });
    },
    zoomToward(lng, lat, dz) {
      map.easeTo({ center: [lng, lat], zoom: map.getZoom() + dz });
    },
    setMarkers(specs) {
      markers.forEach((m) => m.remove());
      markers = specs.map((s) => new maplibregl.Marker({ element: markerElement(s.color) }).setLngLat([s.lng, s.lat]).addTo(map));
    },
    dispose() {
      markers.forEach((m) => m.remove());
      map.remove();
    },
  };
}

// ------------------------------------------------------------------------------------
// Google Maps (needs VITE_GOOGLE_MAPS_API_KEY).
// ------------------------------------------------------------------------------------
export async function createGoogleMap(container: HTMLElement, apiKey: string): Promise<BaseMap> {
  await loadGoogleMaps(apiKey);
  const [{ Map }, { AdvancedMarkerElement }, { GoogleMapsOverlay }] = await Promise.all([
    google.maps.importLibrary("maps") as Promise<google.maps.MapsLibrary>,
    google.maps.importLibrary("marker") as Promise<google.maps.MarkerLibrary>,
    import("@deck.gl/google-maps"),
  ]);

  const map = new Map(container, {
    center: { lat: CENTER.lat, lng: CENTER.lng },
    zoom: 4,
    mapId: "DEMO_MAP_ID", // AdvancedMarkerElement requires a map ID; Google provides this demo one
    gestureHandling: "greedy", // one-finger / wheel always moves the map (no "use ctrl to zoom")
    streetViewControl: false,
    mapTypeControl: false,
  });
  // GoogleMapsOverlay keeps a deck.gl canvas in sync with the Google map's camera
  const overlay = new GoogleMapsOverlay({ layers: [] });
  overlay.setMap(map);

  let markers: google.maps.marker.AdvancedMarkerElement[] = [];

  return {
    getView() {
      const b = map.getBounds()?.toJSON(); // undefined until the map has rendered once
      const zoom = Math.max((map.getZoom() ?? 4) - 1, 0); // 256px-tile zoom -> 512px-tile zoom
      return b ? { west: b.west, south: b.south, east: b.east, north: b.north, zoom } : { west: -180, south: -85, east: 180, north: 85, zoom };
    },
    onIdle: (cb) => { map.addListener("idle", cb); },
    setLayers(layers, getTooltip) {
      overlay.setProps({ layers, getTooltip });
    },
    zoomToward(lng, lat, dz) {
      map.panTo({ lat, lng });
      map.setZoom((map.getZoom() ?? 4) + dz);
    },
    setMarkers(specs) {
      markers.forEach((m) => { m.map = null; });
      markers = specs.map((s) => new AdvancedMarkerElement({ map, position: { lat: s.lat, lng: s.lng }, content: markerElement(s.color) }));
    },
    dispose() {
      markers.forEach((m) => { m.map = null; });
      overlay.finalize(); // releases the deck.gl canvas and WebGL context
      google.maps.event.clearInstanceListeners(map);
      container.replaceChildren(); // Google has no map.remove(); dropping its DOM is the supported teardown
    },
  };
}
