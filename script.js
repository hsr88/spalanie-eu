// --- 1. STAŁE I ZMIENNE GLOBALNE ---

// Domyślne ceny paliw (fallback) w zł/l
const DEFAULT_PRICES = {
    PB95: 6.89,
    ON: 6.71,
    LPG: 3.15 
};

// Współczynniki konwersji spalania w stosunku do PB95
const CONSUMPTION_FACTORS = {
    PB95: 1.0, 
    ON: 0.9, 
    LPG: 1.2
};


// Aktualne ceny paliw (zostaną zaktualizowane przez API/Custom)
let fuelPrices = { ...DEFAULT_PRICES };

// NOWE API - Alternatywne źródła danych o cenach paliw
const FUEL_PRICE_SOURCES = {
    // Netlify Function (dla hostingu na Netlify)
    BACKEND: '/.netlify/functions/fuel-prices',
    
    // Alternatywnie możesz użyć pełnego URL:
    // BACKEND: 'https://spalanie.eu/.netlify/functions/fuel-prices',
    
    // Orlen (poprzednie API - jako backup)
    ORLEN: 'https://api.allorigins.win/raw?url=https://api.orlen.pl/api/fuelprices/wholesale'
};

// Stałe obliczeniowe
const CO2_PER_LITER_PB95 = 2340; // g CO₂/l dla benzyny
const CO2_ABSORBED_PER_TREE_DAILY = 55; // g CO₂/dzień
const MARGIN_FACTOR = 1.4; // 1.4 do przeliczenia hurt → detal

// Domyślne paliwo - ładowanie z localStorage lub ustawienie PB95
const DEFAULT_FUEL_KEY = 'defaultFuelPreference';
let defaultFuel = localStorage.getItem(DEFAULT_FUEL_KEY) || 'PB95';

// Nowe: niestandardowe ceny zapisane w localStorage
const CUSTOM_PRICES_KEY = 'customFuelPrices';
let customPrices = JSON.parse(localStorage.getItem(CUSTOM_PRICES_KEY)) || {};


// Elementy DOM
const $distance = document.getElementById('distance');
const $consumption = document.getElementById('consumption');
const $priceInfo = document.getElementById('priceInfo');
const $costValue = document.getElementById('costValue');
const $litersValue = document.getElementById('litersValue');
const $co2Value = document.getElementById('co2Value');
const $progressBar = document.getElementById('progressBar');
const $treeEstimate = document.getElementById('treeEstimate');

// Elementy dla porównania kosztów podróży
const $costPB95 = document.getElementById('costPB95');
const $costON = document.getElementById('costON');
const $costLPG = document.getElementById('costLPG');

// Elementy dla cen za litr
const $pricePerLiterPB95 = document.getElementById('pricePerLiterPB95');
const $pricePerLiterON = document.getElementById('pricePerLiterON');
const $pricePerLiterLPG = document.getElementById('pricePerLiterLPG');

// Nowe elementy dla menu i udostępniania
const $menuButton = document.getElementById('menuButton');
const $settingsMenu = document.getElementById('settingsMenu');
const $closeMenuButton = document.getElementById('closeMenuButton');
const $mainCostLabel = document.getElementById('mainCostLabel');
const $radioButtons = document.querySelectorAll('input[name="defaultFuel"]');
const $controlButtons = document.querySelectorAll('.control-btn');

const $shareButton = document.getElementById('shareButton'); 
const $shareMessage = document.getElementById('shareMessage'); 

// Nowe elementy dla ręcznego wprowadzania cen
const $customPricePB95 = document.getElementById('customPricePB95');
const $customPriceON = document.getElementById('customPriceON');
const $customPriceLPG = document.getElementById('customPriceLPG');
const $settingsContent = document.querySelector('.settings-content');


// Ikona SVG drzewa (bez zmian)
const TREE_SVG = `
    <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.96 22a.5.5 0 01-.5-.5v-4.66a.5.5 0 01.5-.5h.08a.5.5 0 01.5.5v4.66a.5.5 0 01-.5.5h-.08zM12 2C7.03 2 3 6.03 3 11a9 9 0 001.07 4.19.5.5 0 00.9-.38A7.99 7.99 0 0112 4a7.99 7.99 0 018.03 10.81.5.5 0 00.9.38A9 9 0 0021 11c0-4.97-4.03-9-9-9zm0 18a8.97 8.97 0 006.18-2.67 1.5 1.5 0 00-.73-2.6 7 7 0 01-10.9 0 1.5 1.5 0 00-.73 2.6A8.97 8.97 0 0012 20zM12 5a7 7 0 00-5.83 3.02 1.5 1.5 0 00.27 2.1 6.99 6.99 0 0111.12 0 1.5 1.5 0 00.27-2.1A7 7 0 0012 5z"/>
    </svg>
`;

// --- 2. FUNKCJE POMOCNICZE I ANIMACJA (bez zmian) ---
function animateValue(el, start, end, duration, unit = '', precision = 2) {
    if (start === end) {
        el.textContent = end.toFixed(precision) + unit;
        return;
    }
    const range = end - start;
    let current = start;
    const startTime = performance.now();

    function step(timestamp) {
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        current = start + range * progress;
        
        const displayValue = progress === 1 ? end : current;

        if (precision === 0) {
            el.textContent = Math.round(displayValue).toLocaleString() + unit;
        } else {
            el.textContent = displayValue.toFixed(precision) + unit;
        }

        if (progress < 1) {
            requestAnimationFrame(step);
        }
    }

    requestAnimationFrame(step);
}

/**
 * Zwraca cenę paliwa (niestandardową, jeśli jest dostępna, w przeciwnym razie globalną).
 */
function getPrice(fuelType) {
    const custom = customPrices[fuelType];
    if (custom > 0) {
        return custom;
    }
    return fuelPrices[fuelType];
}

// --- 3. GŁÓWNA LOGIKA OBLICZEŃ (bez zmian) ---
function calculate() {
    const distance = parseFloat($distance.value);
    const consumption = parseFloat($consumption.value);

    // Walidacja danych
    if (isNaN(distance) || distance <= 0 || isNaN(consumption) || consumption <= 0) {
        $costValue.textContent = '0.00 zł';
        $litersValue.textContent = '0.00 l';
        $co2Value.textContent = '0 g';
        $progressBar.style.width = '0%';
        $treeEstimate.innerHTML = TREE_SVG + '0 drzew';
        $costPB95.textContent = '0.00 zł';
        $costON.textContent = '0.00 zł';
        $costLPG.textContent = '0.00 zł';
        
        $pricePerLiterPB95.textContent = getPrice('PB95').toFixed(2) + ' zł/l';
        $pricePerLiterON.textContent = getPrice('ON').toFixed(2) + ' zł/l';
        $pricePerLiterLPG.textContent = getPrice('LPG').toFixed(2) + ' zł/l';
        
        $mainCostLabel.textContent = `Koszt podróży (${defaultFuel})`;

        return;
    }

    // Obliczenia zużycia paliwa skorygowanego współczynnikiem
    const baseLiters = (distance * consumption) / 100;
    const litersPB95 = baseLiters * CONSUMPTION_FACTORS.PB95;
    const litersON = baseLiters * CONSUMPTION_FACTORS.ON;
    const litersLPG = baseLiters * CONSUMPTION_FACTORS.LPG;

    // Obliczenia kosztów
    const costPB95 = litersPB95 * getPrice('PB95');
    const costON = litersON * getPrice('ON');
    const costLPG = litersLPG * getPrice('LPG');

    let mainCost;
    let mainLiters;

    switch (defaultFuel) {
        case 'ON':
            mainCost = costON;
            mainLiters = litersON;
            break;
        case 'LPG':
            mainCost = costLPG;
            mainLiters = litersLPG;
            break;
        case 'PB95':
        default:
            mainCost = costPB95;
            mainLiters = litersPB95;
            break;
    }

    // Emisja CO₂
    const co2_emission = litersPB95 * CO2_PER_LITER_PB95;
    const trees = Math.ceil(co2_emission / CO2_ABSORBED_PER_TREE_DAILY);

    // Aktualizacja UI
    const currentCost = parseFloat($costValue.textContent) || 0;
    animateValue($costValue, currentCost, mainCost, 1200, ' zł', 2);
    
    const currentLiters = parseFloat($litersValue.textContent) || 0;
    animateValue($litersValue, currentLiters, mainLiters, 1400, ' l', 2);
    
    const currentCo2 = parseInt($co2Value.textContent) || 0;
    animateValue($co2Value, currentCo2, co2_emission, 1500, ' g', 0);

    $mainCostLabel.textContent = `Koszt podróży (${defaultFuel})`;

    const max_co2 = 2000;
    const progressPercent = Math.min((co2_emission / max_co2) * 100, 100);
    $progressBar.style.width = `${progressPercent}%`;

    $progressBar.className = 'progress-bar';
    if (co2_emission <= 200) {
        $progressBar.classList.add('progress-bar--green');
        $treeEstimate.style.color = 'var(--color-green)';
    } else if (co2_emission <= 500) {
        $progressBar.classList.add('progress-bar--yellow');
        $treeEstimate.style.color = 'var(--color-yellow)';
    } else {
        $progressBar.classList.add('progress-bar--red');
        $treeEstimate.style.color = 'var(--color-red)';
    }

    $treeEstimate.innerHTML = TREE_SVG + trees.toLocaleString() + ' drzew';
    
    $costPB95.textContent = costPB95.toFixed(2) + ' zł';
    $costON.textContent = costON.toFixed(2) + ' zł';
    $costLPG.textContent = costLPG.toFixed(2) + ' zł';
    
    $pricePerLiterPB95.textContent = getPrice('PB95').toFixed(2) + ' zł/l';
    $pricePerLiterON.textContent = getPrice('ON').toFixed(2) + ' zł/l';
    $pricePerLiterLPG.textContent = getPrice('LPG').toFixed(2) + ' zł/l';
}

// --- 4. OBSŁUGA MENU I USTAWIEŃ ---

/**
 * Ładuje niestandardowe ceny z customPrices do pól input w menu.
 */
function loadCustomPrices() {
    if (customPrices.PB95 > 0) {
        $customPricePB95.value = customPrices.PB95.toFixed(2);
    } else {
        $customPricePB95.value = '';
    }
    
    if (customPrices.ON > 0) {
        $customPriceON.value = customPrices.ON.toFixed(2);
    } else {
        $customPriceON.value = '';
    }
    
    if (customPrices.LPG > 0) {
        $customPriceLPG.value = customPrices.LPG.toFixed(2);
    } else {
        $customPriceLPG.value = '';
    }
}

/**
 * Zapisuje niestandardowe ceny do customPrices i localStorage, 
 * po czym ponownie liczy koszty.
 */
function saveCustomPrices() {
    const pb95Val = parseFloat($customPricePB95.value);
    const onVal = parseFloat($customPriceON.value);
    const lpgVal = parseFloat($customPriceLPG.value);

    customPrices.PB95 = (pb95Val > 0) ? pb95Val : 0;
    customPrices.ON = (onVal > 0) ? onVal : 0;
    customPrices.LPG = (lpgVal > 0) ? lpgVal : 0;

    localStorage.setItem(CUSTOM_PRICES_KEY, JSON.stringify(customPrices));
    calculate();
}

function toggleMenu() {
    const isOpen = $settingsMenu.classList.toggle('is-open');
    
    if (isOpen) {
        loadCustomPrices();
        
        const selectedRadio = document.getElementById(`radio${defaultFuel}`);
        if (selectedRadio) {
            selectedRadio.checked = true;
        }
    }
}

function handleFuelChange(event) {
    const newFuel = event.target.value;
    if (['PB95', 'ON', 'LPG'].includes(newFuel)) {
        defaultFuel = newFuel;
        localStorage.setItem(DEFAULT_FUEL_KEY, newFuel);
        calculate(); 
        toggleMenu(); 
    }
}

function handleCustomPriceInput() {
    // Odpal kalkulację i zapis po każdej zmianie w inputach cen
    saveCustomPrices();
}

function handleControlClick(event) {
    const btn = event.currentTarget;
    const targetId = btn.dataset.target;
    const action = btn.dataset.action;
    
    const targetInput = document.getElementById(targetId);
    if (!targetInput) return;

    let currentValue = parseFloat(targetInput.value);
    const step = parseFloat(targetInput.step) || 1;
    
    if (isNaN(currentValue)) currentValue = parseFloat(targetInput.min) || 0;

    let newValue;
    if (action === 'increment') {
        newValue = currentValue + step;
    } else {
        newValue = currentValue - step;
    }

    if (targetId === 'consumption') {
        newValue = parseFloat(newValue.toFixed(1));
    } else {
        newValue = Math.round(newValue);
    }

    const min = parseFloat(targetInput.min) || 0;
    if (newValue < min) newValue = min;

    targetInput.value = newValue;
    calculate();
}

/**
 * Zamyka menu po kliknięciu poza jego obszarem lub poza przyciskiem menu.
 */
function handleOutsideClick(event) {
    if (!$settingsMenu.classList.contains('is-open')) {
        return;
    }

    const clickedOnMenuButton = event.target.closest('#menuButton');
    if (clickedOnMenuButton) {
        return; 
    }

    const clickedInsideMenu = event.target.closest('.settings-content');
    
    if (!clickedInsideMenu) {
        toggleMenu();
    }
}

// --- 5. LOGIKA UDZIELANIA ---

/**
 * Generuje dane tekstowe do udostępnienia.
 */
function generateShareData() {
    const distance = $distance.value;
    const consumption = $consumption.value;
    const cost = $costValue.textContent;
    const liters = $litersValue.textContent;
    const co2 = $co2Value.textContent;
    const trees = $treeEstimate.textContent.replace(TREE_SVG, '').trim();
    const url = window.location.href;

    const text = `
Moja podróż na dystansie ${distance} km (spalanie ${consumption} l/100 km) kosztuje ${cost} (zużycie ${liters}). 
Emisja CO₂: ${co2} (~${trees}). 
Oblicz swoje koszty!
`;
    
    const shareUrl = `${url.split('?')[0]}?d=${distance}&c=${consumption}&f=${defaultFuel}`;

    return {
        title: 'Kalkulator Kosztów Podróży i CO₂',
        text: text,
        url: shareUrl
    };
}


/**
 * Obsługuje kliknięcie przycisku udostępniania.
 */
async function handleShareClick() {
    const data = generateShareData();
    $shareMessage.textContent = '';
    $shareMessage.classList.remove('show');

    if (navigator.share) {
        try {
            await navigator.share({
                title: data.title,
                text: data.text,
                url: data.url
            });
        } catch (error) {
            if (error.name !== 'AbortError') {
                $shareMessage.textContent = 'Błąd udostępniania.';
                $shareMessage.classList.add('show');
                setTimeout(() => $shareMessage.classList.remove('show'), 4000);
            }
        }
    } else {
        try {
            await navigator.clipboard.writeText(data.text + `\n${data.url}`);
            $shareMessage.textContent = '✅ Wynik skopiowany do schowka!';
            $shareMessage.classList.add('show');
            setTimeout(() => $shareMessage.classList.remove('show'), 4000);
        } catch (err) {
            $shareMessage.textContent = '⚠️ Błąd kopiowania. Zrób to ręcznie.';
            $shareMessage.classList.add('show');
            setTimeout(() => $shareMessage.classList.remove('show'), 4000);
        }
    }
}

// --- 6. NOWE FUNKCJE POBIERANIA DANYCH O CENACH PALIW ---

/**
 * Funkcja pomocnicza do parsowania HTML i wyciągania cen z różnych źródeł
 */
function parseHTMLPrices(html) {
    try {
        // Tworzymy tymczasowy element do parsowania HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Próba wyciągnięcia cen - różne możliwe struktury
        const prices = {
            PB95: null,
            ON: null,
            LPG: null
        };
        
        // Szukamy po klasach lub ID (dostosuj do rzeczywistej struktury strony)
        const priceElements = doc.querySelectorAll('.fuel-price, .price-value, [data-fuel-price]');
        
        priceElements.forEach(el => {
            const text = el.textContent.trim();
            const priceMatch = text.match(/(\d+[\.,]\d+)/);
            
            if (priceMatch) {
                const price = parseFloat(priceMatch[1].replace(',', '.'));
                
                // Identyfikacja rodzaju paliwa na podstawie kontekstu
                const context = el.textContent.toLowerCase();
                if (context.includes('95') || context.includes('pb95') || context.includes('benzyna')) {
                    prices.PB95 = price;
                } else if (context.includes('on') || context.includes('diesel') || context.includes('napędow')) {
                    prices.ON = price;
                } else if (context.includes('lpg') || context.includes('gaz')) {
                    prices.LPG = price;
                }
            }
        });
        
        return prices;
    } catch (error) {
        console.error('Błąd parsowania HTML:', error);
        return null;
    }
}

/**
 * Pobiera ceny z własnego backendu PHP (najlepsza opcja)
 */
async function fetchFromBackend() {
    try {
        const response = await fetch(FUEL_PRICE_SOURCES.BACKEND, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.prices) {
            return {
                PB95: data.prices.PB95,
                ON: data.prices.ON,
                LPG: data.prices.LPG,
                source: data.source || 'Backend API',
                date: data.update_date || data.timestamp
            };
        }
        
        return null;
        
    } catch (error) {
        console.error('Błąd pobierania z backendu:', error);
        return null;
    }
}

/**
 * Pobiera ceny z GlobalPetrolPrices.com (najprostsze i najbardziej niezawodne!)
 */
async function fetchFromGlobalPetrolPrices() {
    try {
        // Próbujemy różnych CORS proxy
        const proxies = [
            'https://corsproxy.io/?',
            'https://api.codetabs.com/v1/proxy?quest=',
            'https://api.allorigins.win/get?url='
        ];
        
        const url = 'https://www.globalpetrolprices.com/Poland/gasoline_prices/';
        
        let html = null;
        let usedProxy = '';
        
        // Próbuj każdy proxy
        for (const proxy of proxies) {
            try {
                console.log(`Próba GlobalPetrolPrices przez ${proxy}...`);
                
                const response = await fetch(proxy + encodeURIComponent(url), {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    html = data.contents || data;
                    usedProxy = proxy;
                    break;
                }
            } catch (e) {
                console.log(`Proxy ${proxy} failed, trying next...`);
                continue;
            }
        }
        
        if (!html) {
            throw new Error('All proxies failed');
        }
        
        console.log('GlobalPetrolPrices HTML length:', html.length);
        
        // Szukamy ceny w PLN
        const priceMatch = html.match(/(\d+\.\d+)\s*PLN/i) || 
                          html.match(/price[^<]*?(\d+\.\d+)/i);
        
        if (priceMatch) {
            const pb95Price = parseFloat(priceMatch[1]);
            
            // Walidacja
            if (pb95Price > 4 && pb95Price < 10) {
                // ON jest zwykle ~5% tańszy od PB95
                const onPrice = Math.round(pb95Price * 0.95 * 100) / 100;
                
                // LPG jest ~40% tańszy
                const lpgPrice = Math.round(pb95Price * 0.60 * 100) / 100;
                
                console.log('GlobalPetrolPrices SUCCESS:', { PB95: pb95Price, ON: onPrice, LPG: lpgPrice });
                
                return {
                    PB95: pb95Price,
                    ON: onPrice,
                    LPG: lpgPrice,
                    source: 'GlobalPetrolPrices.com',
                    date: new Date().toISOString().split('T')[0]
                };
            }
        }
        
        console.error('GlobalPetrolPrices: Nie znaleziono ceny');
        return null;
        
    } catch (error) {
        console.error('Błąd pobierania z GlobalPetrolPrices:', error);
        return null;
    }
}

/**
 * Próbuje pobrać ceny z AutoCentrum.pl poprzez CORS proxy
 */
async function fetchFromAutoCentrum() {
    try {
        const CORS_PROXY = 'https://api.allorigins.win/get?url=';
        const url = encodeURIComponent('https://www.autocentrum.pl/paliwa/ceny-paliw/');
        
        const response = await fetch(CORS_PROXY + url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const html = data.contents;
        
        console.log('AutoCentrum HTML length:', html.length);
        
        // Parsowanie - szukamy bloków z konkretnymi paliwami
        const prices = {};
        
        // Regex dla PB95 (benzyna 95)
        const pb95Match = html.match(/95[^0-9]*?(\d+[,\.]\d+)\s*z[łl]/i);
        if (pb95Match) {
            prices.PB95 = parseFloat(pb95Match[1].replace(',', '.'));
            console.log('AutoCentrum PB95:', prices.PB95);
        }
        
        // Regex dla ON (olej napędowy) - musi być osobno!
        // Szukamy "ON" ale NIE "ON+" 
        const onMatch = html.match(/\bON\b[^+]*?(\d+[,\.]\d+)\s*z[łl]/i);
        if (onMatch) {
            prices.ON = parseFloat(onMatch[1].replace(',', '.'));
            console.log('AutoCentrum ON:', prices.ON);
        }
        
        // Regex dla LPG
        const lpgMatch = html.match(/LPG[^0-9]*?(\d+[,\.]\d+)\s*z[łl]/i);
        if (lpgMatch) {
            prices.LPG = parseFloat(lpgMatch[1].replace(',', '.'));
            console.log('AutoCentrum LPG:', prices.LPG);
        }
        
        // Walidacja - czy mamy PB95 i ON, i czy są w rozsądnym zakresie
        if (prices.PB95 && prices.ON && 
            prices.PB95 > 4 && prices.PB95 < 10 && 
            prices.ON > 4 && prices.ON < 10 &&
            prices.PB95 !== prices.ON) {  // WAŻNE: PB95 i ON nie mogą być takie same!
            
            console.log('AutoCentrum SUCCESS:', prices);
            return {
                PB95: prices.PB95,
                ON: prices.ON,
                LPG: prices.LPG || 3.15,  // Fallback dla LPG
                source: 'AutoCentrum.pl',
                date: new Date().toISOString().split('T')[0]
            };
        }
        
        console.error('AutoCentrum: Ceny nieprawidłowe lub identyczne:', prices);
        return null;
        
    } catch (error) {
        console.error('Błąd pobierania z AutoCentrum:', error);
        return null;
    }
}

/**
 * Pobiera ceny z API Orlen (backup)
 */
async function fetchFromOrlen() {
    try {
        console.log('Próba pobrania z Orlen API...');
        
        // Bezpośrednie wywołanie (bez proxy - Orlen API ma CORS)
        const url = 'https://api.orlen.pl/api/fuelprices/wholesale';
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`Orlen otrzymano ${data.length} produktów`);
        
        const prices = {
            PB95: null,
            ON: null,
            LPG: 3.15,
            source: 'Orlen.pl (ceny hurtowe + marża)',
            date: null
        };
        
        // Marża hurt → detal (1.35 zamiast 1.4)
        const marginFactor = 1.35;
        const getRetailPrice = (priceM3) => Math.round((priceM3 / 1000) * marginFactor * 100) / 100;
        
        data.forEach(item => {
            if (item.productCode === 'B95') {
                prices.PB95 = getRetailPrice(item.price);
                prices.date = item.date;
                console.log(`Orlen PB95: ${prices.PB95} zł/l`);
            }
            if (item.productCode === 'ON') {
                prices.ON = getRetailPrice(item.price);
                console.log(`Orlen ON: ${prices.ON} zł/l`);
            }
        });
        
        if (prices.PB95 && prices.ON) {
            console.log('Orlen SUCCESS:', prices);
            return prices;
        }
        
        console.error('Orlen: Brak cen PB95 lub ON');
        return null;
        
    } catch (error) {
        console.error('Błąd pobierania z Orlen:', error);
        return null;
    }
}

/**
 * Główna funkcja pobierająca ceny paliw
 * Próbuje różnych źródeł w kolejności
 */
async function fetchFuelPrices() {
    $priceInfo.textContent = 'Ładowanie aktualnych cen paliw...';
    $priceInfo.className = 'price-source';

    let prices = null;
    let source = '';
    let updateDate = '';

    // Strategia 1: AutoCentrum.pl (SPRAWDZONE - działa!)
    console.log('Próba pobrania cen z AutoCentrum.pl...');
    prices = await fetchFromAutoCentrum();
    
    // Strategia 2: Orlen API (bezpośrednie - bez proxy)
    if (!prices || !prices.PB95 || !prices.ON || prices.PB95 === prices.ON) {
        console.log('AutoCentrum niedostępny lub błędne dane, próba Orlen API...');
        prices = await fetchFromOrlen();
    }
    
    // Strategia 3: GlobalPetrolPrices (z różnymi proxy)
    if (!prices || !prices.PB95 || !prices.ON) {
        console.log('Orlen niedostępny, próba GlobalPetrolPrices.com...');
        prices = await fetchFromGlobalPetrolPrices();
    }
    
    // Strategia 4: Netlify Function (jeśli istnieje)
    if (!prices || !prices.PB95 || !prices.ON) {
        console.log('GlobalPetrolPrices niedostępny, próba Netlify Function...');
        prices = await fetchFromBackend();
    }
    
    // Strategia 5: Jeśli wszystko zawiedzie, użyj wartości domyślnych
    if (!prices || !prices.PB95 || !prices.ON) {
        console.log('Wszystkie API zawiodły, używam cen domyślnych');
        fuelPrices = { ...DEFAULT_PRICES };
        
        $priceInfo.innerHTML = `
            <div>⚠️ <b>Brak połączenia z API.</b> Używam cen domyślnych.</div>
            <div style="font-size: 0.85em; margin-top: 5px; opacity: 0.8;">
                PB95: ${DEFAULT_PRICES.PB95} zł/l | ON: ${DEFAULT_PRICES.ON} zł/l | LPG: ${DEFAULT_PRICES.LPG} zł/l
            </div>
            <div style="font-size: 0.75em; margin-top: 3px; opacity: 0.6;">
                Możesz ustawić własne ceny w menu (ikona ☰)
            </div>
        `;
        $priceInfo.classList.add('price-source--error');
        
    } else {
        // Sukces - mamy ceny z API
        fuelPrices = {
            PB95: prices.PB95 || DEFAULT_PRICES.PB95,
            ON: prices.ON || DEFAULT_PRICES.ON,
            LPG: prices.LPG || DEFAULT_PRICES.LPG
        };
        
        source = prices.source || 'API';
        updateDate = prices.date ? new Date(prices.date).toLocaleDateString('pl-PL') : 'dziś';
        
        $priceInfo.innerHTML = `
            <div>✅ <b>Ceny aktualne</b> (${updateDate})</div>
            <div style="font-size: 0.85em; margin-top: 5px; opacity: 0.8;">
                Źródło: ${source} | PB95: ${fuelPrices.PB95} zł | ON: ${fuelPrices.ON} zł | LPG: ${fuelPrices.LPG} zł
            </div>
            <div style="font-size: 0.75em; margin-top: 3px; opacity: 0.6;">
                Współczynniki: ON ×${CONSUMPTION_FACTORS.ON}, LPG ×${CONSUMPTION_FACTORS.LPG}
            </div>
        `;
        $priceInfo.classList.add('price-source--success');
    }
    
    calculate();
}

// --- 7. INICJALIZACJA APLIKACJI ---

/**
 * Ładuje parametry z URL (dla udostępniania)
 */
function loadFromURL() {
    const params = new URLSearchParams(window.location.search);
    
    const distance = params.get('d');
    const consumption = params.get('c');
    const fuel = params.get('f');
    
    if (distance && !isNaN(distance)) {
        $distance.value = distance;
    }
    
    if (consumption && !isNaN(consumption)) {
        $consumption.value = consumption;
    }
    
    if (fuel && ['PB95', 'ON', 'LPG'].includes(fuel)) {
        defaultFuel = fuel;
        localStorage.setItem(DEFAULT_FUEL_KEY, fuel);
    }
}

/**
 * Inicjalizacja aplikacji.
 */
function init() {
    // Wczytaj parametry z URL (jeśli ktoś otwiera link udostępniony)
    loadFromURL();
    
    // Pobierz aktualne ceny paliw
    fetchFuelPrices();

    const inputs = [$distance, $consumption];
    inputs.forEach(input => {
        input.addEventListener('input', calculate);
    });

    $menuButton.addEventListener('click', toggleMenu);
    $closeMenuButton.addEventListener('click', toggleMenu);
    
    document.addEventListener('click', handleOutsideClick); 
    
    $radioButtons.forEach(radio => {
        radio.addEventListener('change', handleFuelChange);
    });
    
    $customPricePB95.addEventListener('input', handleCustomPriceInput);
    $customPriceON.addEventListener('input', handleCustomPriceInput);
    $customPriceLPG.addEventListener('input', handleCustomPriceInput);

    const initialRadio = document.getElementById(`radio${defaultFuel}`);
    if (initialRadio) {
        initialRadio.checked = true;
    }
    
    $controlButtons.forEach(button => {
        button.addEventListener('click', handleControlClick);
    });

    $shareButton.addEventListener('click', handleShareClick);
    
    // Odśwież ceny co 30 minut
    setInterval(fetchFuelPrices, 30 * 60 * 1000);
}

// Uruchomienie aplikacji
init();
