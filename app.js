/* ═══════════════════════════════════════════════════════════════════════════
   Board-Bored V1 · First Friday Interactive Map
   Static deploy · Leaflet 1.9.4 · CartoDB DarkMatter tiles · jsQR scanner

   SECURITY: Stamps require scanning a rotating HMAC-signed QR code displayed
   by venue staff via admin.html. Screenshots expire every 60 seconds.
   STAMP_SECRET must match the value in admin.html.
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // ─── SECURITY CONFIG ─────────────────────────────────────────────────────
    // MUST match STAMP_SECRET in admin.html
    var STAMP_SECRET = 'bb-ff-bake-2026';

    // ─── VENUE DATA ─────────────────────────────────────────────────────────
    // Loaded from localStorage (set via admin.html) — fallback to hardcoded defaults.
    // Edit venues via admin.html; changes sync here automatically on next page load.

    var VENUE_DATA_KEY = 'bb_venue_data';

    var DEFAULT_VENUES = [
        {
            id: 1, name: 'Bakersfield Vintage', address: '1918 Eye St',
            coords: [35.3768, -119.0198], emoji: '📻',
            blurb: 'Curated vintage finds — records, clothing, rare 80s & 90s collectibles. The starting point of the First Friday trail.',
            stamp: 'stamp-1'
        },
        {
            id: 2, name: "Dagny's Coffee", address: '1600 20th St (20th & Eye)',
            coords: [35.3774, -119.0202], emoji: '☕',
            blurb: "Specialty coffee at the corner of 20th and Eye. The natural gathering point before heading the arts district.",
            stamp: 'stamp-2'
        },
        {
            id: 3, name: 'Bakersfield Art Association', address: '1607 19th St · BAA',
            coords: [35.3771, -119.0199], emoji: '🎨',
            blurb: 'Local artists, open studios, and gallery nights. The beating heart of the Bakersfield arts scene since 1951.',
            stamp: 'stamp-3'
        },
        {
            id: 4, name: 'Encore Boutique', address: '1817 Eye St',
            coords: [35.3762, -119.0197], emoji: '👗',
            blurb: "Consignment boutique with a legendary First Friday $1 sale. The deal of the evening — don't miss it.",
            stamp: 'stamp-4'
        },
        {
            id: 5, name: 'Arts Council of Kern', address: '1020 18th St · ACK',
            coords: [35.3745, -119.0193], emoji: '🏛️',
            blurb: 'The cultural anchor of the Central Valley. Vendors, food trucks, live stage, and your reward claim desk.',
            stamp: 'stamp-5'
        },
        {
            id: 6, name: "Sandrini's Public House", address: '1918 Eye St',
            coords: [35.3768, -119.0200], emoji: '🍻',
            blurb: 'Italian restaurant and bar with live music in the same building as Bakersfield Vintage. Great First Friday energy.',
            stamp: null
        },
        {
            id: 7, name: 'The Padre Hotel', address: '1702 18th St (18th & H)',
            coords: [35.3755, -119.0216], emoji: '🍸',
            blurb: "Historic 1928 landmark. Rooftop bar with Bakersfield's best skyline view. Worth the detour.",
            stamp: null
        },
        {
            id: 8, name: "Jerry's Pizza & Pub", address: '1817 Chester Ave',
            coords: [35.3762, -119.0224], emoji: '🍕',
            blurb: 'Live music venue since 1992. One block west of Eye St — detour for local flavor.',
            stamp: null
        },
        {
            id: 9, name: 'Woolworth Building', address: '1400 19th St',
            coords: [35.3773, -119.0175], emoji: '🏢',
            blurb: "Historic mid-century building. A glimpse into downtown Bakersfield's past.",
            stamp: null
        },
        {
            id: 10, name: 'Fox Theater', address: '2001 H St',
            coords: [35.3777, -119.0213], emoji: '🎭',
            blurb: "The crown jewel of downtown Bakersfield. Historic performing arts venue.",
            stamp: null
        }
    ];

    // Load from localStorage (admin edits), fall back to defaults
    var VENUES = (function () {
        try {
            var raw = localStorage.getItem(VENUE_DATA_KEY);
            if (raw) return JSON.parse(raw);
        } catch (_) {}
        return DEFAULT_VENUES;
    })();

    // Derive stamp order dynamically from loaded data
    var STAMP_ORDER = VENUES
        .filter(function (v) { return v.stamp !== null; })
        .sort(function (a, b) {
            return parseInt(a.stamp.replace('stamp-', '')) - parseInt(b.stamp.replace('stamp-', ''));
        });
    var TOTAL_STAMPS = STAMP_ORDER.length;

    // ─── STATE ──────────────────────────────────────────────────────────────
    var collection = {};
    try {
        var raw = localStorage.getItem('bb_stamps');
        if (raw) collection = JSON.parse(raw);
    } catch (_) { /* private browsing — start fresh */ }

    function saveState() {
        try { localStorage.setItem('bb_stamps', JSON.stringify(collection)); }
        catch (_) { /* ignore */ }
    }

    // Prevent reward modal from auto-firing on page load with stale stamp data.
    // The modal only triggers when a new stamp is freshly collected this session.
    var freshlyCollectedCount = 0;

    // Replay prevention: tokens used this session can't be reused
    var usedTokens = new Set();

    // ─── WEB CRYPTO: HMAC VERIFICATION ──────────────────────────────────────

    async function computeHmac(secret, message) {
        var enc = new TextEncoder();
        var key = await crypto.subtle.importKey(
            'raw', enc.encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false, ['sign']
        );
        var sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
        return Array.from(new Uint8Array(sig))
            .map(function (b) { return b.toString(16).padStart(2, '0'); })
            .join('');
    }

    /**
     * Verify a QR token. Returns venueId (1-5) if valid, or null.
     * Token format: BB:{venueId}:{timeWindow}:{hmac8}
     * Allows ±2 window tolerance (~2 min) for clock drift.
     */
    async function verifyToken(tokenStr) {
        try {
            var parts = tokenStr.split(':');
            if (parts.length !== 4 || parts[0] !== 'BB') return null;

            var venueId      = parseInt(parts[1], 10);
            var givenHmac    = parts[3];

            if (venueId < 1 || venueId > 5) return null;
            if (!givenHmac || givenHmac.length !== 8) return null;

            var nowWindow = Math.floor(Date.now() / 60000);

            for (var delta = -2; delta <= 2; delta++) {
                var win  = nowWindow + delta;
                var hmac = await computeHmac(STAMP_SECRET, venueId + ':' + win);
                if (hmac.substring(0, 8) === givenHmac) {
                    return venueId;
                }
            }
            return null;
        } catch (_) {
            return null;
        }
    }

    // ─── MAP INIT ───────────────────────────────────────────────────────────
    var map = L.map('map', {
        center: [35.3762, -119.0200],
        zoom: 16,
        zoomControl: false,
        minZoom: 15,
        maxZoom: 18,
        bounceAtZoomLimits: false,
        maxBounds: [
            [35.3720, -119.0250],
            [35.3810, -119.0150]
        ],
        maxBoundsViscosity: 0.75
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    // ─── WALKING ROUTE (5-STAMP HUNT) ────────────────────────────────────────
    var routeCoords = STAMP_ORDER.map(function (v) { return v.coords; });

    L.polyline(routeCoords, {
        color: '#8b5cf6',
        weight: 3,
        opacity: 0.65,
        dashArray: '8,6',
        lineJoin: 'round',
        lineCap: 'round'
    }).addTo(map);

    // Start cap (Vintage) + end cap (ACK)
    L.circleMarker(STAMP_ORDER[0].coords, {
        radius: 8, color: '#8b5cf6', fillColor: '#8b5cf6', fillOpacity: 0.4, weight: 2
    }).addTo(map);
    L.circleMarker(STAMP_ORDER[STAMP_ORDER.length - 1].coords, {
        radius: 8, color: '#ec4899', fillColor: '#ec4899', fillOpacity: 0.4, weight: 2
    }).addTo(map);

    // ─── MARKERS WITH NAME LABELS ────────────────────────────────────────────
    VENUES.forEach(function (venue) {
        var isStamp  = venue.stamp !== null;
        var shortName = venue.name.length > 14
            ? venue.name.split(' ').slice(0, 2).join(' ')
            : venue.name;

        var icon = L.divIcon({
            className: '',
            html: '<div class="pin-wrap">' +
                      '<div class="pin ' + (isStamp ? 'stamp-stop' : '') + '">' + venue.emoji + '</div>' +
                      '<div class="pin-label">' + shortName + '</div>' +
                  '</div>',
            iconSize: [76, 52],
            iconAnchor: [38, 22]
        });

        var marker = L.marker(venue.coords, { icon: icon }).addTo(map);

        // Tooltip with full address on hover
        marker.bindTooltip(
            '<strong>' + venue.name + '</strong><br>' + venue.address,
            { direction: 'top', offset: [0, -30], className: 'map-tooltip' }
        );

        marker.on('click', function () { openDrawer(venue); });
    });

    // ─── VENUE DRAWER ────────────────────────────────────────────────────────
    var drawerEl  = document.getElementById('venue-drawer');
    var drawerOpen = false;

    function openDrawer(venue) {
        var isStamp   = venue.stamp !== null;
        var collected = isStamp && collection[venue.stamp] === true;

        var stampHtml = '';
        if (isStamp) {
            if (collected) {
                stampHtml = '<div class="drawer-stamp-collected">✅ Stamped!</div>';
            } else {
                stampHtml = '<button class="btn btn--primary drawer-scan-btn" id="drawer-scan" data-venue="' + venue.id + '">' +
                                '📷 Scan QR to Stamp' +
                            '</button>' +
                            '<p class="drawer-hint">Ask staff to show the venue QR code.</p>';
            }
        }

        drawerEl.innerHTML =
            '<div class="drawer-handle"></div>' +
            '<div class="drawer-top">' +
                '<span class="drawer-emoji">' + venue.emoji + '</span>' +
                '<div class="drawer-info">' +
                    '<h3>' + venue.name + '</h3>' +
                    '<small>' + venue.address + '</small>' +
                '</div>' +
            '</div>' +
            '<p class="drawer-body">' + venue.blurb + '</p>' +
            stampHtml +
            '<button class="btn btn--secondary drawer-close-btn" id="drawer-close">✕ Close</button>';

        var closeBtn = document.getElementById('drawer-close');
        if (closeBtn) closeBtn.addEventListener('click', closeDrawer);

        var scanBtn = document.getElementById('drawer-scan');
        if (scanBtn) {
            scanBtn.addEventListener('click', function () {
                closeDrawer();
                openScanner(venue.stamp, venue.id);
            });
        }

        drawerEl.classList.add('open');
        drawerEl.setAttribute('aria-hidden', 'false');
        drawerOpen = true;
    }

    function closeDrawer() {
        drawerEl.classList.remove('open');
        drawerEl.setAttribute('aria-hidden', 'true');
        drawerOpen = false;
    }

    map.on('click', function () { if (drawerOpen) closeDrawer(); });

    // ─── VIEW SWITCHING ──────────────────────────────────────────────────────
    function switchView(id) {
        document.querySelectorAll('.view').forEach(function (el) {
            el.classList.remove('active');
        });
        document.getElementById(id).classList.add('active');
        if (id === 'map-view') {
            closeDrawer();
            setTimeout(function () { map.invalidateSize(); }, 60);
        }
    }

    document.getElementById('btn-open-hunt').addEventListener('click', function () {
        switchView('hunt-view');
    });
    document.getElementById('btn-back-map').addEventListener('click', function () {
        switchView('map-view');
    });

    // ─── SCAVENGER HUNT VIEW ─────────────────────────────────────────────────
    var gridEl = document.getElementById('stamp-grid');

    function buildHuntGrid() {
        gridEl.innerHTML = '';
        STAMP_ORDER.forEach(function (venue) {
            var ok   = collection[venue.stamp] === true;
            var card = document.createElement('div');
            card.className = 'stamp-card' + (ok ? ' collected' : '');
            card.dataset.stamp = venue.stamp;

            card.innerHTML =
                '<div class="stamp-icon">' + venue.emoji + '</div>' +
                '<div class="stamp-name">' + venue.name + '</div>' +
                '<div class="stamp-action">' +
                    (ok ? '<span class="stamp-done-label">✅ Collected</span>'
                        : '<span class="stamp-scan-label">📷 Scan QR</span>') +
                '</div>';

            if (!ok) {
                card.addEventListener('click', function () {
                    openScanner(venue.stamp, venue.id);
                });
            }

            gridEl.appendChild(card);
        });
        updateProgress();
    }

    function markStampCollected(stampId) {
        collection[stampId] = true;
        freshlyCollectedCount++;
        saveState();
        updateProgress();

        // Update hunt grid card
        var card = document.querySelector('[data-stamp="' + stampId + '"]');
        if (card) {
            card.classList.add('collected');
            var action = card.querySelector('.stamp-action');
            if (action) action.innerHTML = '<span class="stamp-done-label">✅ Collected</span>';
            // Remove click listener by replacing node
            var newCard = card.cloneNode(true);
            card.parentNode.replaceChild(newCard, card);
        }

        if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
    }

    function updateProgress() {
        var n = Object.values(collection).filter(Boolean).length;
        document.getElementById('progress-text').textContent = n + ' / ' + TOTAL_STAMPS + ' Stamps';
        document.getElementById('progress-fill').style.width = ((n / TOTAL_STAMPS) * 100) + '%';
        // Only show reward modal when stamps are freshly collected this session —
        // not from stale localStorage data loaded on page open.
        if (n >= TOTAL_STAMPS && freshlyCollectedCount > 0) {
            setTimeout(function () {
                document.getElementById('reward-modal').classList.add('show');
                document.getElementById('reward-modal').setAttribute('aria-hidden', 'false');
            }, 400);
        }
    }

    document.getElementById('btn-close-modal').addEventListener('click', function () {
        document.getElementById('reward-modal').classList.remove('show');
        document.getElementById('reward-modal').setAttribute('aria-hidden', 'true');
    });

    // ─── QR SCANNER ──────────────────────────────────────────────────────────
    var scannerOverlay  = document.getElementById('scanner-overlay');
    var scannerVideo    = document.getElementById('scanner-video');
    var scannerCanvas   = document.getElementById('scanner-canvas');
    var scannerStatus   = document.getElementById('scanner-status');
    var scannerClose    = document.getElementById('scanner-close');

    var scanning        = false;
    var scanLocked      = false;
    var currentStream   = null;
    var animFrameId     = null;
    var currentScanStamp = null; // which stamp card triggered the scanner

    function openScanner(stampId, venueId) {
        currentScanStamp = stampId;
        scannerOverlay.classList.add('active');
        scannerOverlay.setAttribute('aria-hidden', 'false');
        setScannerStatus('Point camera at venue QR code', '');
        startCamera();
    }

    function closeScanner() {
        scanning = false;
        scanLocked = false;
        if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
        if (currentStream) {
            currentStream.getTracks().forEach(function (t) { t.stop(); });
            currentStream = null;
        }
        scannerVideo.srcObject = null;
        scannerOverlay.classList.remove('active');
        scannerOverlay.setAttribute('aria-hidden', 'true');
        currentScanStamp = null;
    }

    scannerClose.addEventListener('click', closeScanner);

    function startCamera() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setScannerStatus('Camera not supported on this device.', 'error');
            return;
        }

        navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        }).then(function (stream) {
            currentStream = stream;
            scannerVideo.srcObject = stream;
            scannerVideo.setAttribute('playsinline', true);
            scannerVideo.play();
            scanning = true;
            scanLocked = false;
            animFrameId = requestAnimationFrame(processFrame);
        }).catch(function (err) {
            var msg = err.name === 'NotAllowedError'
                ? 'Camera permission denied. Please allow camera access.'
                : 'Could not start camera: ' + err.message;
            setScannerStatus(msg, 'error');
        });
    }

    function processFrame() {
        if (!scanning) return;

        if (scannerVideo.readyState === scannerVideo.HAVE_ENOUGH_DATA) {
            scannerCanvas.width  = scannerVideo.videoWidth;
            scannerCanvas.height = scannerVideo.videoHeight;

            var ctx = scannerCanvas.getContext('2d');
            ctx.drawImage(scannerVideo, 0, 0, scannerCanvas.width, scannerCanvas.height);

            var imageData = ctx.getImageData(0, 0, scannerCanvas.width, scannerCanvas.height);

            if (typeof jsQR !== 'undefined') {
                var code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: 'dontInvert'
                });
                if (code && code.data) {
                    handleScannedCode(code.data);
                    return; // pause frame loop while we verify
                }
            }
        }

        animFrameId = requestAnimationFrame(processFrame);
    }

    async function handleScannedCode(data) {
        if (scanLocked) {
            animFrameId = requestAnimationFrame(processFrame);
            return;
        }
        scanLocked = true;

        setScannerStatus('Verifying...', 'checking');

        // Check replay
        if (usedTokens.has(data)) {
            setScannerStatus('This QR code has already been used this session.', 'error');
            setTimeout(function () {
                setScannerStatus('Point camera at venue QR code', '');
                scanLocked = false;
                animFrameId = requestAnimationFrame(processFrame);
            }, 2000);
            return;
        }

        var venueId = await verifyToken(data);

        if (venueId === null) {
            setScannerStatus('Invalid or expired QR code. Ask staff to refresh.', 'error');
            setTimeout(function () {
                setScannerStatus('Point camera at venue QR code', '');
                scanLocked = false;
                animFrameId = requestAnimationFrame(processFrame);
            }, 2000);
            return;
        }

        var stampId = 'stamp-' + venueId;

        if (collection[stampId]) {
            setScannerStatus('You already have the ' + VENUES[venueId - 1].name + ' stamp!', 'error');
            setTimeout(function () { closeScanner(); }, 1800);
            return;
        }

        // ✅ Valid token, correct venue, not yet collected
        usedTokens.add(data);
        markStampCollected(stampId);
        setScannerStatus('✅ ' + VENUES[venueId - 1].name + ' stamp collected!', 'success');
        setTimeout(function () { closeScanner(); }, 1500);
    }

    function setScannerStatus(msg, type) {
        scannerStatus.textContent = msg;
        scannerStatus.className = 'scanner-status' + (type ? ' scanner-status--' + type : '');
    }

    // ─── BOOT ────────────────────────────────────────────────────────────────
    buildHuntGrid();
    setTimeout(function () { map.invalidateSize(); }, 200);

})();
