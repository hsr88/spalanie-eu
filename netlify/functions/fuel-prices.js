// netlify/functions/fuel-prices.js
// Netlify Serverless Function - ceny paliw przez scraping (autocentrum.pl)

const fetch = require('node-fetch');

// Domyślne ceny (fallback) - marzec 2026 (źródło: e-petrol.pl, autokult.pl)
const DEFAULT_PRICES = {
  PB95: 6.06,
  ON: 6.57,
  LPG: 2.91
};

const FETCH_TIMEOUT = 6000;

/**
 * Fetch z timeoutem
 */
async function fetchWithTimeout(url, timeout = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pl-PL,pl;q=0.9',
      }
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * Scraping AutoCentrum.pl - potwierdzone działanie
 * Struktura: <h3 class="fuel-header">95</h3><div class="price">6,06<span>zł</span></div>
 */
async function fetchFromAutoCentrum() {
  try {
    console.log('[AutoCentrum] Pobieranie...');
    const response = await fetchWithTimeout('https://www.autocentrum.pl/paliwa/ceny-paliw/');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    const prices = {};

    const pb95Match = html.match(/<h3[^>]*>\s*95\s*<\/h3>\s*<div[^>]*class="price"[^>]*>\s*([\d,]+)/i);
    if (pb95Match) prices.PB95 = parseFloat(pb95Match[1].replace(',', '.'));

    const onMatch = html.match(/<h3[^>]*>\s*ON\s*<\/h3>\s*<div[^>]*class="price"[^>]*>\s*([\d,]+)/i);
    if (onMatch) prices.ON = parseFloat(onMatch[1].replace(',', '.'));

    const lpgMatch = html.match(/<h3[^>]*>\s*LPG\s*<\/h3>\s*<div[^>]*class="price"[^>]*>\s*([\d,]+)/i);
    if (lpgMatch) prices.LPG = parseFloat(lpgMatch[1].replace(',', '.'));

    const valid = (p) => p && p > 3 && p < 15;
    if (valid(prices.PB95) && valid(prices.ON)) {
      console.log('[AutoCentrum] Sukces:', prices);
      return {
        source: 'AutoCentrum.pl',
        PB95: prices.PB95,
        ON: prices.ON,
        LPG: prices.LPG || DEFAULT_PRICES.LPG,
        date: new Date().toISOString().split('T')[0]
      };
    }

    console.log('[AutoCentrum] Brak cen w HTML');
    return null;
  } catch (error) {
    console.error('[AutoCentrum] Błąd:', error.message);
    return null;
  }
}

/**
 * Scraping fuelo.net - backup (dane EU, PLN dla Polski)
 */
async function fetchFromFuelo() {
  try {
    console.log('[Fuelo] Pobieranie...');
    const response = await fetchWithTimeout('https://fuelo.net/mapf/fuel_prices?country=pl&lang=pl');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (!data || !data.prices) return null;

    const prices = {};
    // Fuelo zwraca obiekt z typami paliw
    if (data.prices.petrol_95) prices.PB95 = parseFloat(data.prices.petrol_95);
    if (data.prices.diesel) prices.ON = parseFloat(data.prices.diesel);
    if (data.prices.lpg) prices.LPG = parseFloat(data.prices.lpg);

    const valid = (p) => p && p > 3 && p < 15;
    if (valid(prices.PB95) && valid(prices.ON)) {
      console.log('[Fuelo] Sukces:', prices);
      return {
        source: 'Fuelo.net',
        PB95: prices.PB95,
        ON: prices.ON,
        LPG: prices.LPG || DEFAULT_PRICES.LPG,
        date: new Date().toISOString().split('T')[0]
      };
    }

    return null;
  } catch (error) {
    console.error('[Fuelo] Bład:', error.message);
    return null;
  }
}

/**
 * Główna funkcja handler
 */
exports.handler = async (event, context) => {
  console.log('=== Fuel Prices Function Started ===');

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=1800' // 30 min cache
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Race: pierwsze źródło które odpowie wygrywa
    // AutoCentrum.pl ma potwierdzone działanie
    let prices = null;

    const result = await Promise.race([
      fetchFromAutoCentrum(),
      fetchFromFuelo(),
      new Promise(resolve => setTimeout(() => resolve(null), 7000)) // max 7s timeout
    ]);

    if (result) {
      prices = result;
    }

    if (!prices) {
      // Jeśli oba zawodzą - używamy aktualnych cen domyślnych
      console.log('Wszyskie źródła zawiodły, używam domyślnych cen');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          source: 'default (marzec 2025)',
          message: 'Używam aktualnych cen z marca 2025 (na podstawie Reflex)',
          prices: DEFAULT_PRICES,
          update_date: '2026-03-08',
          timestamp: new Date().toISOString()
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        source: prices.source,
        prices: {
          PB95: prices.PB95 || DEFAULT_PRICES.PB95,
          ON: prices.ON || DEFAULT_PRICES.ON,
          LPG: prices.LPG || DEFAULT_PRICES.LPG
        },
        update_date: prices.date,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Błąd funkcji:', error.message);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: false,
        prices: DEFAULT_PRICES,
        update_date: '2025-03-08',
        timestamp: new Date().toISOString()
      })
    };
  }
};