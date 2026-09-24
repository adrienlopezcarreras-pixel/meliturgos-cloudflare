function bounded(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function httpError(code, status = 502) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function weatherLabel(code) {
  const value = Number(code);
  if (value === 0) return 'ciel dégagé';
  if ([1, 2].includes(value)) return 'éclaircies';
  if (value === 3) return 'couvert';
  if ([45, 48].includes(value)) return 'brouillard';
  if ([51, 53, 55, 56, 57].includes(value)) return 'bruine';
  if ([61, 63, 65, 66, 67].includes(value)) return 'pluie';
  if ([71, 73, 75, 77].includes(value)) return 'neige';
  if ([80, 81, 82].includes(value)) return 'averses';
  if ([85, 86].includes(value)) return 'averses de neige';
  if ([95, 96, 99].includes(value)) return 'orage';
  return 'conditions variables';
}

async function fetchJson(fetchImpl, url) {
  const response = await fetchImpl(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'MELITURGOS/1.0 weather-capability',
    },
  });
  if (!response?.ok) throw httpError('WEATHER_HTTP_' + Number(response?.status || 502), Number(response?.status || 502));
  return response.json();
}

async function geocode(fetchImpl, location) {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', location);
  url.searchParams.set('count', '1');
  url.searchParams.set('language', 'fr');
  url.searchParams.set('format', 'json');
  const data = await fetchJson(fetchImpl, url);
  const row = Array.isArray(data?.results) ? data.results[0] : null;
  if (!row) return null;
  return {
    name: bounded(row.name, 120),
    admin1: bounded(row.admin1, 120),
    country: bounded(row.country, 120),
    latitude: finiteNumber(row.latitude),
    longitude: finiteNumber(row.longitude),
    timezone: bounded(row.timezone, 80),
  };
}

function geoFromContext(context = {}) {
  const geo = context.geo || {};
  const latitude = finiteNumber(geo.latitude);
  const longitude = finiteNumber(geo.longitude);
  if (latitude !== null && longitude !== null) {
    return {
      name: bounded(geo.city, 120) || 'position actuelle',
      admin1: bounded(geo.region, 120),
      country: bounded(geo.country, 120),
      latitude,
      longitude,
      timezone: bounded(geo.timezone, 80),
    };
  }
  return null;
}

async function resolvePlace(fetchImpl, input, context) {
  const location = bounded(input?.location, 180);
  if (location) return geocode(fetchImpl, location);
  const contextual = geoFromContext(context);
  if (contextual) return contextual;
  const city = bounded(context?.geo?.city, 120);
  if (city) return geocode(fetchImpl, city);
  return null;
}

export function registerWeatherCapability(bus, env = {}) {
  bus.discover({
    id: 'weather.current',
    name: 'Météo actuelle et prévision courte',
    category: 'information',
    version: '1.0.0',
    provider: 'open-meteo',
    description: 'Retrieves current weather and a short forecast from Open-Meteo using an explicit place or approximate request geolocation.',
    input_schema: {
      type: 'object',
      properties: {
        location: { type: 'string', minLength: 2, maxLength: 180 },
      },
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: 'HEALTHY',
    enabled: true,
  }, async (input, context = {}) => {
    const fetchImpl = env.MEL_WEATHER_FETCH || env.MEL_WEB_FETCH || globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw httpError('WEATHER_FETCH_UNAVAILABLE', 503);

    const place = await resolvePlace(fetchImpl, input, context);
    if (!place || place.latitude === null || place.longitude === null) {
      return {
        ok: false,
        needs_location: true,
        message: 'Ville nécessaire pour la météo.',
        provider: 'Open-Meteo',
      };
    }

    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(place.latitude));
    url.searchParams.set('longitude', String(place.longitude));
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', '2');
    url.searchParams.set('current', [
      'temperature_2m',
      'apparent_temperature',
      'precipitation',
      'weather_code',
      'wind_speed_10m',
    ].join(','));
    url.searchParams.set('daily', [
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_probability_max',
      'weather_code',
    ].join(','));

    const data = await fetchJson(fetchImpl, url);
    const current = data?.current || {};
    const daily = data?.daily || {};
    const tomorrowIndex = Array.isArray(daily.time) && daily.time.length > 1 ? 1 : 0;

    return {
      ok: true,
      provider: 'Open-Meteo',
      source: 'https://open-meteo.com/',
      fetched_at: new Date().toISOString(),
      location: {
        name: place.name || 'position actuelle',
        admin1: place.admin1 || '',
        country: place.country || '',
        latitude: place.latitude,
        longitude: place.longitude,
        timezone: data?.timezone || place.timezone || '',
      },
      current: {
        temperature_c: finiteNumber(current.temperature_2m),
        apparent_temperature_c: finiteNumber(current.apparent_temperature),
        precipitation_mm: finiteNumber(current.precipitation),
        wind_kmh: finiteNumber(current.wind_speed_10m),
        weather_code: finiteNumber(current.weather_code),
        condition: weatherLabel(current.weather_code),
        time: bounded(current.time, 80),
      },
      today: {
        date: bounded(daily.time?.[0], 40),
        min_c: finiteNumber(daily.temperature_2m_min?.[0]),
        max_c: finiteNumber(daily.temperature_2m_max?.[0]),
        precipitation_probability_percent: finiteNumber(daily.precipitation_probability_max?.[0]),
        condition: weatherLabel(daily.weather_code?.[0]),
      },
      tomorrow: {
        date: bounded(daily.time?.[tomorrowIndex], 40),
        min_c: finiteNumber(daily.temperature_2m_min?.[tomorrowIndex]),
        max_c: finiteNumber(daily.temperature_2m_max?.[tomorrowIndex]),
        precipitation_probability_percent: finiteNumber(daily.precipitation_probability_max?.[tomorrowIndex]),
        condition: weatherLabel(daily.weather_code?.[tomorrowIndex]),
      },
    };
  });
}
