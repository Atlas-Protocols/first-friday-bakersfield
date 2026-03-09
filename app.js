/**
 * Board-Bored V1 - First Friday Demo App
 */

// 1. Map Initialization
// Center on Downtown Bakersfield (focusing perfectly on the 18th-19th St route)
const mapCenter = [35.3757, -119.0167]; // Midpoint between Encore Boutique and ACK
const map = L.map('map', {
    zoomControl: false // Custom UI handles this
}).setView(mapCenter, 16);

// Use standard OpenStreetMap tiles, CSS handles the dark mode inversion
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
}).addTo(map);

// Custom Leaflet DivIcon for stylistic markers
function createCustomIcon(emoji) {
    return L.divIcon({
        className: 'custom-marker',
        html: emoji,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });
}

// Add Mock Vendors / Locations along 18th/19th St Route
const locations = [
    { name: "Arts Council of Kern (1020 18th St)", coords: [35.37535, -119.01325], icon: "🏛️" },
    { name: "BAA @ Encore Boutique (1607 19th St - $1 SALE)", coords: [35.37615, -119.02022], icon: "👗" },
    { name: "Bakersfield Vintage", coords: [35.37600, -119.01500], icon: "📻" }, // Approx along 19th route
    { name: "Fox Theater (High Activity)", coords: [35.37700, -119.02200], icon: "🎭" },
    { name: "Padre Hotel (Bar / Food)", coords: [35.37500, -119.02100], icon: "🍸" }
];

locations.forEach(loc => {
    L.marker(loc.coords, { icon: createCustomIcon(loc.icon) })
        .addTo(map)
        .bindPopup(`<b>${loc.name}</b>`);
});

// 2. View Switching Logic
function switchView(viewId) {
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');

    // Invalidate map size so Leaflet renders correctly after being hidden
    if (viewId === 'map-view') {
        setTimeout(() => map.invalidateSize(), 50);
    }
}

// 3. Scavenger Hunt Logic (with localStorage fallback)
const totalStamps = 5;
const stampData = [
    { id: 'stamp-1', name: 'Arts Council (ACK)', icon: '🏛️' },
    { id: 'stamp-2', name: 'BAA @ Encore', icon: '👗' },
    { id: 'stamp-3', name: 'Bakersfield Vintage', icon: '📻' },
    { id: 'stamp-4', name: 'Padre Hotel/Drinks', icon: '🍸' },
    { id: 'stamp-5', name: 'Fox Theater', icon: '🎭' }
];

let collection = {};

// Safe wrapper for local storage
try {
    const rawData = localStorage.getItem('boardBoredCollection');
    if (rawData) {
        collection = JSON.parse(rawData);
    }
} catch (error) {
    console.error("Local storage not accessible, using temporary memory:", error);
}

function initScavengerHunt() {
    const grid = document.getElementById('stamp-grid');
    grid.innerHTML = ''; // clear

    stampData.forEach(stamp => {
        const isCollected = collection[stamp.id] === true;

        const card = document.createElement('div');
        card.className = `stamp-card ${isCollected ? 'collected' : ''}`;
        card.onclick = () => toggleStamp(stamp.id, card);
        card.innerHTML = `
            <div class="stamp-icon">${stamp.icon}</div>
            <div class="stamp-name">${stamp.name}</div>
        `;

        grid.appendChild(card);
    });

    updateProgress();
}

function toggleStamp(stampId, cardElement) {
    if (collection[stampId]) {
        // Un-collect (for demo purposes)
        collection[stampId] = false;
        cardElement.classList.remove('collected');
    } else {
        // Collect!
        collection[stampId] = true;
        cardElement.classList.add('collected');
        // Add a slight haptic feedback if supported on mobile
        if (navigator.vibrate) navigator.vibrate(50);
    }

    // Save state safely
    try {
        localStorage.setItem('boardBoredCollection', JSON.stringify(collection));
    } catch (err) {
        // Ignore setting error
    }

    updateProgress();
}

function updateProgress() {
    const collectedCount = Object.values(collection).filter(v => v).length;

    // Update Text
    document.getElementById('progress-text').innerText = `${collectedCount} / ${totalStamps} Stamps`;

    // Update Bar
    const percentage = (collectedCount / totalStamps) * 100;
    document.getElementById('progress-fill').style.width = `${percentage}%`;

    // Trigger Reward
    if (collectedCount === totalStamps) {
        setTimeout(showReward, 500); // Wait for animations to finish
    }
}

function showReward() {
    document.getElementById('reward-modal').classList.add('show');
}

function closeModal() {
    document.getElementById('reward-modal').classList.remove('show');
}

// Initialize on load
initScavengerHunt();
// Ensure the map loads cleanly on boot
setTimeout(() => map.invalidateSize(), 500);
