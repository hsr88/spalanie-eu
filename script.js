// --- 1. STAŁE I ZMIENNE GLOBALNE ---

// Domyślne ceny paliw (fallback) w zł/l
// AKTUALIZACJA: marzec 2026 (źródło: autocentrum.pl)
const DEFAULT_PRICES = {
    PB95: 6.06,  // Aktualna średnia krajowa
    ON: 6.57,    // Aktualna średnia krajowa
    LPG: 2.91    // Aktualna średnia krajowa
};

// Współczynniki konwersji spalania w stosunku do PB95
const CONSUMPTION_FACTORS = {
    PB95: 1.0,
    ON: 0.9,
    LPG: 1.2
};


// Aktualne ceny paliw (zostaną zaktualizowane przez API/Custom)
let fuelPrices = { ...DEFAULT_PRICES };

// Cache cen paliw w localStorage
const FUEL_PRICES_CACHE_KEY = 'fuelPricesCache';
const FUEL_PRICES_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h w ms

// URL do backendu pobierającego ceny paliw
const FUEL_PRICES_API = '/.netlify/functions/fuel-prices';

// Stałe obliczeniowe
const CO2_PER_LITER_PB95 = 2340; // g CO₂/l dla benzyny
const CO2_ABSORBED_PER_TREE_DAILY = 55; // g CO₂/dzień
const MARGIN_FACTOR = 1.4; // 1.4 do przeliczenia hurt → detal

// Domyślne paliwo - ładowanie z localStorage lub ustawienie PB95
const DEFAULT_FUEL_KEY = 'defaultFuelPreference';
let defaultFuel = localStorage.getItem(DEFAULT_FUEL_KEY) || 'PB95';

// Ustaw domyślne paliwo w radio buttonach przy starcie
document.querySelectorAll('input[name="mainFuel"]').forEach(radio => {
    radio.checked = (radio.value === defaultFuel);
});

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

// Elementy dla sekcji aktualnych cen
const $currentPricePB95 = document.getElementById('currentPricePB95');
const $currentPriceON = document.getElementById('currentPriceON');
const $currentPriceLPG = document.getElementById('currentPriceLPG');
const $priceSource = document.getElementById('priceSource');
const $priceUpdateDate = document.getElementById('priceUpdateDate');

// Mobile menu
const $mobileMenuBtn = document.querySelector('.mobile-menu-btn');
const $mainNav = document.querySelector('.main-nav');


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
        $treeEstimate.innerHTML = '<span style="font-size: 1.5rem;">' + TREE_EMOJI + '</span> 0 drzew';
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

    $treeEstimate.innerHTML = '<span style="font-size: 1.5rem;">' + TREE_EMOJI + '</span> ' + trees.toLocaleString() + ' drzew';

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
    const trees = $treeEstimate.textContent.replace(TREE_EMOJI, '').trim();
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

        // DEBUG: Pokaż fragment HTML z cenami
        const priceSection = html.match(/95[\s\S]{0,200}zł/);
        if (priceSection) {
            console.log('DEBUG - Fragment HTML z cenami:', priceSection[0]);
        }

        // Parsowanie - szukamy bloków z konkretnymi paliwami
        const prices = {};

        // ROZSZERZONE WZORCE - próbujemy różnych formatów

        // PB95 - różne możliwe formaty
        const pb95Patterns = [
            /95[^\d]*?(\d+[,\.]\d+)\s*zł/i,
            /pb.*?95[^\d]*?(\d+[,\.]\d+)\s*zł/i,
            /benzyna.*?95[^\d]*?(\d+[,\.]\d+)\s*zł/i,
            />\s*95\s*<[\s\S]{0,100}?(\d+[,\.]\d+)\s*zł/i
        ];

        for (const pattern of pb95Patterns) {
            const match = html.match(pattern);
            if (match) {
                prices.PB95 = parseFloat(match[1].replace(',', '.'));
                console.log('AutoCentrum PB95 found with pattern:', pattern, '=> ', prices.PB95);
                break;
            }
        }

        // ON - różne możliwe formaty
        const onPatterns = [
            /\bON\b[^+\d]*?(\d+[,\.]\d+)\s*zł/i,
            /olej.*?napędow[^\d]*?(\d+[,\.]\d+)\s*zł/i,
            /diesel[^\d]*?(\d+[,\.]\d+)\s*zł/i,
            />\s*ON\s*<[\s\S]{0,100}?(\d+[,\.]\d+)\s*zł/i
        ];

        for (const pattern of onPatterns) {
            const match = html.match(pattern);
            if (match) {
                prices.ON = parseFloat(match[1].replace(',', '.'));
                console.log('AutoCentrum ON found with pattern:', pattern, '=> ', prices.ON);
                break;
            }
        }

        // LPG - różne możliwe formaty
        const lpgPatterns = [
            /LPG[^\d]*?(\d+[,\.]\d+)\s*zł/i,
            /gaz[^\d]*?(\d+[,\.]\d+)\s*zł/i,
            />\s*LPG\s*<[\s\S]{0,100}?(\d+[,\.]\d+)\s*zł/i
        ];

        for (const pattern of lpgPatterns) {
            const match = html.match(pattern);
            if (match) {
                prices.LPG = parseFloat(match[1].replace(',', '.'));
                console.log('AutoCentrum LPG found with pattern:', pattern, '=> ', prices.LPG);
                break;
            }
        }

        console.log('AutoCentrum znalezione ceny:', prices);

        // Walidacja - czy mamy PB95 i ON, i czy są w rozsądnym zakresie
        if (prices.PB95 && prices.ON &&
            prices.PB95 > 4 && prices.PB95 < 10 &&
            prices.ON > 4 && prices.ON < 10 &&
            prices.PB95 !== prices.ON) {

            console.log('AutoCentrum SUCCESS:', prices);
            return {
                PB95: prices.PB95,
                ON: prices.ON,
                LPG: prices.LPG || 3.15,
                source: 'AutoCentrum.pl',
                date: new Date().toISOString().split('T')[0]
            };
        }

        console.error('AutoCentrum: Ceny nieprawidłowe lub identyczne:', prices);

        // DEBUG: Jeśli nie znalazło, pokaż WSZYSTKIE wystąpienia "zł"
        const allPrices = html.match(/(\d+[,\.]\d+)\s*zł/g);
        if (allPrices) {
            console.log('DEBUG - Wszystkie znalezione ceny w HTML:', allPrices.slice(0, 10));
        }

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
 * Ładuje ceny z cache (localStorage)
 */
function loadPricesFromCache() {
    try {
        const cached = localStorage.getItem(FUEL_PRICES_CACHE_KEY);
        if (cached) {
            const data = JSON.parse(cached);
            const age = Date.now() - data.timestamp;

            // Cache ważny przez 24h
            if (age < FUEL_PRICES_CACHE_TTL && data.prices) {
                console.log('Ceny załadowane z cache:', data.prices);
                return {
                    prices: data.prices,
                    source: data.source,
                    date: data.date,
                    fromCache: true
                };
            }
        }
    } catch (e) {
        console.error('Błąd ładowania cache:', e);
    }
    return null;
}

/**
 * Zapisuje ceny do cache (localStorage)
 */
function savePricesToCache(prices, source, date) {
    try {
        localStorage.setItem(FUEL_PRICES_CACHE_KEY, JSON.stringify({
            prices: prices,
            source: source,
            date: date,
            timestamp: Date.now()
        }));
    } catch (e) {
        console.error('Błąd zapisywania cache:', e);
    }
}

/**
 * Główna funkcja pobierająca ceny paliw
 * Pokazuje ceny NATYCHMIAST, fetch w tle nie blokuje UI
 */
async function fetchFuelPrices() {
    // KROK 1: Pokaż ceny od razu (z cache lub domyślne) - BEZ "ładowania"
    const cached = loadPricesFromCache();

    if (cached) {
        // Mamy cache - pokaż od razu
        fuelPrices = cached.prices;
        $priceInfo.innerHTML = `
            <div>✅ <b>Ceny z cache</b> (${new Date(cached.date).toLocaleDateString('pl-PL')})</div>
            <div style="font-size: 0.85em; margin-top: 5px; opacity: 0.8;">
                PB95: ${fuelPrices.PB95} zł | ON: ${fuelPrices.ON} zł | LPG: ${fuelPrices.LPG} zł
            </div>
        `;
        $priceInfo.classList.add('price-source--success');
    } else {
        // Brak cache - użyj domyślnych od razu, BEZ komunikatu "ładowanie"
        fuelPrices = { ...DEFAULT_PRICES };
        $priceInfo.innerHTML = `
            <div>📊 <b>Ceny domyślne</b></div>
            <div style="font-size: 0.85em; margin-top: 5px; opacity: 0.8;">
                PB95: ${fuelPrices.PB95} zł | ON: ${fuelPrices.ON} zł | LPG: ${fuelPrices.LPG} zł
            </div>
            <div style="font-size: 0.75em; margin-top: 3px; opacity: 0.6;">
                🔄 Aktualizuję w tle...
            </div>
        `;
        $priceInfo.classList.add('price-source--success');
    }

    // Przelicz od razu z dostępnymi cenami
    updatePriceSection();
    calculate();

    // KROK 2: W tle pobierz nowe ceny (nie blokuj UI!)
    fetchPricesInBackground();
}

/**
 * Pobiera ceny w tle - nie blokuje UI
 */
async function fetchPricesInBackground() {
    try {
        const response = await fetch(FUEL_PRICES_API, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000) // 5s timeout
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();

        if (data.success && data.prices) {
            // Nowe ceny pobrane!
            fuelPrices = {
                PB95: data.prices.PB95 || DEFAULT_PRICES.PB95,
                ON: data.prices.ON || DEFAULT_PRICES.ON,
                LPG: data.prices.LPG || DEFAULT_PRICES.LPG
            };

            // Zapisz do cache
            savePricesToCache(fuelPrices, data.source, data.update_date);

            const source = data.source || 'API';
            const updateDate = data.update_date
                ? new Date(data.update_date).toLocaleDateString('pl-PL')
                : 'dziś';

            $priceInfo.innerHTML = `
                <div>✅ <b>Ceny aktualne</b> (${updateDate})</div>
                <div style="font-size: 0.85em; margin-top: 5px; opacity: 0.8;">
                    Źródło: ${source} | PB95: ${fuelPrices.PB95} zł | ON: ${fuelPrices.ON} zł | LPG: ${fuelPrices.LPG} zł
                </div>
                <div style="font-size: 0.75em; margin-top: 3px; opacity: 0.6;">
                    Współczynniki: ON ×${CONSUMPTION_FACTORS.ON}, LPG ×${CONSUMPTION_FACTORS.LPG}
                </div>
            `;

            console.log('Ceny zaktualizowane:', fuelPrices, 'Źródło:', source);

            // Przelicz z nowymi cenami
            updatePriceSection();
            calculate();
        } else {
            // Awaryjne rozwiązanie (backend zwrócił success: false)
            throw new Error(data.message || 'API zgłosiło brak danych');
        }
    } catch (error) {
        console.log('Aktualizacja cen w tle nieudana:', error.message);
        // Usuń informację o "aktualizowaniu w tle"
        const existingDefaultInfo = $priceInfo.innerHTML;
        if (existingDefaultInfo.includes('Aktualizuję w tle...')) {
            $priceInfo.innerHTML = `
                <div>⚠️ <b>Ceny awaryjne/domyślne</b></div>
                <div style="font-size: 0.85em; margin-top: 5px; opacity: 0.8;">
                    PB95: ${fuelPrices.PB95} zł | ON: ${fuelPrices.ON} zł | LPG: ${fuelPrices.LPG} zł
                </div>
                <div style="font-size: 0.75em; margin-top: 3px; color: var(--color-red); opacity: 0.8;">
                    Niedostępne dane z API. Powrót do taryfy domyślnej.
                </div>
            `;
            $priceInfo.classList.remove('price-source--success');
            $priceInfo.classList.add('price-source--default');
        }
    }
}

/**
 * Aktualizuje sekcję aktualnych cen na stronie
 */
function updatePriceSection() {
    if ($currentPricePB95) {
        $currentPricePB95.textContent = fuelPrices.PB95.toFixed(2);
    }
    if ($currentPriceON) {
        $currentPriceON.textContent = fuelPrices.ON.toFixed(2);
    }
    if ($currentPriceLPG) {
        $currentPriceLPG.textContent = fuelPrices.LPG.toFixed(2);
    }
    if ($priceSource) {
        $priceSource.textContent = document.getElementById('priceInfo')?.textContent?.includes('AutoCentrum') ? 'AutoCentrum.pl' :
            document.getElementById('priceInfo')?.textContent?.includes('Orlen') ? 'Orlen.pl' :
                document.getElementById('priceInfo')?.textContent?.includes('Global') ? 'GlobalPetrolPrices.com' : 'API';
    }
    if ($priceUpdateDate) {
        $priceUpdateDate.textContent = new Date().toLocaleDateString('pl-PL');
    }
}

/**
 * Resetuje ceny niestandardowe do wartości domyślnych
 */
function resetCustomPrices() {
    customPrices = {};
    localStorage.removeItem(CUSTOM_PRICES_KEY);

    if ($customPricePB95) $customPricePB95.value = '';
    if ($customPriceON) $customPriceON.value = '';
    if ($customPriceLPG) $customPriceLPG.value = '';

    calculate();

    // Pokaż powiadomienie
    if ($shareMessage) {
        $shareMessage.textContent = '✅ Przywrócono domyślne ceny';
        $shareMessage.classList.add('show');
        setTimeout(() => $shareMessage.classList.remove('show'), 3000);
    }
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
    } else {
        // Domyślny dystans 100 km
        $distance.value = '100';
    }

    if (consumption && !isNaN(consumption)) {
        $consumption.value = consumption;
    } else {
        // Domyślne spalanie 7.5 l/100km
        $consumption.value = '7.5';
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

    // Event listenery dla inputów (input + change dla pewności)
    const inputs = [$distance, $consumption];
    inputs.forEach(input => {
        input.addEventListener('input', calculate);
        input.addEventListener('change', calculate);
        input.addEventListener('keyup', calculate);
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

    // Mobile menu toggle
    if ($mobileMenuBtn) {
        $mobileMenuBtn.addEventListener('click', () => {
            document.querySelector('.nav-links')?.classList.toggle('mobile-open');
        });
    }

    // Główny wybór paliwa (w kalkulatorze)
    const mainFuelRadios = document.querySelectorAll('input[name="mainFuel"]');
    mainFuelRadios.forEach(radio => {
        radio.addEventListener('change', function () {
            if (this.checked) {
                defaultFuel = this.value;
                localStorage.setItem(DEFAULT_FUEL_KEY, defaultFuel);
                calculate();
            }
        });
    });

    // Smooth scroll dla linków kotwiczących
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();

            // Ukryj menu mobilne po kliknięciu
            const navLinks = document.querySelector('.nav-links');
            if (navLinks && navLinks.classList.contains('mobile-open')) {
                navLinks.classList.remove('mobile-open');
            }

            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Inicjalizacja sekcji cen
    updatePriceSection();

    // Przelicz od razu (z domyślnymi wartościami)
    calculate();

    // Odśwież ceny co 30 minut
    setInterval(fetchFuelPrices, 30 * 60 * 1000);
}

// Uruchomienie aplikacji
init();
