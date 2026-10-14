import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import WebView from 'react-native-webview';

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface MappedPond {
  id: string;
  name: string;
  location: string;
  center: Coordinate;
  boundary: Coordinate[];
  isActive: boolean;
}

export type MapTileSource = 'osm' | 'esri' | 'opentopo';

export interface LeafletMapViewRef {
  flyTo: (lat: number, lng: number, zoom?: number) => void;
  fitBounds: (coords: Coordinate[]) => void;
}

interface LeafletMapViewProps {
  initialRegion?: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  mappedPonds: MappedPond[];
  selectedLocation?: Coordinate | null;
  polygonPoints?: Coordinate[];
  mapMode?: 'view' | 'point' | 'polygon';
  tileSource?: MapTileSource;
  onPondPress?: (id: string) => void;
  onVertexPress?: (index: number) => void;
  onVertexMove?: (index: number, point: Coordinate) => void;
  onMarkerMove?: (point: Coordinate) => void;
  onMapPress?: (coordinate: Coordinate) => void;
  style?: any;
}

const LEAFLET_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; background: #eef2f6; }
    .leaflet-control-attribution { font-size: 9px; opacity: 0.6; }
    .pond-popup { font-family: system-ui, -apple-system, sans-serif; font-size: 13px; font-weight: 600; color: #1e293b; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: false, attributionControl: true }).setView([14.5995, 120.9842], 14);
    
    var tileLayers = {
      osm: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }),
      esri: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '© Esri Satellite' }),
      opentopo: L.tileLayer('https://tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© OpenTopoMap' })
    };

    var currentLayer = tileLayers.osm.addTo(map);
    var pondsGroup = L.layerGroup().addTo(map);
    var editingGroup = L.layerGroup().addTo(map);

    map.on('click', function(e) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'mapPress',
          latitude: e.latlng.lat,
          longitude: e.latlng.lng
        }));
      }
    });

    function post(data) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(data)); }
    window.updateMapData = function(data) {
      if (!data) return;

      var src = data.tileSource || 'osm';
      if (tileLayers[src] && currentLayer !== tileLayers[src]) {
        map.removeLayer(currentLayer);
        currentLayer = tileLayers[src].addTo(map);
      }

      pondsGroup.clearLayers();
      editingGroup.clearLayers();

      if (Array.isArray(data.mappedPonds)) {
        data.mappedPonds.forEach(function(pond) {
          if (!pond || !pond.center) return;
          var color = pond.isActive ? '#007bff' : '#16a34a';
          var fillColor = pond.isActive ? 'rgba(0, 123, 255, 0.35)' : 'rgba(22, 163, 74, 0.3)';

          if (Array.isArray(pond.boundary) && pond.boundary.length >= 3) {
            var polyCoords = pond.boundary.map(function(c) { return [c.latitude, c.longitude]; });
            L.polygon(polyCoords, { color: color, fillColor: fillColor, weight: 2, fillOpacity: 0.4, bubblingMouseEvents: false }).addTo(pondsGroup).on('click', function() { post({type:'pondPress', id:pond.id}); });
          }

          var marker = L.circleMarker([pond.center.latitude, pond.center.longitude], {
            bubblingMouseEvents: false,
            radius: 8,
            color: '#ffffff',
            weight: 2,
            fillColor: color,
            fillOpacity: 1
          }).addTo(pondsGroup);

          marker.on('click', function() { post({type:'pondPress', id:pond.id}); });
        });
      }

      if (data.selectedLocation && data.mapMode === 'point') {
        L.marker([data.selectedLocation.latitude, data.selectedLocation.longitude], {draggable:true}).addTo(editingGroup).on('dragend', function(e) { var p=e.target.getLatLng(); post({type:'markerMove',latitude:p.lat,longitude:p.lng}); });
      }

      if (Array.isArray(data.polygonPoints) && data.polygonPoints.length > 0) {
        var pts = data.polygonPoints.map(function(c) { return [c.latitude, c.longitude]; });

        pts.forEach(function(pt, index) {
          L.marker(pt, {draggable:true, bubblingMouseEvents:false}).addTo(editingGroup)
            .on('click', function() { post({type:'vertexPress',index:index}); })
            .on('dragend', function(e) { var p=e.target.getLatLng(); post({type:'vertexMove',index:index,latitude:p.lat,longitude:p.lng}); });
        });

        if (pts.length > 1) {
          L.polyline(pts, { color: '#16a34a', weight: 4 }).addTo(editingGroup);
        }
        if (pts.length >= 2) {
          L.polygon(pts, { color: '#16a34a', fillColor: 'rgba(34, 197, 94, 0.35)', weight: 3 }).addTo(editingGroup);
        }
      }
    };

    window.flyToLocation = function(lat, lng, zoom) {
      map.flyTo([lat, lng], zoom || 16, { animate: true, duration: 0.8 });
    };

    window.fitBoundsCoords = function(coords) {
      if (!Array.isArray(coords) || coords.length === 0) return;
      var bounds = L.latLngBounds(coords.map(function(c) { return [c.latitude, c.longitude]; }));
      map.fitBounds(bounds, { padding: [40, 40] });
    };
  </script>
</body>
</html>
`;

export const LeafletMapView = forwardRef<LeafletMapViewRef, LeafletMapViewProps>(
  (
    {
      initialRegion,
      mappedPonds,
      selectedLocation,
      polygonPoints,
      mapMode = 'view',
      tileSource = 'osm',
      onMapPress, onPondPress, onVertexPress, onVertexMove, onMarkerMove,
      style,
    },
    ref
  ) => {
    const webViewRef = useRef<WebView>(null);
    const loadedRef = useRef(false);

    useImperativeHandle(ref, () => ({
      flyTo: (lat: number, lng: number, zoom = 16) => {
        webViewRef.current?.injectJavaScript(`window.flyToLocation(${lat}, ${lng}, ${zoom}); true;`);
      },
      fitBounds: (coords: Coordinate[]) => {
        if (coords.length === 0) return;
        webViewRef.current?.injectJavaScript(
          `window.fitBoundsCoords(${JSON.stringify(coords)}); true;`
        );
      },
    }));

    const updateWebView = () => {
      if (!loadedRef.current) return;
      const dataPayload = JSON.stringify({
        mappedPonds,
        selectedLocation,
        polygonPoints,
        mapMode,
        tileSource,
      });
      webViewRef.current?.injectJavaScript(`window.updateMapData(${dataPayload}); true;`);
    };

    useEffect(() => {
      updateWebView();
    }, [mappedPonds, selectedLocation, polygonPoints, mapMode, tileSource]);

    const handleMessage = (event: any) => {
      try {
        const payload = JSON.parse(event.nativeEvent.data);
        if (payload?.type === 'pondPress' && typeof payload.id === 'string') onPondPress?.(payload.id);
        if (payload?.type === 'vertexPress' && Number.isInteger(payload.index)) onVertexPress?.(payload.index);
        if (Number.isFinite(payload.latitude) && Number.isFinite(payload.longitude)) {
          const point = { latitude: payload.latitude, longitude: payload.longitude };
          if (payload.type === 'vertexMove' && Number.isInteger(payload.index)) onVertexMove?.(payload.index, point);
          if (payload.type === 'markerMove') onMarkerMove?.(point);
        }
        if (payload?.type === 'mapPress' && onMapPress) {
          onMapPress({
            latitude: payload.latitude,
            longitude: payload.longitude,
          });
        }
      } catch (_e) {
        // Ignore invalid message
      }
    };

    const handleLoadEnd = () => {
      loadedRef.current = true;
      if (initialRegion) {
        webViewRef.current?.injectJavaScript(
          `window.flyToLocation(${initialRegion.latitude}, ${initialRegion.longitude}, 14); true;`
        );
      }
      updateWebView();
    };

    const RNWebView: any = WebView;

    return (
      <View style={[styles.container, style]}>
        <RNWebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: LEAFLET_HTML }}
          style={styles.webview}
          onMessage={handleMessage}
          onLoadEnd={handleLoadEnd}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
        />
      </View>
    );
  }
);

LeafletMapView.displayName = 'LeafletMapView';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eef2f6',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
