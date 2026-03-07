// netlify/functions/fuel-prices.js
// Netlify Serverless Function - pobieranie cen paliw z wielu źródeł

const fetch = require('node-fetch');

// Domyślne ceny (fallback) - aktualizowane: 07.03.2026
const DEFAULT_PRICES = {
  PB95: 6.45,
  ON: 6.38,
  LPG: 3.25
};

// Timeout dla requestów (8 sekund)
const FETCH_TIMEOUT = 8000;

// Walidacja ceny - czy jest w rozsądnym zakresie (3-20 zł)
const isValidPrice = (price) => price > 3 && price < 20;

/**
 * Fetch z timeoutem
 */
async function fetchWithTimeout(url, options = {}, timeout = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
        ...options.headers
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
 * Pobiera ceny z E-petrol.pl
 */
async function fetchFromEPetrol() {
  try {
    console.log('Próba pobrania z e-petrol.pl...');
    const url = 'https://www.e-petrol.pl/notowania/rynek-krajowy/ceny-stacje-paliw';
    const response = await fetchWithTimeout(url);
    
    if (!response.ok) {
      console.error(`E-petrol HTTP error: ${response.status}`);
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    console.log(`E-petrol HTML length: ${html.length}`);
    
    const prices = {};
    
    // Szukamy w tabeli - wzorce dla różnych struktur HTML
    // Szukamy ceny PB95
    const pb95Patterns = [
      /<td[^>]*>\s*95[\s\S]*?<td[^>]*>(\d+[,.]\d+)/i,
      /<td[^>]*>\s*PB95[\s\S]*?<td[^>]*>(\d+[,.]\d+)/i,
      /95[\s\S]{0,50}?<td[^>]*>(\d+[,.]\d+)[\s\S]{0,20}?z[łl]/i,
      /benzyna.*?95[^\d]{0,100}(\d+[,.]\d+)\s*z[łl]/i
    ];
    
    for (const pattern of pb95Patterns) {
      const match = html.match(pattern);
      if (match) {
        prices.PB95 = parseFloat(match[1].replace(',', '.'));
        console.log(`E-petrol PB95 found: ${prices.PB95}`);
        break;
      }
    }
    
    // Szukamy ceny ON
    const onPatterns = [
      /<td[^>]*>\s*ON[\s\S]*?<td[^>]*>(\d+[,.]\d+)/i,
      /<td[^>]*>\s*olej[\s\S]*?<td[^>]*>(\d+[,.]\d+)/i,
      /ON[\s\S]{0,50}?<td[^>]*>(\d+[,.]\d+)[\s\S]{0,20}?z[łl]/i,
      /olej.*?napędowy[^\d]{0,100}(\d+[,.]\d+)\s*z[łl]/i
    ];
    
    for (const pattern of onPatterns) {
      const match = html.match(pattern);
      if (match) {
        prices.ON = parseFloat(match[1].replace(',', '.'));
        console.log(`E-petrol ON found: ${prices.ON}`);
        break;
      }
    }
    
    // Szukamy ceny LPG
    const lpgPatterns = [
      /<td[^>]*>\s*LPG[\s\S]*?<td[^>]*>(\d+[,.]\d+)/i,
      /<td[^>]*>\s*gaz[\s\S]*?<td[^>]*>(\d+[,.]\d+)/i,
      /LPG[\s\S]{0,50}?<td[^>]*>(\d+[,.]\d+)[\s\S]{0,20}?z[łl]/i
    ];
    
    for (const pattern of lpgPatterns) {
      const match = html.match(pattern);
      if (match) {
        prices.LPG = parseFloat(match[1].replace(',', '.'));
        console.log(`E-petrol LPG found: ${prices.LPG}`);
        break;
      }
    }
    
    if (isValidPrice(prices.PB95) && isValidPrice(prices.ON)) {
      console.log('E-petrol SUCCESS:', prices);
      return {
        source: 'e-petrol.pl',
        PB95: prices.PB95,
        ON: prices.ON,
        LPG: prices.LPG || DEFAULT_PRICES.LPG,
        date: new Date().toISOString().split('T')[0]
      };
    }
    
    console.error('E-petrol: Ceny nie znalezione lub nieprawidłowe');
    return null;
    
  } catch (error) {
    console.error('E-petrol fetch error:', error.message);
    return null;
  }
}

/**
 * Pobiera ceny z AutoCentrum.pl (backend - bez CORS!)
 * Struktura: <h3 class="fuel-header">95</h3> <div class="price"> 5,95 <span>zł</span> </div>
 */
async function fetchFromAutoCentrum() {
  try {
    console.log('Próba pobrania z autocentrum.pl...');
    const url = 'https://www.autocentrum.pl/paliwa/ceny-paliw/';
    const response = await fetchWithTimeout(url);
    
    if (!response.ok) {
      console.error(`AutoCentrum HTTP error: ${response.status}`);
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    console.log(`AutoCentrum HTML length: ${html.length}`);
    
    const prices = {};
    
    // Szukamy bloków: <h3...>NAZWA</h3> <div class="price"> CENA <span>zł</span> </div>
    // PB95 - szukamy "95" w h3, a potem ceny w div.price
    const pb95Match = html.match(/<h3[^>]*>\s*95\s*<\/h3>\s*<div[^>]*class="price"[^>]*>\s*([\d,]+)/i);
    if (pb95Match) {
      prices.PB95 = parseFloat(pb95Match[1].replace(',', '.'));
      console.log(`AutoCentrum PB95 found: ${prices.PB95}`);
    }
    
    // ON - szukamy "ON" w h3
    const onMatch = html.match(/<h3[^>]*>\s*ON\s*<\/h3>\s*<div[^>]*class="price"[^>]*>\s*([\d,]+)/i);
    if (onMatch) {
      prices.ON = parseFloat(onMatch[1].replace(',', '.'));
      console.log(`AutoCentrum ON found: ${prices.ON}`);
    }
    
    // LPG - szukamy "LPG" w h3
    const lpgMatch = html.match(/<h3[^>]*>\s*LPG\s*<\/h3>\s*<div[^>]*class="price"[^>]*>\s*([\d,]+)/i);
    if (lpgMatch) {
      prices.LPG = parseFloat(lpgMatch[1].replace(',', '.'));
      console.log(`AutoCentrum LPG found: ${prices.LPG}`);
    }
    
    if (isValidPrice(prices.PB95) && isValidPrice(prices.ON)) {
      console.log('AutoCentrum SUCCESS:', prices);
      return {
        source: 'AutoCentrum.pl',
        PB95: prices.PB95,
        ON: prices.ON,
        LPG: prices.LPG || DEFAULT_PRICES.LPG,
        date: new Date().toISOString().split('T')[0]
      };
    }
    
    console.error('AutoCentrum: Ceny nie znalezione lub nieprawidłowe');
    return null;
    
  } catch (error) {
    console.error('AutoCentrum fetch error:', error.message);
    return null;
  }
}

/**
 * Pobiera ceny z Orlen API (hurtowe -> detaliczne)
 */
async function fetchFromOrlen() {
  try {
    console.log('Próba pobrania z Orlen API...');
    const url = 'https://api.orlen.pl/api/fuelprices/wholesale';
    const response = await fetchWithTimeout(url);
    
    if (!response.ok) {
      console.error(`Orlen HTTP error: ${response.status}`);
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`Orlen data items: ${data.length}`);
    
    const prices = {};
    const marginFactor = 1.35; // Marża hurt -> detal
    
    data.forEach(item => {
      const retailPrice = Math.round((item.price / 1000) * marginFactor * 100) / 100;
      
      if (item.productCode === 'B95') {
        prices.PB95 = retailPrice;
        prices.date = item.date;
        console.log(`Orlen PB95 found: ${prices.PB95}`);
      }
      if (item.productCode === 'ON') {
        prices.ON = retailPrice;
        console.log(`Orlen ON found: ${prices.ON}`);
      }
    });
    
    if (isValidPrice(prices.PB95) && isValidPrice(prices.ON)) {
      console.log('Orlen SUCCESS:', prices);
      return {
        source: 'Orlen.pl (hurt + marża)',
        PB95: prices.PB95,
        ON: prices.ON,
        LPG: DEFAULT_PRICES.LPG, // Orlen nie podaje LPG w tym API
        date: prices.date || new Date().toISOString().split('T')[0]
      };
    }
    
    console.error('Orlen: Ceny nie znalezione');
    return null;
    
  } catch (error) {
    console.error('Orlen fetch error:', error.message);
    return null;
  }
}

/**
 * Pobiera ceny z GlobalPetrolPrices.com
 */
async function fetchFromGlobalPetrolPrices() {
  try {
    console.log('Próba pobrania z GlobalPetrolPrices...');
    const url = 'https://www.globalpetrolprices.com/Poland/gasoline_prices/';
    const response = await fetchWithTimeout(url);
    
    if (!response.ok) {
      console.error(`GlobalPetrolPrices HTTP error: ${response.status}`);
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    
    // Szukamy ceny w PLN
    const priceMatch = html.match(/(\d+\.\d+)\s*PLN/i);
    
    if (priceMatch) {
      const pb95Price = parseFloat(priceMatch[1]);
      
      if (isValidPrice(pb95Price)) {
        const onPrice = Math.round(pb95Price * 0.97 * 100) / 100; // ON ~3% taniej
        
        console.log('GlobalPetrolPrices SUCCESS:', { PB95: pb95Price, ON: onPrice });
        
        return {
          source: 'GlobalPetrolPrices.com',
          PB95: pb95Price,
          ON: onPrice,
          LPG: DEFAULT_PRICES.LPG,
          date: new Date().toISOString().split('T')[0]
        };
      }
    }
    
    console.error('GlobalPetrolPrices: Ceny nie znalezione');
    return null;
    
  } catch (error) {
    console.error('GlobalPetrolPrices fetch error:', error.message);
    return null;
  }
}

/**
 * Główna funkcja handler
 */
exports.handler = async (event, context) => {
  console.log('=== Fuel Prices Function Started ===');
  console.log(`Method: ${event.httpMethod}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=1800' // 30 minut cache
  };
  
  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }
  
  try {
    let prices = null;
    let attempts = [];
    
    // Strategia 1: E-petrol.pl
    prices = await fetchFromEPetrol();
    attempts.push({ source: 'e-petrol.pl', success: !!prices });
    
    
    // Strategia 3: AutoCentrum.pl
    if (!prices) {
      console.log('E-petrol failed, trying AutoCentrum...');
      prices = await fetchFromAutoCentrum();
      attempts.push({ source: 'autocentrum.pl', success: !!prices });
    }
    
    // Strategia 4: Orlen API
    if (!prices) {
      console.log('AutoCentrum failed, trying Orlen...');
      prices = await fetchFromOrlen();
      attempts.push({ source: 'orlen.pl', success: !!prices });
    }
    
    // Strategia 5: GlobalPetrolPrices
    if (!prices) {
      console.log('Orlen failed, trying GlobalPetrolPrices...');
      prices = await fetchFromGlobalPetrolPrices();
      attempts.push({ source: 'globalpetrolprices.com', success: !!prices });
    }
    
    // Fallback: Domyślne ceny
    if (!prices) {
      console.log('All sources failed, using defaults');
      console.log('Attempts:', JSON.stringify(attempts));
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          source: 'default',
          message: 'Wszystkie źródła danych zawiodły. Używam cen domyślnych.',
          attempts: attempts,
          prices: DEFAULT_PRICES,
          timestamp: new Date().toISOString(),
          note: 'Możesz ustawić własne ceny w menu kalkulatora (☰)'
        })
      };
    }
    
    // Sukces
    console.log('SUCCESS! Source:', prices.source);
    console.log('Prices:', prices);
    
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
        timestamp: new Date().toISOString(),
        attempts: attempts
      })
    };
    
  } catch (error) {
    console.error('=== Function Error ===');
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Internal error',
        message: error.message,
        prices: DEFAULT_PRICES,
        timestamp: new Date().toISOString()
      })
    };
  }
};
