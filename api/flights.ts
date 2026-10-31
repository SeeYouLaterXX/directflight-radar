import type { VercelRequest, VercelResponse } from '@vercel/node';

// Bekannte zivile Verkehrsflughäfen mit regulärem Linienverkehr bevorzugen
const COMMERCIAL_AIRPORTS = new Set([
  'DUS', 'CGN', 'DTM', 'EIN', 'AMS', 'FRA', 'HAJ', 'BRE', 'FMO', 'NRN', 'PAD', 'HAM',
  'BER', 'MUC', 'STR', 'NUE', 'LEJ', 'BRU', 'CRL', 'LUX', 'VIE', 'ZRH', 'BSL'
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  // Verhindert das 304 Caching, damit immer frisch gesucht wird
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { departure_id, arrival_id, outbound_date, return_date } = req.query;

  if (!departure_id || !arrival_id || !outbound_date) {
    return res.status(400).json({ error: 'Fehlende Parameter' });
  }

  const apiKey = '838ee18c08f3940eed99c67d6521b6e28b5986ca30c3ba7823e1841883852cd3';
  const allAirports = String(departure_id).split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

  // Zivile Linienflughäfen zuerst anordnen, Kleinflugplätze nach hinten
  const sortedAirports = [...allAirports].sort((a, b) => {
    const aIsCom = COMMERCIAL_AIRPORTS.has(a) ? 1 : 0;
    const bIsCom = COMMERCIAL_AIRPORTS.has(b) ? 1 : 0;
    return bIsCom - aIsCom;
  });

  // Die 4 relevantesten Flughäfen abfragen
  const targetAirports = sortedAirports.slice(0, 4);

  try {
    const requests = targetAirports.map(async (origin) => {
      const params = new URLSearchParams({
        engine: 'google_flights',
        departure_id: origin,
        arrival_id: String(arrival_id),
        outbound_date: String(outbound_date),
        stops: '1',
        currency: 'EUR',
        hl: 'de',
        api_key: apiKey
      });

      if (return_date) {
        params.append('return_date', String(return_date));
      }

      const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
      if (!response.ok) return null;
      return response.json();
    });

    const results = await Promise.all(requests);
    const validResults = results.filter(Boolean);

    let combinedBest: any[] = [];
    let combinedOther: any[] = [];

    validResults.forEach(data => {
      if (data?.best_flights) combinedBest.push(...data.best_flights);
      if (data?.other_flights) combinedOther.push(...data.other_flights);
    });

    return res.status(200).json({
      queried_airports: targetAirports,
      best_flights: combinedBest,
      other_flights: combinedOther
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Serverfehler beim Abruf' });
  }
}