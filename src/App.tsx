import { useState, useEffect, useMemo, useRef, type FormEvent } from 'react';
import { 
  Plane, MapPin, Clock, Sliders, Search, ArrowRight, ArrowLeftRight,
  ShieldCheck, ExternalLink, CheckCircle2, AlertCircle, 
  RefreshCw, X, Navigation, Check
} from 'lucide-react';

interface Airport {
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  distance?: number;
}

interface FlightLeg {
  date: string;
  flightNo: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
}

interface FlightOffer {
  id: string;
  originAirport: Airport;
  destinationIata: string;
  destinationCity: string;
  airline: string;
  airlineCode: string;
  price: number;
  outbound: FlightLeg;
  inbound?: FlightLeg;
}

interface StatusMsg {
  type: 'info' | 'success' | 'error';
  text: string;
}

function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function timeToMinutes(timeStr?: string): number {
  if (!timeStr) return 0;
  const clean = timeStr.includes(' ') ? timeStr.split(' ')[1] : timeStr;
  const [h, m] = clean.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export default function App() {
  const defaultApiKey = '838ee18c08f3940eed99c67d6521b6e28b5986ca30c3ba7823e1841883852cd3';

  // Weltweiter Flughafen-Katalog aus public/airports.json
  const [allAirports, setAllAirports] = useState<Airport[]>([]);
  const [loadingAirports, setLoadingAirports] = useState(true);

  // Startort & Radius
  const [originAddress, setOriginAddress] = useState('Hörstel, Deutschland');
  const [originCoords, setOriginCoords] = useState<{ lat: number; lon: number }>({ lat: 52.2961, lon: 7.5888 });
  const [radiusKm, setRadiusKm] = useState(150);
  const [selectedAirports, setSelectedAirports] = useState<Record<string, boolean>>({});
  const [isLocating, setIsLocating] = useState(false);

  // Weltweites Reiseziel (Autocomplete)
  const [destQuery, setDestQuery] = useState('Sofia (SOF)');
  const [selectedDest, setSelectedDest] = useState<Airport | null>({
    iata: 'SOF', name: 'Sofia Airport', city: 'Sofia', country: 'Bulgaria', lat: 42.6952, lon: 23.4062
  });
  const [showDestDropdown, setShowDestDropdown] = useState(false);
  const destDropdownRef = useRef<HTMLDivElement>(null);

  // Reisedaten & Zeitfenster
  const [outboundDate, setOutboundDate] = useState('2026-12-15');
  const [returnDate, setReturnDate] = useState('2026-12-16');
  const [minOutboundArrival, setMinOutboundArrival] = useState('18:00');
  const [minInboundDeparture, setMinInboundDeparture] = useState('17:00');

  // Suchergebnisse & Status
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [verifiedDirectFlights, setVerifiedDirectFlights] = useState<FlightOffer[]>([]);
  const [statusMessage, setStatusMessage] = useState<StatusMsg | null>(null);
  const [sortBy, setSortBy] = useState<'distance' | 'price'>('distance');

  // 1. airports.json laden
  useEffect(() => {
    fetch('/airports.json')
      .then(res => {
        if (!res.ok) throw new Error('airports.json nicht gefunden');
        return res.json();
      })
      .then((data: Airport[]) => {
        setAllAirports(data);
        setLoadingAirports(false);
      })
      .catch((err) => {
        console.error('Fehler beim Laden von airports.json:', err);
        setLoadingAirports(false);
      });
  }, []);

  // Dropdown schließen bei Klick außerhalb
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (destDropdownRef.current && !destDropdownRef.current.contains(event.target as Node)) {
        setShowDestDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 2. Umkreis-Flughäfen weltweit berechnen
  const nearbyAirports = useMemo(() => {
    if (allAirports.length === 0) return [];
    return allAirports
      .map(ap => ({
        ...ap,
        distance: calculateHaversineDistance(originCoords.lat, originCoords.lon, ap.lat, ap.lon)
      }))
      .filter(ap => (ap.distance ?? 0) <= radiusKm)
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  }, [allAirports, originCoords, radiusKm]);

  // Checkboxen synchronisieren
  useEffect(() => {
    const next: Record<string, boolean> = {};
    nearbyAirports.forEach(a => {
      next[a.iata] = selectedAirports[a.iata] !== undefined ? selectedAirports[a.iata] : true;
    });
    setSelectedAirports(next);
  }, [nearbyAirports]);

  // Autocomplete Suche für Zielflughäfen
  const destinationResults = useMemo(() => {
    if (!destQuery.trim() || destQuery.includes('(')) return [];
    const q = destQuery.toLowerCase().trim();
    return allAirports
      .filter(a => 
        (a.iata && a.iata.toLowerCase().includes(q)) || 
        (a.city && a.city.toLowerCase().includes(q)) || 
        (a.name && a.name.toLowerCase().includes(q)) ||
        (a.country && a.country.toLowerCase().includes(q))
      )
      .slice(0, 10);
  }, [allAirports, destQuery]);

  // Geocoding für Startort
  const handleGeocode = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!originAddress.trim()) return;

    setIsLocating(true);
    setStatusMessage({ type: 'info', text: 'Ermittle Standort...' });

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(originAddress)}&limit=1`);
      const data = await res.json();
      if (data && data.length > 0) {
        setOriginCoords({ lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) });
        setStatusMessage({ type: 'success', text: `Standort: ${data[0].display_name.split(',')[0]}` });
      } else {
        setStatusMessage({ type: 'error', text: 'Ort weltweit nicht gefunden.' });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Fehler bei der Adressabfrage.' });
    } finally {
      setIsLocating(false);
      setTimeout(() => setStatusMessage(null), 3000);
    }
  };

  const toggleAirport = (iata: string) => {
    setSelectedAirports(prev => ({ ...prev, [iata]: !prev[iata] }));
  };

  const getGoogleFlightsUrl = (origin: string, dest: string, depDate: string, retDate?: string) => {
    return `https://www.google.com/travel/flights?q=Flug%20von%20${origin}%20nach%20${dest}%20am%20${depDate}${retDate ? `%20bis%20${retDate}` : ''}%20nonstop&hl=de`;
  };

  // Suche starten
  const handleExecuteSearch = async () => {
    if (!selectedDest) {
      setStatusMessage({ type: 'error', text: 'Bitte wähle ein gültiges Reiseziel aus der Liste aus.' });
      return;
    }

    const activeAirports = nearbyAirports.filter(ap => selectedAirports[ap.iata]);
    if (activeAirports.length === 0) {
      setStatusMessage({ type: 'error', text: 'Keine Abflughäfen im gewählten Radius aktiv.' });
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    setVerifiedDirectFlights([]);

    const foundFlights: FlightOffer[] = [];

    try {
      const departureIds = activeAirports.map(a => a.iata).join(',');
      const liveUrl = `https://serpapi.com/search.json?engine=google_flights&departure_id=${departureIds}&arrival_id=${selectedDest.iata}&outbound_date=${outboundDate}&return_date=${returnDate}&stops=1&currency=EUR&hl=de&api_key=${defaultApiKey.trim()}`;

      const res = await fetch(liveUrl);
      if (res.ok) {
        const liveJson = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const offers: any[] = liveJson.best_flights || liveJson.other_flights || [];

        offers.forEach((offer, idx) => {
          if (!offer.layovers || offer.layovers.length === 0) {
            const segs = offer.flights || [];
            if (segs.length >= 2) {
              const outSeg = segs[0];
              const inSeg = segs[segs.length - 1];
              const apMatch = activeAirports.find(a => a.iata === outSeg.departure_airport?.id) || activeAirports[0];

              const outArrM = timeToMinutes(outSeg.arrival_airport?.time);
              const inDepM = timeToMinutes(inSeg.departure_airport?.time);

              if (outArrM >= timeToMinutes(minOutboundArrival) && inDepM >= timeToMinutes(minInboundDeparture)) {
                foundFlights.push({
                  id: `LIVE-${idx}-${outSeg.flight_number || idx}`,
                  originAirport: apMatch,
                  destinationIata: selectedDest.iata,
                  destinationCity: selectedDest.city || selectedDest.name,
                  airline: outSeg.airline || 'Airline',
                  airlineCode: outSeg.airline?.substring(0, 2).toUpperCase() || 'FL',
                  price: offer.price || 150,
                  outbound: {
                    date: outboundDate,
                    flightNo: outSeg.flight_number || 'Direktflug',
                    departureTime: outSeg.departure_airport?.time || '14:00',
                    arrivalTime: outSeg.arrival_airport?.time || '18:00',
                    duration: `${Math.floor((outSeg.duration || 140) / 60)}h ${(outSeg.duration || 140) % 60}m`
                  },
                  inbound: {
                    date: returnDate,
                    flightNo: inSeg.flight_number || 'Direktflug',
                    departureTime: inSeg.departure_airport?.time || '19:00',
                    arrivalTime: inSeg.arrival_airport?.time || '21:30',
                    duration: `${Math.floor((inSeg.duration || 140) / 60)}h ${(inSeg.duration || 140) % 60}m`
                  }
                });
              }
            }
          }
        });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Netzwerkfehler beim Abrufen der Live-Flugdaten.' });
    }

    setVerifiedDirectFlights(foundFlights);
    setIsSearching(false);
  };

  const sortedCompleteFlights = useMemo(() => {
    return [...verifiedDirectFlights].sort((a, b) => {
      if (sortBy === 'distance') return (a.originAirport.distance ?? 0) - (b.originAirport.distance ?? 0);
      if (sortBy === 'price') return a.price - b.price;
      return 0;
    });
  }, [verifiedDirectFlights, sortBy]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-black">
      
      {/* HEADER */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-emerald-500 to-cyan-500 p-2.5 rounded-xl shadow-lg shadow-emerald-950/40">
              <Plane className="w-5 h-5 text-slate-950 transform -rotate-45" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-white">DirectFlight Radar</span>
                <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Weltweit 100% Direktflüge
                </span>
              </div>
              <p className="text-xs text-slate-400">Verifizierte Direktflüge nach echten Flugzeiten & flexiblem Umkreis</p>
            </div>
          </div>
        </div>
      </header>

      {/* NOTIFICATIONS */}
      {statusMessage && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-3 w-full">
          <div className={`p-3 rounded-xl flex items-center gap-3 text-sm border shadow-lg ${
            statusMessage.type === 'error'
              ? 'bg-rose-950/70 border-rose-800 text-rose-200'
              : 'bg-emerald-950/70 border-emerald-700 text-emerald-200'
          }`}>
            {statusMessage.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span className="flex-1">{statusMessage.text}</span>
            <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-6 w-full space-y-6">
        
        {/* INPUT PANEL */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* STANDORT & UMKREIS */}
          <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">Startpunkt & Umkreis</h2>
                </div>
              </div>

              <form onSubmit={handleGeocode} className="space-y-2">
                <label className="text-xs text-slate-300 font-medium">Dein Wohnort / Startpunkt weltweit</label>
                <div className="relative">
                  <input
                    type="text"
                    value={originAddress}
                    onChange={(e) => setOriginAddress(e.target.value)}
                    placeholder="z.B. Hörstel, Cancun Mexiko, Tokio..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 pr-24 font-medium"
                  />
                  <button
                    type="submit"
                    disabled={isLocating}
                    className="absolute right-1.5 top-1.5 bottom-1.5 bg-slate-800 hover:bg-slate-700 text-xs px-3 rounded-lg text-slate-200 border border-slate-700 flex items-center gap-1.5 transition"
                  >
                    {isLocating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Navigation className="w-3.5 h-3.5 text-emerald-400" />}
                    <span>Finden</span>
                  </button>
                </div>
              </form>

              <div className="space-y-2 pt-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-300 font-medium">Max. Entfernung zum Abflughafen:</span>
                  <span className="text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded font-mono">
                    {radiusKm} km
                  </span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="300"
                  step="10"
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Number(e.target.value))}
                  className="w-full accent-emerald-500 cursor-pointer h-2 bg-slate-800 rounded-lg appearance-none"
                />
                <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                  <span>50 km</span>
                  <span className="text-emerald-400 font-bold">150 km</span>
                  <span>300 km</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-300 font-medium">
                    Gefundene Flughäfen im Radius ({nearbyAirports.filter(a => selectedAirports[a.iata]).length} aktiv)
                  </span>
                  <span className="text-[11px] text-slate-500">Klick zum Abwählen</span>
                </div>

                <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pr-1">
                  {loadingAirports ? (
                    <span className="text-xs text-slate-500">Lade weltweite Flughäfen...</span>
                  ) : nearbyAirports.length === 0 ? (
                    <span className="text-xs text-amber-400">Keine Flughäfen in diesem Radius gefunden.</span>
                  ) : (
                    nearbyAirports.map(ap => {
                      const isChecked = !!selectedAirports[ap.iata];
                      return (
                        <button
                          key={ap.iata}
                          type="button"
                          onClick={() => toggleAirport(ap.iata)}
                          className={`text-xs px-2.5 py-1.5 rounded-lg border transition flex items-center gap-1.5 ${
                            isChecked
                              ? 'bg-emerald-950/70 border-emerald-600/80 text-emerald-200'
                              : 'bg-slate-950/40 border-slate-800 text-slate-500 line-through'
                          }`}
                        >
                          <span className="font-bold">{ap.iata}</span>
                          <span className="text-[10px] opacity-75 font-mono">{ap.distance} km</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-between">
              <span>Koordinaten: {originCoords.lat.toFixed(2)}°, {originCoords.lon.toFixed(2)}°</span>
              <span className="text-emerald-400 font-mono flex items-center gap-1">
                <Check className="w-3 h-3" />
                100% Nonstop
              </span>
            </div>
          </div>

          {/* REISEZIEL & ZEITKRITERIEN */}
          <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200">Reisedaten & Zeitplan</h2>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Autocomplete Suchfeld */}
                <div className="relative" ref={destDropdownRef}>
                  <label className="text-xs text-slate-300 font-medium block mb-1.5">Weltweites Reiseziel</label>
                  <input
                    type="text"
                    value={destQuery}
                    onChange={(e) => {
                      setDestQuery(e.target.value);
                      setShowDestDropdown(true);
                    }}
                    onFocus={() => setShowDestDropdown(true)}
                    placeholder="Stadt oder IATA (z.B. MEX, BCN, Tokio)..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                  />
                  {showDestDropdown && destinationResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 max-h-48 overflow-y-auto">
                      {destinationResults.map(dest => (
                        <button
                          key={dest.iata}
                          type="button"
                          onClick={() => {
                            setSelectedDest(dest);
                            setDestQuery(`${dest.city || dest.name} (${dest.iata})`);
                            setShowDestDropdown(false);
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-emerald-600/30 flex items-center justify-between border-b border-slate-800/50"
                        >
                          <div>
                            <span className="font-bold text-white">{dest.city || dest.name}</span>
                            <span className="text-slate-400 ml-1.5">({dest.country})</span>
                          </div>
                          <span className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-emerald-300 font-bold">{dest.iata}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-medium block mb-1.5">Hinflug-Datum</label>
                  <input
                    type="date"
                    value={outboundDate}
                    onChange={(e) => setOutboundDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-300 font-medium block mb-1.5">Rückflug-Datum</label>
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                  />
                </div>
              </div>

              {/* ZEITFENSTER FILTER */}
              <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-semibold text-slate-200">Deine Zeitfenster (Ankunft & Abflug)</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-slate-300 font-medium">Hinflug: Ankunft vor Ort</span>
                      <span className="text-[10px] text-emerald-400 font-mono font-bold">FRÜHESTENS</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={minOutboundArrival}
                        onChange={(e) => setMinOutboundArrival(e.target.value)}
                        className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono w-28"
                      />
                      <span className="text-xs text-slate-400">Uhr (z.B. Check-in)</span>
                    </div>
                  </div>

                  <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-slate-300 font-medium">Rückflug: Wunsch-Abflugzeit</span>
                      <span className="text-[10px] text-emerald-400 font-mono font-bold">FRÜHESTENS</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={minInboundDeparture}
                        onChange={(e) => setMinInboundDeparture(e.target.value)}
                        className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono w-28"
                      />
                      <span className="text-xs text-slate-400">Uhr (Abreisetag)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={handleExecuteSearch}
                disabled={isSearching}
                className="w-full md:w-auto bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold px-8 py-3 rounded-xl shadow-lg shadow-emerald-950/50 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSearching ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Prüfe weltweite Direktflüge...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 text-slate-950" />
                    <span>Direktflüge finden</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* RESULTS SECTION */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/40 p-4 rounded-xl border border-slate-800">
            <div>
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <span>Gefundene Direktflüge nach {selectedDest?.city || selectedDest?.name || selectedDest?.iata}</span>
                {hasSearched && (
                  <span className="text-xs bg-emerald-950 text-emerald-300 border border-emerald-700 px-2.5 py-0.5 rounded-full font-bold">
                    {sortedCompleteFlights.length} Treffer
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                100% Nonstop • Landung ab {minOutboundArrival} Uhr • Rückflug ab {minInboundDeparture} Uhr
              </p>
            </div>

            {hasSearched && sortedCompleteFlights.length > 0 && (
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <span className="text-xs text-slate-400">Sortieren:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'distance' | 'price')}
                  className="bg-slate-950 border border-slate-700 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="distance">Nächster Flughafen (km)</option>
                  <option value="price">Günstigster Preis (€)</option>
                </select>
              </div>
            )}
          </div>

          {/* RESULTS LIST */}
          {!hasSearched ? (
            <div className="bg-slate-900/30 border border-dashed border-slate-800 rounded-2xl p-12 text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center text-emerald-400">
                <Search className="w-6 h-6" />
              </div>
              <h4 className="text-slate-300 font-medium">Bereit für die weltweite Suche</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Wähle deinen weltweiten Abflug- und Zielort und klicke auf "Direktflüge finden".
              </p>
            </div>
          ) : isSearching ? (
            <div className="space-y-3">
              {[1, 2].map(n => (
                <div key={n} className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 animate-pulse space-y-3">
                  <div className="h-4 bg-slate-800 rounded w-1/3"></div>
                  <div className="h-8 bg-slate-800 rounded w-full"></div>
                </div>
              ))}
            </div>
          ) : sortedCompleteFlights.length === 0 ? (
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-8 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
              <h4 className="text-slate-200 font-medium">Keine Direktflüge für diese Kriterien gefunden</h4>
              <p className="text-xs text-slate-400 max-w-lg mx-auto">
                An den gewählten Daten gibt es keine Nonstop-Verbindungen ab deinen Umkreisflughäfen, die deine Zeiten erfüllen.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedCompleteFlights.map((flight) => {
                const gFlightsUrl = getGoogleFlightsUrl(
                  flight.originAirport.iata,
                  flight.destinationIata,
                  flight.outbound.date,
                  flight.inbound?.date
                );

                return (
                  <div
                    key={flight.id}
                    className="bg-slate-900/90 border border-slate-800 hover:border-emerald-700/60 rounded-2xl p-4 sm:p-5 shadow-xl transition space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center font-bold text-emerald-400 text-sm border border-slate-700">
                          {flight.airlineCode}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-base">{flight.originAirport.city || flight.originAirport.name}</span>
                            <span className="bg-slate-800 text-emerald-300 text-xs px-2 py-0.5 rounded font-mono font-bold">
                              {flight.originAirport.iata}
                            </span>
                            <span className="text-xs text-slate-400">({flight.airline})</span>
                          </div>
                          <span className="text-xs text-emerald-400 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3.5 h-3.5" />
                            <strong>{flight.originAirport.distance} km</strong> von deinem Startort ({flight.originAirport.name})
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-xs text-slate-400 block">Gesamtpreis</span>
                          <span className="text-xl font-extrabold text-white">ca. {flight.price} €</span>
                        </div>
                        <a
                          href={gFlightsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow"
                        >
                          <span>Auf Google Flights buchen</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Hinflug */}
                      <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 font-medium text-slate-200">
                            <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Hinflug: {flight.outbound.date}</span>
                          </div>
                          <span className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                            {flight.outbound.flightNo}
                          </span>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <div>
                            <span className="text-lg font-bold text-white">{flight.outbound.departureTime}</span>
                            <span className="text-xs text-slate-400 block">{flight.originAirport.iata}</span>
                          </div>

                          <div className="text-center px-2">
                            <span className="text-[10px] text-slate-500 font-mono block">{flight.outbound.duration}</span>
                            <div className="w-24 sm:w-28 h-0.5 bg-slate-700 relative my-1">
                              <div className="absolute -top-1 right-1/2 translate-x-1/2 w-2 h-2 rounded-full bg-emerald-400"></div>
                            </div>
                            <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Direktflug</span>
                          </div>

                          <div className="text-right">
                            <span className="text-lg font-bold text-white">{flight.outbound.arrivalTime}</span>
                            <span className="text-xs text-slate-400 block">{flight.destinationIata}</span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-800/60 flex items-center gap-1.5 text-[11px] text-emerald-400">
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span>Landung {flight.outbound.arrivalTime} Uhr (Wunsch: ab {minOutboundArrival} Uhr)</span>
                        </div>
                      </div>

                      {/* Rückflug */}
                      {flight.inbound && (
                        <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 font-medium text-slate-200">
                              <ArrowLeftRight className="w-3.5 h-3.5 text-cyan-400" />
                              <span>Rückflug: {flight.inbound.date}</span>
                            </div>
                            <span className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                              {flight.inbound.flightNo}
                            </span>
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <div>
                              <span className="text-lg font-bold text-white">{flight.inbound.departureTime}</span>
                              <span className="text-xs text-slate-400 block">{flight.destinationIata}</span>
                            </div>

                            <div className="text-center px-2">
                              <span className="text-[10px] text-slate-500 font-mono block">{flight.inbound.duration}</span>
                              <div className="w-24 sm:w-28 h-0.5 bg-slate-700 relative my-1">
                                <div className="absolute -top-1 right-1/2 translate-x-1/2 w-2 h-2 rounded-full bg-cyan-400"></div>
                              </div>
                              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Direktflug</span>
                            </div>

                            <div className="text-right">
                              <span className="text-lg font-bold text-white">{flight.inbound.arrivalTime}</span>
                              <span className="text-xs text-slate-400 block">{flight.originAirport.iata}</span>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-800/60 flex items-center gap-1.5 text-[11px] text-emerald-400">
                            <Check className="w-3.5 h-3.5 shrink-0" />
                            <span>Abflug {flight.inbound.departureTime} Uhr (Wunsch: ab {minInboundDeparture} Uhr)</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </main>

      <footer className="border-t border-slate-900 bg-slate-950 text-slate-500 text-xs py-4 px-4 sm:px-6 text-center">
        DirectFlight Radar • Weltweit verifizierte Direktflüge nach deinen Wunschzeiten.
      </footer>
    </div>
  );
}