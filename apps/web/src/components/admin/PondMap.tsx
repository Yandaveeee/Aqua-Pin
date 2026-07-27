"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { MOCK_PONDS, MockPond } from "@/lib/mock-data";

interface PondMapProps {
  ponds?: MockPond[];
}

const GONZAGA_CENTER = { lat: 18.2594, lng: 122.0054 };
const GONZAGA_FOCUS_RADIUS_KM = 55;

function distanceInKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
) {
  const earthRadiusKm = 6371;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(to.lat - from.lat);
  const longitudeDelta = toRadians(to.lng - from.lng);
  const fromLatitude = toRadians(from.lat);
  const toLatitude = toRadians(to.lat);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function getPondTone(pond: MockPond) {
  if (!pond.isActive) return "inactive";
  if (pond.currentStockCount < 1000) return "danger";
  if (pond.currentStockCount < 2000) return "warning";
  return "success";
}

function getCreatorLabel(email: string) {
  return email.split("@")[0].replace("staff-", "");
}

function getPondCreatorLabel(pond: MockPond) {
  const label = pond.createdByName?.trim();
  if (label && label !== pond.createdBy) return label;
  return getCreatorLabel(pond.createdBy);
}

export default function PondMap({ ponds: initialPonds }: PondMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const polygonsRef = useRef<any[]>([]);
  const gonzagaFocusAppliedRef = useRef(false);
  const [ponds] = useState<MockPond[]>(initialPonds || MOCK_PONDS);
  const [selectedPond, setSelectedPond] = useState<MockPond | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapType, setMapType] = useState<"streets" | "satellite" | "terrain">("streets");
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [creatorFilter, setCreatorFilter] = useState("all");
  const [listCollapsed, setListCollapsed] = useState(false);

  const filteredPonds = ponds.filter((pond) => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    const matchesSearch =
      normalizedSearch.length === 0 ||
      pond.name.toLowerCase().includes(normalizedSearch) ||
      pond.currentSpecies?.toLowerCase().includes(normalizedSearch) ||
      pond.createdBy.toLowerCase().includes(normalizedSearch) ||
      getPondCreatorLabel(pond).toLowerCase().includes(normalizedSearch);
    const matchesCreator = creatorFilter === "all" || pond.createdBy === creatorFilter;
    return matchesSearch && matchesCreator;
  });

  const creators = Array.from(
    new Map(ponds.map((pond) => [pond.createdBy, getPondCreatorLabel(pond)])).entries()
  );
  const mapStats = useMemo(() => {
    const activeCount = ponds.filter((pond) => pond.isActive).length;
    const boundaryCount = ponds.filter((pond) => pond.boundary && pond.boundary.length >= 3).length;
    const lowStockCount = ponds.filter((pond) => pond.isActive && pond.currentStockCount < 1000).length;
    const totalStock = ponds.reduce((sum, pond) => sum + pond.currentStockCount, 0);

    return { activeCount, boundaryCount, lowStockCount, totalStock };
  }, [ponds]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let linkTag = document.getElementById("leaflet-css") as HTMLLinkElement;
    if (!linkTag) {
      linkTag = document.createElement("link");
      linkTag.id = "leaflet-css";
      linkTag.rel = "stylesheet";
      linkTag.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(linkTag);
    }

    const scriptId = "leaflet-js";
    let scriptTag = document.getElementById(scriptId) as HTMLScriptElement;

    const initializeMap = () => {
      const L = (window as any).L;
      if (!L || !mapContainerRef.current || mapInstanceRef.current) return;

      const defaultCenter = [14.63, 121.02];
      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: 10,
        zoomControl: false,
      });

      L.control.zoom({ position: "topright" }).addTo(map);
      mapInstanceRef.current = map;
      setMapLoaded(true);

      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => {
            const currentLocation = {
              lat: coords.latitude,
              lng: coords.longitude,
            };

            if (
              distanceInKm(currentLocation, GONZAGA_CENTER) <=
              GONZAGA_FOCUS_RADIUS_KM
            ) {
              gonzagaFocusAppliedRef.current = true;
              map.setView([currentLocation.lat, currentLocation.lng], 14, {
                animate: true,
              });
            }
          },
          () => {
            // Keep the existing pond-based view when location access is unavailable.
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 300000,
          }
        );
      }
    };

    if (!scriptTag) {
      scriptTag = document.createElement("script");
      scriptTag.id = scriptId;
      scriptTag.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      scriptTag.onload = initializeMap;
      document.body.appendChild(scriptTag);
    } else if ((window as any).L) {
      initializeMap();
    } else {
      scriptTag.onload = initializeMap;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const L = (window as any).L;
    const map = mapInstanceRef.current;
    if (!L || !map || !mapLoaded) return;

    map.eachLayer((layer: any) => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer);
      }
    });

    let tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
    let attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

    if (mapType === "satellite") {
      tileUrl = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
      attribution = "Tiles &copy; Esri";
    } else if (mapType === "terrain") {
      tileUrl = "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png";
      attribution = "Map data: &copy; OpenStreetMap | Map style: &copy; OpenTopoMap";
    }

    L.tileLayer(tileUrl, { attribution }).addTo(map);
  }, [mapType, mapLoaded]);

  useEffect(() => {
    const L = (window as any).L;
    const map = mapInstanceRef.current;
    if (!L || !map || !mapLoaded) return;

    markersRef.current.forEach((marker) => map.removeLayer(marker));
    polygonsRef.current.forEach((polygon) => map.removeLayer(polygon));
    markersRef.current = [];
    polygonsRef.current = [];

    if (showBoundaries) {
      filteredPonds.forEach((pond) => {
        if (pond.boundary && pond.boundary.length >= 3) {
          const latLngs = pond.boundary.map((c) => [c.lat, c.lng]);
          const polygon = L.polygon(latLngs, {
            color:
              pond.currentSpecies === "Bangus"
                ? "#2563eb"
                : pond.currentSpecies?.includes("Shrimp")
                  ? "#e11d48"
                  : "#16a34a",
            fillColor:
              pond.currentSpecies === "Bangus"
                ? "#3b82f6"
                : pond.currentSpecies?.includes("Shrimp")
                  ? "#f43f5e"
                  : "#22c55e",
            fillOpacity: 0.24,
            weight: 2,
          });

          polygon.bindTooltip(pond.name, { permanent: false, direction: "center" });
          polygon.addTo(map);
          polygonsRef.current.push(polygon);
        }
      });
    }

    filteredPonds.forEach((pond) => {
      if (showHeatmap) {
        const radius = Math.min(2000, Math.max(200, pond.currentStockCount * 0.05));
        const circle = L.circle([pond.coordinates.lat, pond.coordinates.lng], {
          radius,
          color: "#d9821f",
          fillColor: "#f59e0b",
          fillOpacity: 0.38,
          weight: 1,
        });

        circle.bindPopup(`<strong>${pond.name}</strong><br/>Stock Density: ${pond.currentStockCount.toLocaleString()} fish`);
        circle.addTo(map);
        markersRef.current.push(circle);
      } else {
        const tone = getPondTone(pond);
        const statusColor = tone === "danger" ? "#b42318" : tone === "warning" ? "#d9821f" : "#0f766e";
        const iconHtml = `
          <div class="pond-map-marker" style="--marker-color: ${statusColor};">
            <span></span>
          </div>
        `;

        const customIcon = L.divIcon({
          html: iconHtml,
          className: "custom-map-marker",
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });

        const marker = L.marker([pond.coordinates.lat, pond.coordinates.lng], { icon: customIcon });
        const popupContent = `
          <div class="pond-map-popup">
            <h4>${pond.name}</h4>
            <p>Species: <strong>${pond.currentSpecies || "None"}</strong></p>
            <p>Stock: <strong>${pond.currentStockCount.toLocaleString()}</strong></p>
            <button id="btn-popup-${pond.id}">View details</button>
          </div>
        `;

        marker.bindPopup(popupContent);
        marker.on("popupopen", () => {
          const btn = document.getElementById(`btn-popup-${pond.id}`);
          if (btn) {
            btn.onclick = () => setSelectedPond(pond);
          }
        });

        marker.addTo(map);
        markersRef.current.push(marker);
      }
    });

    if (filteredPonds.length > 0 && !gonzagaFocusAppliedRef.current) {
      const bounds = L.latLngBounds(
        filteredPonds.map((pond) => [pond.coordinates.lat, pond.coordinates.lng])
      );

      if (bounds.isValid()) {
        const isSingleLocation = bounds.getNorthEast().equals(bounds.getSouthWest());
        if (isSingleLocation) {
          map.setView(bounds.getCenter(), 13, { animate: false });
        } else {
          map.fitBounds(bounds, { padding: [48, 48], maxZoom: 13, animate: false });
        }
      }
    }
  }, [filteredPonds, showBoundaries, showHeatmap, mapLoaded, ponds]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const resizeTimer = window.setTimeout(() => map.invalidateSize({ animate: false }), 220);
    return () => window.clearTimeout(resizeTimer);
  }, [listCollapsed]);

  const handlePondClick = (pond: MockPond) => {
    setSelectedPond(pond);
    const L = (window as any).L;
    const map = mapInstanceRef.current;
    if (L && map) {
      map.setView([pond.coordinates.lat, pond.coordinates.lng], 14, { animate: true });

      markersRef.current.forEach((marker) => {
        const pos = marker.getLatLng();
        if (
          Math.abs(pos.lat - pond.coordinates.lat) < 0.0001 &&
          Math.abs(pos.lng - pond.coordinates.lng) < 0.0001
        ) {
          marker.openPopup();
        }
      });
    }
  };

  return (
    <section
      className={`pond-map-shell${listCollapsed ? " is-list-collapsed" : ""}`}
      aria-label="Pond GIS visualizer"
    >
      <aside className="pond-map-sidebar">
        <div className="pond-map-sidebar-head">
          <div>
            <h2>Pond list</h2>
          </div>
          <div className="pond-map-sidebar-actions">
            <span className="ui-pill ui-pill-ghost">{filteredPonds.length} shown</span>
            <button
              aria-expanded={!listCollapsed}
              className="pond-map-list-toggle"
              onClick={() => setListCollapsed((current) => !current)}
              type="button"
            >
              <span>{listCollapsed ? "Show" : "Hide"}</span>
              <svg aria-hidden="true" viewBox="0 0 20 20">
                <path d={listCollapsed ? "m5 7.5 5 5 5-5" : "m5 12.5 5-5 5 5"} />
              </svg>
            </button>
          </div>
        </div>

        <div className="pond-map-stat-grid" aria-label="Map summary">
          <article>
            <span>Active</span>
            <strong>
              {mapStats.activeCount}/{ponds.length}
            </strong>
          </article>
          <article>
            <span>Boundaries</span>
            <strong>{mapStats.boundaryCount}</strong>
          </article>
          <article>
            <span>Low stock</span>
            <strong>{mapStats.lowStockCount}</strong>
          </article>
          <article>
            <span>Total stock</span>
            <strong>{mapStats.totalStock.toLocaleString()}</strong>
          </article>
        </div>

        <div className="pond-map-filter-panel">
          <label className="sr-only" htmlFor="pond-search">
            Search ponds
          </label>
          <input
            className="field-input"
            id="pond-search"
            type="search"
            placeholder="Name, species, or staff"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <label className="sr-only" htmlFor="creator-filter">
            Field staff
          </label>
          <select
            className="field-input"
            id="creator-filter"
            value={creatorFilter}
            onChange={(e) => setCreatorFilter(e.target.value)}
          >
            <option value="all">All field staff</option>
            {creators.map(([creatorId, creatorLabel]) => (
              <option key={creatorId} value={creatorId}>
                {creatorLabel}
              </option>
            ))}
          </select>
        </div>

        <div className="pond-map-list" aria-label="Filtered ponds">
          {filteredPonds.length === 0 ? (
            <div className="empty-panel">
              <p>No ponds found matching filters.</p>
              <p className="muted">Try clearing the search or choosing all field staff.</p>
            </div>
          ) : (
            filteredPonds.map((pond) => {
              const tone = getPondTone(pond);
              const isSelected = selectedPond?.id === pond.id;

              return (
                <button
                  className={`pond-map-list-card is-${tone}${isSelected ? " is-selected" : ""}`}
                  key={pond.id}
                  onClick={() => handlePondClick(pond)}
                  type="button"
                >
                  <span className="pond-map-list-card-head">
                    <strong>{pond.name}</strong>
                    <span className={`ui-pill ${pond.isActive ? "ui-pill-success" : "ui-pill-danger"}`}>
                      {pond.isActive ? "Active" : "Inactive"}
                    </span>
                  </span>
                  <span className="pond-map-list-detail">
                    {pond.currentSpecies || "No species"} / {pond.currentStockCount.toLocaleString()} fish
                  </span>
                  <span className="pond-map-list-staff">{getPondCreatorLabel(pond)}</span>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <div className="pond-map-stage">
        <div className="pond-map-canvas" ref={mapContainerRef}>
          {!mapLoaded ? (
            <div className="pond-map-loading">
              <span className="ui-skeleton ui-skeleton-pill" />
              <p>Loading map tiles...</p>
            </div>
          ) : null}
        </div>

        <div className="pond-map-toolbar" aria-label="Map type">
          {(["streets", "satellite", "terrain"] as const).map((type) => (
            <button
              className={mapType === type ? "is-active" : ""}
              key={type}
              onClick={() => setMapType(type)}
              type="button"
            >
              {type === "streets" ? "Street" : type === "satellite" ? "Satellite" : "Terrain"}
            </button>
          ))}
        </div>

        <div className="pond-map-layer-panel" aria-label="Map layers">
          <label className="toggle-field pond-map-toggle">
            <input
              type="checkbox"
              checked={showBoundaries}
              onChange={(e) => setShowBoundaries(e.target.checked)}
            />
            <span>
              <strong>Boundaries</strong>
            </span>
          </label>
          <label className="toggle-field pond-map-toggle">
            <input type="checkbox" checked={showHeatmap} onChange={(e) => setShowHeatmap(e.target.checked)} />
            <span>
              <strong>Density</strong>
            </span>
          </label>
        </div>

        {selectedPond ? (
          <aside className="pond-map-detail-drawer" aria-label={`${selectedPond.name} details`}>
            <div className="pond-map-detail-head">
              <div>
                <p className="eyebrow">Selected Pond</p>
                <h3>{selectedPond.name}</h3>
                <span>{selectedPond.location}</span>
              </div>
              <button className="secondary-button" onClick={() => setSelectedPond(null)} type="button">
                Close
              </button>
            </div>

            <div className="pond-map-detail-grid">
              <article>
                <span>Species</span>
                <strong>{selectedPond.currentSpecies || "None"}</strong>
              </article>
              <article>
                <span>Stock Count</span>
                <strong>{selectedPond.currentStockCount.toLocaleString()} fish</strong>
              </article>
              <article>
                <span>Pond Area</span>
                <strong>{selectedPond.areaSqm.toLocaleString()} m²</strong>
              </article>
              <article>
                <span>Created By</span>
                <strong>{getPondCreatorLabel(selectedPond)}</strong>
              </article>
            </div>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
