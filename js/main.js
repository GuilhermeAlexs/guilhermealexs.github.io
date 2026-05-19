/* =========================================
   Navigation
   ========================================= */

function showSection(id) {
  // Hide all sections
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));

  // Show target
  const target = document.getElementById(id);
  if (target) {
    target.classList.add('active');
    // Re-trigger fade-in animations
    target.querySelectorAll('.fade-in').forEach(el => {
      el.style.animation = 'none';
      el.offsetHeight; // reflow
      el.style.animation = '';
    });
  }

  // Update nav active state
  document.querySelectorAll('.site-nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.section === id);
  });

  // Close mobile nav
  document.getElementById('site-nav').classList.remove('open');

  // Init map if needed
  if (id === 'waterfalls') initMap();

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleNav() {
  document.getElementById('site-nav').classList.toggle('open');
}

// Set initial active nav link
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.site-nav a').forEach(a => {
    if (a.dataset.section === 'about') a.classList.add('active');
  });
});

/* =========================================
   Image Viewer (pan-only, fixed 50% zoom)
   ========================================= */

(function () {
  var posX = 0, posY = 0;
  var dragStartX, dragStartY, originX, originY;
  var isDragging = false;

  function el(id) { return document.getElementById(id); }

  window.openImgViewer = function (src, title) {
    el('img-viewer-title').textContent = title;
    var modal = el('img-viewer-modal');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    var img = el('img-viewer-img');
    img.onload = resetPosition;
    img.src = src;
    if (img.complete && img.naturalWidth) resetPosition();
  };

  window.closeImgViewer = function () {
    var modal = el('img-viewer-modal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    isDragging = false;
    el('img-viewer-stage').classList.remove('dragging');
  };

  function resetPosition() {
    var img   = el('img-viewer-img');
    var stage = el('img-viewer-stage');
    var w = img.naturalWidth  * 0.5;
    var h = img.naturalHeight * 0.5;
    img.style.width  = w + 'px';
    img.style.height = h + 'px';
    posX = (stage.offsetWidth  - w) / 2;
    posY = (stage.offsetHeight - h) / 2;
    applyPos();
  }

  function applyPos() {
    var img = el('img-viewer-img');
    img.style.left = posX + 'px';
    img.style.top  = posY + 'px';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var stage = el('img-viewer-stage');

    // Mouse
    stage.addEventListener('mousedown', function (e) {
      isDragging = true;
      dragStartX = e.clientX; dragStartY = e.clientY;
      originX = posX;         originY = posY;
      stage.classList.add('dragging');
    });
    document.addEventListener('mousemove', function (e) {
      if (!isDragging) return;
      posX = originX + (e.clientX - dragStartX);
      posY = originY + (e.clientY - dragStartY);
      applyPos();
    });
    document.addEventListener('mouseup', function () {
      isDragging = false;
      stage.classList.remove('dragging');
    });

    // Touch
    stage.addEventListener('touchstart', function (e) {
      var t = e.touches[0];
      isDragging = true;
      dragStartX = t.clientX; dragStartY = t.clientY;
      originX = posX;         originY = posY;
    }, { passive: true });
    stage.addEventListener('touchmove', function (e) {
      if (!isDragging) return;
      e.preventDefault();
      var t = e.touches[0];
      posX = originX + (t.clientX - dragStartX);
      posY = originY + (t.clientY - dragStartY);
      applyPos();
    }, { passive: false });
    stage.addEventListener('touchend', function () { isDragging = false; });

    // Keyboard
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeImgViewer();
    });
  });
}());

/* =========================================
   Leaflet Map
   ========================================= */

let mapInitialized = false;
let map;

function initMap() {
  if (mapInitialized) return;
  mapInitialized = true;

  map = L.map('leaflet-map', { center: [-20, -44], zoom: 6 });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  const infoPanel = document.getElementById('map-info');
  infoPanel.innerHTML = '<span style="color:var(--text-muted)">⏳ Loading data…</span>';

  const TYPE_OPACITY = { 1: 1, 2: 0.5, 3: 0.5 };

  function makeMarkerIcon(type) {
    const opacity = TYPE_OPACITY[type] ?? TYPE_OPACITY[1];
    return L.divIcon({
      className: '',
      html: `<div style="background:#6aaed8;border-radius:50%;width:13px;height:13px;border:2px solid rgba(255,255,255,0.9);box-shadow:0 1px 4px rgba(0,0,0,.4);opacity:${opacity}"></div>`,
      iconSize: [13, 13],
      iconAnchor: [6, 6],
      popupAnchor: [0, -6]
    });
  }

  const clusterGroup = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 65, minimumClusterSize: 10, disableClusteringAtZoom: 10 });
  map.addLayer(clusterGroup);

  // Parse a GeoPackage point geometry blob (OGC GPKG binary + WKB).
  // Returns [lat, lon] for Leaflet.
  function parseGpkgPoint(blob) {
    const v = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
    const flags       = v.getUint8(3);
    const envType     = (flags >> 1) & 7;
    const envSize     = [0, 32, 48, 48, 64][envType] || 0;
    const wkbStart    = 8 + envSize;
    const littleEnd   = v.getUint8(wkbStart) === 1;
    const lon         = v.getFloat64(wkbStart + 5,  littleEnd);
    const lat         = v.getFloat64(wkbStart + 13, littleEnd);
    return [lat, lon];
  }

  initSqlJs({ locateFile: f => `https://cdn.jsdelivr.net/npm/sql.js@1.10.2/dist/${f}` })
    .then(SQL => fetch('geo/waterfalls/waterfalls_22092023.gpkg').then(r => r.arrayBuffer()).then(buf => new SQL.Database(new Uint8Array(buf))))
    .then(db => {
      const [{ columns, values }] = db.exec('SELECT fid, name, type, geom FROM "waterfalls"');
      db.close();

      const geomIdx  = columns.indexOf('geom');
      const nameIdx  = columns.indexOf('name');
      const fidIdx   = columns.indexOf('fid');
      const typeIdx  = columns.indexOf('type');

      const markers = [];
      for (const row of values) {
        const blob = row[geomIdx];
        if (!blob || blob.length < 21) continue;
        const [lat, lon] = parseGpkgPoint(blob);
        if (!isFinite(lat) || !isFinite(lon)) continue;

        const name = row[nameIdx] || (row[fidIdx] ? `#${row[fidIdx]}` : 'Attraction');
        const type = row[typeIdx];
        const marker = L.marker([lat, lon], { icon: makeMarkerIcon(type) });
        marker.bindPopup(
          `<strong style="font-family:var(--font-serif);font-size:0.95rem">${name}</strong>`,
          { maxWidth: 240 }
        );
        marker.on('click', () => { infoPanel.innerHTML = `<strong>${name}</strong>`; });
        markers.push(marker);
      }

      clusterGroup.addLayers(markers);

      const bounds = clusterGroup.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });

      infoPanel.innerHTML =
        `<span style="color:var(--accent)">✓</span> ${markers.length.toLocaleString()} waterfalls loaded. Click a marker for details.`;
    })
    .catch(err => {
      console.error('GeoPackage load error:', err);
      infoPanel.innerHTML = '⚠️ Could not load GeoPackage. Make sure you are running a local HTTP server.';
    });
}
