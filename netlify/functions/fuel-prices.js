// netlify/functions/fuel-prices.js
// Netlify Serverless Function - zamiennik fuel-prices.php

const fetch = require('node-fetch');

// Domyślne ceny (fallback) - AKTUALIZUJ TE WARTOŚCI REGULARNIE!
const DEFAULT_PRICES = {
  PB95: 6.89,
  ON: 6.71,
  LPG: 3.15
};

// Timeout dla requestów (10 sekund)
const FETCH_TIMEOUT = 10000;

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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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
 * Pobiera ceny z E-petrol.pl (najprostsze do parsowania)
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
    
    // Różne możliwe wzorce dla PB95
    const pb95Patterns = [
      /pb.*?95.*?(\d+[,\.]\d+)\s*z[łl]/i,
      /benzyna.*?95.*?(\d+[,\.]\d+)\s*z[łl]/i,
      /<td[^>]*>.*?95.*?<\/td>\s*<td[^>]*>(\d+[,\.]\d+)/i
    ];
    
    for (const pattern of pb95Patterns) {
      const match = html.match(pattern);
      if (match) {
        prices.PB95 = parseFloat(match[1].replace(',', '.'));
        console.log(`E-petrol PB95 found: ${prices.PB95}`);
        break;
      }
    }
    
    // Różne możliwe wzorce dla ON
    const onPatterns = [
      /olej.*?napędow.*?(\d+[,\.]\d+)\s*z[łl]/i,
      /diesel.*?(\d+[,\.]\d+)\s*z[łl]/i,
      /\bon\b.*?(\d+[,\.]\d+)\s*z[łl]/i,
      /<td[^>]*>.*?ON.*?<\/td>\s*<td[^>]*>(\d+[,\.]\d+)/i
    ];
    
    for (const pattern of onPatterns) {
      const match = html.match(pattern);
      if (match) {
        prices.ON = parseFloat(match[1].replace(',', '.'));
        console.log(`E-petrol ON found: ${prices.ON}`);
        break;
      }
    }
    
    // Różne możliwe wzorce dla LPG
    const lpgPatterns = [
      /lpg.*?(\d+[,\.]\d+)\s*z[łl]/i,
      /gaz.*?(\d+[,\.]\d+)\s*z[łl]/i,
      /<td[^>]*>.*?LPG.*?<\/td>\s*<td[^>]*>(\d+[,\.]\d+)/i
    ];
    
    for (const pattern of lpgPatterns) {
      const match = html.match(pattern);
      if (match) {
        prices.LPG = parseFloat(match[1].replace(',', '.'));
        console.log(`E-petrol LPG found: ${prices.LPG}`);
        break;
      }
    }
    
    // Walidacja cen (czy są w rozsądnym zakresie)
    const isValidPrice = (price) => price > 2 && price < 15;
    
    if (prices.PB95 && prices.ON && isValidPrice(prices.PB95) && isValidPrice(prices.ON)) {
      console.log('E-petrol SUCCESS:', prices);
      return {
        source: 'e-petrol.pl',
        PB95: prices.PB95,
        ON: prices.ON,
        LPG: prices.LPG || 3.15,
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
 * Pobiera ceny z GlobalPetrolPrices.com (backup - dane światowe dla Polski)
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
    
    // Szukamy cen w tabeli
    const priceMatch = html.match(/(\d+\.\d+)\s*PLN/);
    
    if (priceMatch) {
      const pb95Price = parseFloat(priceMatch[1]);
      const onPrice = pb95Price * 0.97; // ON zwykle ~3% taniej
      
      console.log('GlobalPetrolPrices SUCCESS:', { PB95: pb95Price, ON: onPrice });
      
      return {
        source: 'GlobalPetrolPrices.com',
        PB95: pb95Price,
        ON: onPrice,
        LPG: 3.15,
        date: new Date().toISOString().split('T')[0]
      };
    }
    
    console.error('GlobalPetrolPrices: Ceny nie znalezione');
    return null;
    
  } catch (error) {
    console.error('GlobalPetrolPrices fetch error:', error.message);
    return null;
  }
}

/**
 * Pobiera ceny z Orlen API
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
    const marginFactor = 1.4;
    
    data.forEach(item => {
      const retailPrice = (item.price / 1000) * marginFactor;
      
      if (item.productCode === 'B95') {
        prices.PB95 = Math.round(retailPrice * 100) / 100;
        prices.date = item.date;
        console.log(`Orlen PB95 found: ${prices.PB95}`);
      }
      if (item.productCode === 'ON') {
        prices.ON = Math.round(retailPrice * 100) / 100;
        console.log(`Orlen ON found: ${prices.ON}`);
      }
    });
    
    if (prices.PB95 && prices.ON) {
      console.log('Orlen SUCCESS:', prices);
      return {
        source: 'Orlen.pl (hurt + marża)',
        PB95: prices.PB95,
        ON: prices.ON,
        LPG: 3.15,
        date: prices.date || new Date().toISOString().split('T')[0]
      };
    }
    
    console.error('Orlen: Ceny nie znalezione w danych');
    return null;
    
  } catch (error) {
    console.error('Orlen fetch error:', error.message);
    return null;
  }
}

/**
 * Główna funkcja handler
 */
exports.handler = async (event, context) => {
  console.log('=== Fuel Prices Function Started ===');
  console.log(`Method: ${event.httpMethod}`);
  
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
    
    // Strategia 1: E-petrol (najlepsze dla Polski)
    prices = await fetchFromEPetrol();
    attempts.push({ source: 'e-petrol.pl', success: !!prices });
    
    // Strategia 2: Orlen API
    if (!prices) {
      console.log('E-petrol failed, trying Orlen...');
      prices = await fetchFromOrlen();
      attempts.push({ source: 'Orlen API', success: !!prices });
    }
    
    // Strategia 3: GlobalPetrolPrices
    if (!prices) {
      console.log('Orlen failed, trying GlobalPetrolPrices...');
      prices = await fetchFromGlobalPetrolPrices();
      attempts.push({ source: 'GlobalPetrolPrices', success: !!prices });
    }
    
    // Strategia 4: Domyślne ceny
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
          note: 'Zaktualizuj DEFAULT_PRICES w kodzie lub ustaw własne ceny w menu kalkulatora'
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
      statusCode: 200, // Zwracamy 200 żeby frontend dostał fallback
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