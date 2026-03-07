# AGENTS.md - Spalanie.eu

> **Language Note:** This project uses Polish (polski) for all user-facing content, comments, and documentation.

## Project Overview

**Spalanie.eu** is a Polish fuel consumption and travel cost calculator web application. It calculates fuel costs, CO₂ emissions, and provides fuel price comparisons for Polish users.

- **Name:** spalanie-eu
- **Version:** 2.0.0
- **Domain:** https://spalanie.eu
- **License:** MIT
- **Language:** Polish (pl)

### Key Features
- Calculate travel costs based on distance and fuel consumption
- Real-time fuel price fetching (PB95, ON/diesel, LPG)
- CO₂ emission calculation with tree absorption equivalent
- Fuel price comparison across different fuel types
- Custom price settings (stored in localStorage)
- Share results via Web Share API or clipboard
- Responsive, mobile-first design
- Works offline with fallback prices

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vanilla HTML5, CSS3, JavaScript (ES6+) |
| Backend | Netlify Serverless Functions (Node.js) |
| Hosting | Netlify |
| Dependencies | node-fetch (^2.7.0) |
| Dev Tools | netlify-cli (^17.0.0) |

### No Build Process
This is a **static site** with no build step required. Files are served as-is.

## Project Structure

```
spalanie2/
├── index.html              # Main application UI (entry point)
├── script.js               # Main JavaScript logic (~900 lines)
├── style.css               # Styles with CSS custom properties
├── test-api.html           # API testing utility page
├── package.json            # Node.js dependencies
├── netlify.toml            # Netlify configuration
├── AGENTS.md               # This file
└── netlify/
    └── functions/
        └── fuel-prices.js  # Serverless function for fuel prices
```

### File Responsibilities

| File | Purpose |
|------|---------|
| `index.html` | Single-page application markup, semantic HTML, SEO meta tags |
| `script.js` | Core calculator logic, API fetching, UI interactions, localStorage |
| `style.css` | Mobile-first responsive styles, CSS variables for theming |
| `fuel-prices.js` | Netlify Function - fetches fuel prices from multiple sources |
| `test-api.html` | Debug/development page for testing API integrations |
| `netlify.toml` | Redirects, headers, build configuration |

## Architecture

### Client-Side (Browser)
- **Pure JavaScript** - no frameworks or bundlers
- **localStorage** - persists user preferences and custom prices
- **URL parameters** - enables sharing calculations via links (`?d=100&c=6.5&f=PB95`)
- **Service Worker ready** - designed for PWA capabilities

### Server-Side (Netlify Functions)
- **Serverless function** at `/.netlify/functions/fuel-prices`
- **Multi-source scraping** - tries multiple fuel price APIs
- **CORS enabled** - allows client-side fetching
- **30-minute cache** - reduces API load

### Fuel Price Data Sources (Priority Order)

#### Client-side (script.js):
1. AutoCentrum.pl (via allorigins.win CORS proxy)
2. Orlen API (direct, has CORS)
3. GlobalPetrolPrices.com (via multiple CORS proxies)
4. Netlify Function

#### Server-side (fuel-prices.js):
1. E-petrol.pl (HTML scraping)
2. Orlen API (JSON API)
3. GlobalPetrolPrices.com (HTML scraping)
4. Default prices (hardcoded fallback)

### Calculation Constants

```javascript
// Fuel consumption factors (relative to PB95)
CONSUMPTION_FACTORS = {
    PB95: 1.0,
    ON: 0.9,    // Diesel uses ~10% less
    LPG: 1.2    // LPG uses ~20% more
}

// CO2 calculation
CO2_PER_LITER_PB95 = 2340;           // grams CO₂ per liter
CO2_ABSORBED_PER_TREE_DAILY = 55;    // grams CO₂ absorbed per tree per day

// Price margin (wholesale to retail)
MARGIN_FACTOR = 1.4;
```

## Development Commands

```bash
# Install dependencies
npm install

# Run local development server with Netlify Functions
npm run dev
# or: npx netlify dev

# Build (no-op, static site)
npm run build
# Output: "No build required"
```

### Local Development Setup
1. Install Node.js dependencies: `npm install`
2. Run dev server: `npm run dev`
3. Access site at `http://localhost:8888`
4. Test API at `http://localhost:8888/test-api.html`

## Configuration

### netlify.toml
```toml
[build]
  publish = "."
  functions = "netlify/functions"

[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"

[[redirects]]
  from = "/api/fuel-prices"
  to = "/.netlify/functions/fuel-prices.js"
  status = 200
```

### Environment Variables
None required. All configuration is in code.

### Updating Default Prices
When APIs fail, fallback prices are used. Update these in:
- `script.js` - `DEFAULT_PRICES` object (around line 5)
- `fuel-prices.js` - `DEFAULT_PRICES` object (around line 7)

**Current defaults (as of 29.11.2025):**
- PB95: 5.88 zł/l
- ON: 6.19 zł/l  
- LPG: 2.61 zł/l

## Code Style Guidelines

### Comments
- Use Polish for all comments
- Prefix sections with `// --- N. SECTION NAME ---`
- Use JSDoc for function documentation

### Naming Conventions
```javascript
// Constants - UPPER_SNAKE_CASE
const DEFAULT_PRICES = { ... };
const CO2_PER_LITER_PB95 = 2340;

// DOM elements - $ prefix
const $distance = document.getElementById('distance');
const $costValue = document.getElementById('costValue');

// Functions - camelCase
function calculate() { ... }
function fetchFuelPrices() { ... }

// Variables - camelCase (Polish terms)
let domyslnePaliwo = 'PB95';
let cenyPaliw = { ... };
```

### CSS Classes
- BEM-like naming: `.block-element__modifier`
- Examples: `.calculator-card`, `.fuel-option`, `.result-value`

## Testing

### Manual Testing
1. Open `test-api.html` in browser
2. Click "Testuj Netlify Function" to verify serverless function
3. Click "Testuj Orlen API" to verify external API

### Test Scenarios
- Calculate costs for different distances (1 km, 100 km, 1000 km)
- Switch between fuel types (PB95, ON, LPG)
- Set custom prices in settings menu
- Test share functionality
- Verify responsive design on mobile viewport
- Disconnect internet to test fallback prices

### Price API Testing
Check browser console for fetch attempts:
```
Próba pobrania cen z AutoCentrum.pl...
AutoCentrum PB95 found with pattern: ... => 6.12
AutoCentrum ON found with pattern: ... => 6.05
AutoCentrum SUCCESS: {PB95: 6.12, ON: 6.05, LPG: 3.15}
```

## Deployment

### Netlify Deployment
1. Connect Git repository to Netlify
2. Build command: (none/empty)
3. Publish directory: `.`
4. Functions directory: `netlify/functions`

### Pre-deployment Checklist
- [ ] Update `DEFAULT_PRICES` if needed
- [ ] Test API endpoints in `test-api.html`
- [ ] Verify all fuel sources work
- [ ] Check responsive design
- [ ] Test share functionality

## Security Considerations

### Headers (configured in netlify.toml)
```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer-when-downgrade
```

### CORS
- Serverless function allows `*` origin
- Client uses CORS proxies for external APIs

### Input Validation
- All numeric inputs validated before calculations
- Price values validated to be within reasonable range (2-15 zł)

### No Sensitive Data
- No user authentication
- No database connections
- No API keys required
- localStorage only stores user preferences

## Browser Support

- Chrome/Edge 80+
- Firefox 75+
- Safari 13+
- Mobile browsers (iOS Safari, Chrome Mobile)

Requires:
- ES6+ support
- CSS Custom Properties
- Fetch API
- localStorage
- Web Share API (optional, with clipboard fallback)

## Common Issues

### API Failures
If fuel prices show "Brak połączenia z API":
1. Check browser console for errors
2. Verify CORS proxies are working
3. Test with `test-api.html`
4. Default prices will be used automatically

### Price Accuracy
- Prices are scraped from public sources
- May differ from actual station prices
- Users can set custom prices in settings

### Cache Issues
- Function results cached for 30 minutes
- Hard refresh (Ctrl+F5) to clear browser cache

## Resources

- **Live Site:** https://spalanie.eu
- **Netlify Docs:** https://docs.netlify.com/functions/
- **Orlen API:** https://api.orlen.pl/api/fuelprices/wholesale
