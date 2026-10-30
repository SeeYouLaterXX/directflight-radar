import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS-Header für Vercel erlauben
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { departure_id, arrival_id, outbound_date, return_date } = req.query;

  if (!departure_id || !arrival_id || !outbound_date) {
    return res.status(400).json({ error: 'Fehlende Parameter' });
  }

  const apiKey = '838ee18c08f3940eed99c67d6521b6e28b5986ca30c3ba7823e1841883852cd3';

  try {
    const params = new URLSearchParams({
      engine: 'google_flights',
      departure_id: String(departure_id),
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

    const serpUrl = `https://serpapi.com/search.json?${params.toString()}`;
    const response = await fetch(serpUrl);

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Serverfehler beim Abruf' });
  }
}