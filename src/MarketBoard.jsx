import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  RefreshCw,
  Fuel,
  Gem,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  Globe,
  MapPin,
  AlertTriangle,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  CONSTANTS                                                          */
/* ------------------------------------------------------------------ */

const GRAMS_PER_TROY_OZ = 31.1034768;
const LITRES_PER_US_GAL = 3.78541; // "Kalon" កាឡុង
const LITRES_PER_IMP_GAL = 4.54609;
const LITRES_PER_BARREL = 158.987;
const GRAMS_PER_CHI = 3.75;
const GRAMS_PER_DAMLEUNG = 37.5; // 10 chi

const METAL_UNITS = [
  { id: "troy_oz",  label: "Troy oz",    abbr: "oz t",  grams: GRAMS_PER_TROY_OZ },
  { id: "gram",     label: "Gram",       abbr: "g",     grams: 1 },
  { id: "kg",       label: "Kilogram",   abbr: "kg",    grams: 1000 },
  { id: "chi",      label: "Chi ជី",     abbr: "ជី",    grams: GRAMS_PER_CHI },
  { id: "damleung", label: "Damleung",   abbr: "ដំឡឹង", grams: GRAMS_PER_DAMLEUNG },
];

const FUEL_UNITS = [
  { id: "litre",   label: "Litre",          abbr: "L",       litres: 1 },
  { id: "kalon",   label: "Kalon (US Gal)", abbr: "Kalon",   litres: LITRES_PER_US_GAL },
  { id: "imp_gal", label: "Imp. Gallon",    abbr: "imp gal", litres: LITRES_PER_IMP_GAL },
  { id: "barrel",  label: "Barrel",         abbr: "bbl",     litres: LITRES_PER_BARREL },
];

// Demo data shown while loading / if fetch fails. Clearly marked as estimated.
const FALLBACK = {
  updated: null,
  fx: { USD_KHR: 4090 },
  metals: {
    gold:      { usdPerTroyOz: 3320, change24h:  0.3, source: "Kitco (est.)" },
    silver:    { usdPerTroyOz: 33.5, change24h: -0.2, source: "Kitco (est.)" },
    platinum:  { usdPerTroyOz: 955,  change24h:  0.1, source: "Kitco (est.)" },
    palladium: { usdPerTroyOz: 1020, change24h: -0.4, source: "Kitco (est.)" },
  },
  cambodiaMetals: {
    gold24k: { khrPerChi: 575000, source: "Vatanac / Ly Hour (est.)" },
  },
  oil: {
    brent: { usdPerBarrel: 76.5, change24h: 0.4, source: "ICE (est.)" },
    wti:   { usdPerBarrel: 72.8, change24h: 0.2, source: "NYMEX (est.)" },
  },
  cambodiaFuel: {
    ea92:   { khrPerLitre: 4400, source: "MoC Cambodia (est.)" },
    ea95:   { khrPerLitre: 4600, source: "MoC Cambodia (est.)" },
    diesel: { khrPerLitre: 4350, source: "MoC Cambodia (est.)" },
  },
  isFallback: true,
};

/* ------------------------------------------------------------------ */
/*  HELPERS                                                            */
/* ------------------------------------------------------------------ */

const usdPerGram = (usdPerTroyOz) => usdPerTroyOz / GRAMS_PER_TROY_OZ;
const usdPerLitreFromBarrel = (usdPerBarrel) => usdPerBarrel / LITRES_PER_BARREL;

function formatMoney(value, currency) {
  if (!isFinite(value)) return "—";
  if (currency === "USD") {
    const digits = value < 10 ? 3 : value < 1000 ? 2 : 2;
    return "$" + value.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }
  // KHR - no decimals, grouped
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 }) + " ៛";
}

function formatChange(pct) {
  if (pct === undefined || pct === null || !isFinite(pct)) return null;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function timeAgo(iso) {
  if (!iso) return "never";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

/* ------------------------------------------------------------------ */
/*  PRICE FETCH (Claude API + web_search)                              */
/* ------------------------------------------------------------------ */

async function fetchLivePrices() {
  const system = `You are a market-data lookup assistant. Use the web_search tool to find current spot/retail prices, then reply with EXACTLY ONE JSON object and nothing else — no preamble, no markdown fences, no commentary.

Schema (all numbers in the units shown):
{
  "updated": "<ISO 8601 timestamp>",
  "fx": { "USD_KHR": <number> },
  "metals": {
    "gold":      { "usdPerTroyOz": <number>, "change24h": <percent>, "source": "<short name>" },
    "silver":    { "usdPerTroyOz": <number>, "change24h": <percent>, "source": "<short name>" },
    "platinum":  { "usdPerTroyOz": <number>, "change24h": <percent>, "source": "<short name>" },
    "palladium": { "usdPerTroyOz": <number>, "change24h": <percent>, "source": "<short name>" }
  },
  "cambodiaMetals": {
    "gold24k": { "khrPerChi": <number>, "source": "<short name>" }
  },
  "oil": {
    "brent": { "usdPerBarrel": <number>, "change24h": <percent>, "source": "<short name>" },
    "wti":   { "usdPerBarrel": <number>, "change24h": <percent>, "source": "<short name>" }
  },
  "cambodiaFuel": {
    "ea92":   { "khrPerLitre": <number>, "source": "<short name>" },
    "ea95":   { "khrPerLitre": <number>, "source": "<short name>" },
    "diesel": { "khrPerLitre": <number>, "source": "<short name>" }
  }
}

Searches to run:
- "gold spot price today USD ounce"
- "silver platinum palladium spot price today"
- "brent wti crude oil price today"
- "USD to KHR exchange rate today"
- "Cambodia gasoline EA92 EA95 diesel retail price"
- "Cambodia 24k gold price per chi today"

Use recent, reputable sources (Kitco, Reuters, LBMA, ICE, NYMEX, Cambodia Ministry of Commerce, Vatanac/Ly Hour for local gold).
Return ONLY the JSON.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system,
      messages: [
        { role: "user", content: "Fetch the latest prices and return the JSON per the schema." },
      ],
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    }),
  });

  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();

  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .replace(/```json|```/g, "")
    .trim();

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in response");
  const parsed = JSON.parse(match[0]);
  parsed.isFallback = false;
  if (!parsed.updated) parsed.updated = new Date().toISOString();
  return parsed;
}

/* ------------------------------------------------------------------ */
/*  UI PRIMITIVES                                                      */
/* ------------------------------------------------------------------ */

const PALETTE = {
  ink:       "#0b0a08",
  ink2:      "#131210",
  ink3:      "#1c1a16",
  gold:      "#d4a94a",
  goldSoft:  "#b8923a",
  goldDim:   "#5a4a26",
  cream:     "#f0e9d9",
  creamDim:  "#b6ad98",
  mute:      "#766e5c",
  rule:      "rgba(212,169,74,0.22)",
  ruleSoft:  "rgba(212,169,74,0.10)",
  up:        "#7fb069",
  down:      "#c85c5c",
};

function Pill({ active, onClick, children, tight }) {
  return (
    <button
      onClick={onClick}
      style={{
        color: active ? PALETTE.ink : PALETTE.creamDim,
        background: active ? PALETTE.gold : "transparent",
        borderColor: active ? PALETTE.gold : PALETTE.rule,
        padding: tight ? "4px 10px" : "6px 14px",
        fontFamily: "'Manrope', sans-serif",
        fontWeight: 600,
        letterSpacing: "0.02em",
      }}
      className="text-xs uppercase border rounded-full transition-colors whitespace-nowrap"
    >
      {children}
    </button>
  );
}

function SectionLabel({ icon: Icon, children, right }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <Icon size={14} style={{ color: PALETTE.gold }} />
        <span
          style={{
            color: PALETTE.gold,
            fontFamily: "'Manrope', sans-serif",
            letterSpacing: "0.24em",
          }}
          className="fs-10 uppercase font-semibold"
        >
          {children}
        </span>
      </div>
      {right}
    </div>
  );
}

function HairLine() {
  return <div style={{ height: 1, background: PALETTE.rule }} className="w-full my-6" />;
}

function ChangeBadge({ pct }) {
  const fmt = formatChange(pct);
  if (fmt === null) return null;
  const up = pct > 0;
  const flat = Math.abs(pct) < 0.01;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const color = flat ? PALETTE.mute : up ? PALETTE.up : PALETTE.down;
  return (
    <span
      style={{ color, fontFamily: "'JetBrains Mono', monospace" }}
      className="inline-flex items-center gap-1 fs-11"
    >
      <Icon size={11} />
      {fmt}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  PRICE CARD                                                         */
/* ------------------------------------------------------------------ */

function PriceCard({
  name,
  ticker,
  priceUSD,    // number in USD (always passed)
  priceKHR,    // number in KHR (always passed)
  unitAbbr,
  currency,    // which one is primary
  change24h,
  source,
  accent,      // tailwind-style color for dot
  loading,
  estimated,
}) {
  const primary   = currency === "KHR" ? priceKHR : priceUSD;
  const secondary = currency === "KHR" ? priceUSD : priceKHR;
  const secondaryCur = currency === "KHR" ? "USD" : "KHR";
  return (
    <div
      style={{
        background: PALETTE.ink2,
        borderColor: PALETTE.rule,
      }}
      className="border rounded-sm p-5 relative overflow-hidden"
    >
      {/* hallmark corner */}
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          width: 6,
          height: 6,
          borderRadius: 999,
          background: accent || PALETTE.gold,
          boxShadow: `0 0 12px ${accent || PALETTE.gold}`,
        }}
      />
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div>
          <div
            style={{
              fontFamily: "'Fraunces', serif",
              color: PALETTE.cream,
              letterSpacing: "-0.01em",
            }}
            className="text-xl leading-none"
          >
            {name}
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              color: PALETTE.mute,
              letterSpacing: "0.1em",
            }}
            className="fs-10 uppercase mt-1"
          >
            {ticker}
          </div>
        </div>
        {change24h !== undefined && change24h !== null && (
          <ChangeBadge pct={change24h} />
        )}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              color: loading ? PALETTE.mute : PALETTE.cream,
              letterSpacing: "-0.02em",
            }}
            className="text-2xl md:fs-26 leading-none truncate"
          >
            {loading ? "— — —" : formatMoney(primary, currency)}
          </div>

          {!loading && isFinite(secondary) && (
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                color: PALETTE.creamDim,
              }}
              className="fs-11 mt-1.5 truncate"
            >
              {formatMoney(secondary, secondaryCur)}
            </div>
          )}

          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              color: PALETTE.mute,
            }}
            className="fs-10 mt-2 uppercase tracking-wider"
          >
            per {unitAbbr}
          </div>
        </div>
      </div>

      <div
        style={{
          borderTopColor: PALETTE.ruleSoft,
          color: PALETTE.mute,
          fontFamily: "'Manrope', sans-serif",
        }}
        className="border-t mt-4 pt-3 fs-10 flex items-center justify-between"
      >
        <span className="uppercase tracking-wider">
          {estimated ? "est · " : ""}source
        </span>
        <span style={{ color: PALETTE.creamDim }} className="truncate mw-60 text-right">
          {source || "—"}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MAIN APP                                                           */
/* ------------------------------------------------------------------ */

export default function MarketBoard() {
  const [data, setData] = useState(FALLBACK);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currency, setCurrency] = useState("USD");
  const [page, setPage] = useState("metals");
  const [metalUnit, setMetalUnit] = useState("gram");
  const [khGoldUnit, setKhGoldUnit] = useState("damleung");
  const [fuelUnit, setFuelUnit] = useState("litre");
  const [showInfo, setShowInfo] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const fresh = await fetchLivePrices();
      if (mountedRef.current) setData(fresh);
    } catch (e) {
      console.error(e);
      if (mountedRef.current) {
        setError(e.message || "Fetch failed");
        setData((prev) => ({ ...prev, isFallback: true }));
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  /* -------- derived prices -------- */

  const metalUnitDef = METAL_UNITS.find((u) => u.id === metalUnit) || METAL_UNITS[0];
  const khGoldUnitDef = METAL_UNITS.find((u) => u.id === khGoldUnit) || METAL_UNITS[0];
  const fuelUnitDef  = FUEL_UNITS.find((u)  => u.id === fuelUnit)  || FUEL_UNITS[0];
  const fx = data?.fx?.USD_KHR || 4090;

  // Each helper returns { usd, khr } in the currently-selected unit.

  // Metal USD spot → selected unit, in both currencies
  const metalPrices = (usdPerOz) => {
    const usd = usdPerGram(usdPerOz) * metalUnitDef.grams;
    return { usd, khr: usd * fx };
  };

  // Cambodia retail gold is given in KHR/chi — uses its own unit selector
  const cambodiaGoldPrices = (khrPerChi) => {
    const khr = (khrPerChi / GRAMS_PER_CHI) * khGoldUnitDef.grams;
    return { usd: khr / fx, khr };
  };

  // Crude oil USD/barrel → selected fuel unit
  const crudePrices = (usdPerBarrel) => {
    const usd = usdPerLitreFromBarrel(usdPerBarrel) * fuelUnitDef.litres;
    return { usd, khr: usd * fx };
  };

  // Cambodia pump price in KHR/litre → selected fuel unit
  const pumpPrices = (khrPerLitre) => {
    const khr = khrPerLitre * fuelUnitDef.litres;
    return { usd: khr / fx, khr };
  };

  const sources = useMemo(() => {
    if (!data) return [];
    const set = new Set();
    if (page === "metals") {
      Object.values(data.metals || {}).forEach((m) => set.add(m.source));
      Object.values(data.cambodiaMetals || {}).forEach((m) => set.add(m.source));
    } else {
      Object.values(data.oil || {}).forEach((m) => set.add(m.source));
      Object.values(data.cambodiaFuel || {}).forEach((m) => set.add(m.source));
    }
    return [...set].filter(Boolean);
  }, [data, page]);

  const estimated = !!data?.isFallback;

  /* -------- render -------- */

  return (
    <div
      style={{
        background: PALETTE.ink,
        color: PALETTE.cream,
        minHeight: "100vh",
        fontFamily: "'Manrope', sans-serif",
      }}
    >
      {/* Fonts + subtle grain + keyframes */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600;9..144,700&family=Manrope:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500&display=swap');

        @keyframes spin-slow { to { transform: rotate(360deg); } }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .fade-in { animation: fadeUp 0.5s ease-out both; }

        /* compile-free substitutes for arbitrary Tailwind values */
        .fs-10 { font-size: 10px; line-height: 1.2; }
        .fs-11 { font-size: 11px; line-height: 1.3; }
        .fs-26 { font-size: 26px; line-height: 1; }
        .ls-18 { letter-spacing: 0.18em; }
        .ls-22 { letter-spacing: 0.22em; }
        .mw-60 { max-width: 60%; }
        .mw-160 { min-width: 160px; }

        .grain::before {
          content: "";
          position: absolute; inset: 0;
          background-image: radial-gradient(rgba(212,169,74,0.04) 1px, transparent 1px);
          background-size: 3px 3px;
          pointer-events: none;
          opacity: 0.5;
        }
      `}</style>

      {/* TOP BAR / HEADER ---------------------------------------- */}
      <header className="relative grain">
        <div
          style={{
            borderBottomColor: PALETTE.rule,
          }}
          className="border-b"
        >
          <div className="max-w-6xl mx-auto px-5 md:px-8 pt-6 pb-4">
            {/* tiny location/time rail */}
            <div className="flex items-center justify-between fs-10 uppercase ls-22"
                 style={{ color: PALETTE.mute, fontFamily: "'Manrope', sans-serif" }}>
              <span className="flex items-center gap-1.5">
                <MapPin size={11} style={{ color: PALETTE.gold }} />
                Phnom&nbsp;Penh · Market&nbsp;Board
              </span>
              <span className="hidden sm:inline">No. 01 / Vol. XXVI</span>
            </div>

            {/* Title row */}
            <div className="flex items-end justify-between gap-4 mt-3 md:mt-5">
              <div>
                <h1
                  style={{
                    fontFamily: "'Fraunces', serif",
                    color: PALETTE.cream,
                    letterSpacing: "-0.03em",
                    lineHeight: 0.95,
                  }}
                  className="text-4xl md:text-6xl font-medium"
                >
                  Ore&nbsp;·&nbsp;Oil
                </h1>
                <div
                  style={{
                    fontFamily: "'Fraunces', serif",
                    color: PALETTE.goldSoft,
                    fontStyle: "italic",
                  }}
                  className="text-sm md:text-base mt-2"
                >
                  a daily bulletin of precious metals &amp; fuel prices
                </div>
              </div>

              {/* Assay-stamp mark */}
              <div className="hidden md:flex flex-col items-end">
                <svg width="64" height="64" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="30" fill="none" stroke={PALETTE.gold} strokeWidth="1" />
                  <circle cx="32" cy="32" r="25" fill="none" stroke={PALETTE.gold} strokeWidth="0.5" strokeDasharray="2 2" />
                  <text x="32" y="30" textAnchor="middle"
                        style={{ fontFamily: "'Fraunces', serif", fontSize: 14, fill: PALETTE.gold, letterSpacing: "0.1em" }}>
                    XXIV
                  </text>
                  <text x="32" y="42" textAnchor="middle"
                        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 6, fill: PALETTE.goldSoft, letterSpacing: "0.25em" }}>
                    ASSAY
                  </text>
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* CONTROLS ROW (sticky) */}
        <div
          style={{
            background: PALETTE.ink,
            borderBottomColor: PALETTE.rule,
          }}
          className="sticky top-0 z-10 border-b backdrop-blur"
        >
          {/* Folio tabs */}
          <div
            style={{ borderBottomColor: PALETTE.ruleSoft }}
            className="border-b"
          >
            <div className="max-w-6xl mx-auto px-5 md:px-8 flex items-stretch">
              {[
                { id: "metals", numeral: "I",  label: "Metals", icon: Gem },
                { id: "fuel",   numeral: "II", label: "Fuel",   icon: Fuel },
              ].map((t) => {
                const active = page === t.id;
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setPage(t.id)}
                    style={{
                      color: active ? PALETTE.gold : PALETTE.creamDim,
                      borderBottom: active
                        ? `2px solid ${PALETTE.gold}`
                        : "2px solid transparent",
                      background: active ? "rgba(212,169,74,0.04)" : "transparent",
                      fontFamily: "'Fraunces', serif",
                      letterSpacing: "0.02em",
                      transition: "color .18s, background .18s, border-color .18s",
                    }}
                    className="flex-1 md:flex-none md:mw-160 py-3 md:py-4 px-4 inline-flex items-center justify-center gap-2.5"
                  >
                    <span
                      style={{
                        fontFamily: "'Fraunces', serif",
                        fontStyle: "italic",
                        color: active ? PALETTE.goldSoft : PALETTE.mute,
                      }}
                      className="text-xs"
                    >
                      § {t.numeral}
                    </span>
                    <Icon size={14} style={{ opacity: active ? 1 : 0.55 }} />
                    <span className="text-sm uppercase ls-18">
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="max-w-6xl mx-auto px-5 md:px-8 py-3 flex flex-wrap items-center gap-3 md:gap-5">
            {/* Currency */}
            <div className="flex items-center gap-1.5">
              <span style={{ color: PALETTE.mute }}
                    className="fs-10 uppercase ls-22 mr-1">Quote</span>
              <Pill active={currency === "USD"} onClick={() => setCurrency("USD")} tight>USD</Pill>
              <Pill active={currency === "KHR"} onClick={() => setCurrency("KHR")} tight>KHR ៛</Pill>
            </div>

            <div style={{ background: PALETTE.rule }} className="w-px h-5 hidden md:block" />

            {/* Refresh + status */}
            <button
              onClick={refresh}
              disabled={loading}
              style={{
                borderColor: PALETTE.gold,
                color: PALETTE.gold,
                fontFamily: "'Manrope', sans-serif",
              }}
              className="text-xs uppercase ls-18 border rounded-full px-3 py-1.5 inline-flex items-center gap-2 disabled:opacity-60"
            >
              <RefreshCw
                size={13}
                style={{ animation: loading ? "spin-slow 1s linear infinite" : "none" }}
              />
              {loading ? "Fetching" : "Refresh"}
            </button>

            <div className="flex items-center gap-1.5 fs-11" style={{ color: PALETTE.creamDim }}>
              <Clock size={12} style={{ color: PALETTE.mute }} />
              <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {timeAgo(data?.updated)}
              </span>
              {estimated && (
                <span
                  style={{ color: PALETTE.down, fontFamily: "'Manrope', sans-serif" }}
                  className="fs-10 uppercase tracking-wider ml-2 inline-flex items-center gap-1"
                >
                  <AlertTriangle size={11} /> estimated
                </span>
              )}
            </div>

            <div className="ml-auto fs-11" style={{ color: PALETTE.mute }}>
              1&nbsp;USD ≈{" "}
              <span style={{ color: PALETTE.cream, fontFamily: "'JetBrains Mono', monospace" }}>
                {fx.toLocaleString()}
              </span>{" "}
              ៛
            </div>
          </div>
        </div>
      </header>

      {/* ===================================================== */}
      {/*  PRECIOUS METALS                                       */}
      {/* ===================================================== */}
      {page === "metals" && (
      <section key="metals-page" className="max-w-6xl mx-auto px-5 md:px-8 pt-10 pb-6 fade-in">
        <SectionLabel
          icon={Gem}
          right={
            <div className="flex gap-1.5 flex-wrap justify-end">
              {METAL_UNITS.map((u) => (
                <Pill key={u.id} active={metalUnit === u.id} onClick={() => setMetalUnit(u.id)} tight>
                  {u.label}
                </Pill>
              ))}
            </div>
          }
        >
          Precious Metals
        </SectionLabel>

        {/* International spot */}
        <div className="flex items-center gap-2 mb-3">
          <Globe size={12} style={{ color: PALETTE.goldSoft }} />
          <span style={{ color: PALETTE.creamDim, fontFamily: "'Fraunces', serif", fontStyle: "italic" }}
                className="text-sm">
            International Spot
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {[
            ["Gold",      "XAU",  data.metals.gold,      "#d4a94a"],
            ["Silver",    "XAG",  data.metals.silver,    "#c0c6cf"],
            ["Platinum",  "XPT",  data.metals.platinum,  "#b8d4d1"],
            ["Palladium", "XPD",  data.metals.palladium, "#d1b8a8"],
          ].map(([name, ticker, m, accent]) => {
            const p = m ? metalPrices(m.usdPerTroyOz) : { usd: NaN, khr: NaN };
            return (
              <PriceCard
                key={ticker}
                name={name}
                ticker={ticker + " · per " + metalUnitDef.abbr}
                priceUSD={p.usd}
                priceKHR={p.khr}
                unitAbbr={metalUnitDef.abbr}
                currency={currency}
                change24h={m?.change24h}
                source={m?.source}
                accent={accent}
                loading={loading && !data}
                estimated={estimated}
              />
            );
          })}
        </div>

        {/* Cambodia retail gold */}
        <div className="flex items-center justify-between flex-wrap gap-3 mt-8 mb-3">
          <div className="flex items-center gap-2">
            <MapPin size={12} style={{ color: PALETTE.goldSoft }} />
            <span style={{ color: PALETTE.creamDim, fontFamily: "'Fraunces', serif", fontStyle: "italic" }}
                  className="text-sm">
              Cambodia Retail · 24k Gold
            </span>
          </div>
          <div className="flex gap-1.5 flex-wrap justify-end">
            {METAL_UNITS.map((u) => (
              <Pill key={u.id} active={khGoldUnit === u.id} onClick={() => setKhGoldUnit(u.id)} tight>
                {u.label}
              </Pill>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
          {(() => {
            const p = cambodiaGoldPrices(data.cambodiaMetals.gold24k.khrPerChi);
            return (
              <PriceCard
                name="Gold 24k · retail"
                ticker={"KH · per " + khGoldUnitDef.abbr}
                priceUSD={p.usd}
                priceKHR={p.khr}
                unitAbbr={khGoldUnitDef.abbr}
                currency={currency}
                source={data.cambodiaMetals.gold24k.source}
                accent="#d4a94a"
                loading={loading && !data}
                estimated={estimated}
              />
            );
          })()}
          <div
            style={{ background: PALETTE.ink2, borderColor: PALETTE.rule, color: PALETTE.creamDim }}
            className="border rounded-sm p-5 text-sm leading-relaxed"
          >
            <div className="fs-10 uppercase ls-22 mb-2" style={{ color: PALETTE.gold }}>
              Note on Khmer units
            </div>
            <span style={{ fontFamily: "'Fraunces', serif" }} className="italic">
              1 Damleung (ដំឡឹង) = 10 Chi (ជី) = 37.5 g. Local jewellers quote 24k retail per chi
              or damleung; switch the unit above to see the price your way.
            </span>
          </div>
        </div>
      </section>
      )}

      {/* ===================================================== */}
      {/*  OIL & FUEL                                            */}
      {/* ===================================================== */}
      {page === "fuel" && (
      <section key="fuel-page" className="max-w-6xl mx-auto px-5 md:px-8 pt-10 pb-10 fade-in">
        <SectionLabel
          icon={Fuel}
          right={
            <div className="flex gap-1.5 flex-wrap justify-end">
              {FUEL_UNITS.map((u) => (
                <Pill key={u.id} active={fuelUnit === u.id} onClick={() => setFuelUnit(u.id)} tight>
                  {u.label}
                </Pill>
              ))}
            </div>
          }
        >
          Oil &amp; Fuel
        </SectionLabel>

        {/* International crude */}
        <div className="flex items-center gap-2 mb-3">
          <Globe size={12} style={{ color: PALETTE.goldSoft }} />
          <span style={{ color: PALETTE.creamDim, fontFamily: "'Fraunces', serif", fontStyle: "italic" }}
                className="text-sm">
            International Crude Benchmarks
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
          {(() => {
            const b = crudePrices(data.oil.brent.usdPerBarrel);
            const w = crudePrices(data.oil.wti.usdPerBarrel);
            return (
              <>
                <PriceCard
                  name="Brent Crude"
                  ticker={"ICE · per " + fuelUnitDef.abbr}
                  priceUSD={b.usd}
                  priceKHR={b.khr}
                  unitAbbr={fuelUnitDef.abbr}
                  currency={currency}
                  change24h={data.oil.brent.change24h}
                  source={data.oil.brent.source}
                  accent="#7a6b3f"
                  loading={loading && !data}
                  estimated={estimated}
                />
                <PriceCard
                  name="WTI Crude"
                  ticker={"NYMEX · per " + fuelUnitDef.abbr}
                  priceUSD={w.usd}
                  priceKHR={w.khr}
                  unitAbbr={fuelUnitDef.abbr}
                  currency={currency}
                  change24h={data.oil.wti.change24h}
                  source={data.oil.wti.source}
                  accent="#8a5e3f"
                  loading={loading && !data}
                  estimated={estimated}
                />
              </>
            );
          })()}
        </div>

        {/* Cambodia pump */}
        <div className="flex items-center gap-2 mt-8 mb-3">
          <MapPin size={12} style={{ color: PALETTE.goldSoft }} />
          <span style={{ color: PALETTE.creamDim, fontFamily: "'Fraunces', serif", fontStyle: "italic" }}
                className="text-sm">
            Cambodia Pump Prices
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          {(() => {
            const ea92   = pumpPrices(data.cambodiaFuel.ea92.khrPerLitre);
            const ea95   = pumpPrices(data.cambodiaFuel.ea95.khrPerLitre);
            const diesel = pumpPrices(data.cambodiaFuel.diesel.khrPerLitre);
            return (
              <>
                <PriceCard
                  name="Gasoline EA92"
                  ticker={"KH · per " + fuelUnitDef.abbr}
                  priceUSD={ea92.usd}
                  priceKHR={ea92.khr}
                  unitAbbr={fuelUnitDef.abbr}
                  currency={currency}
                  source={data.cambodiaFuel.ea92.source}
                  accent="#6f9a5a"
                  loading={loading && !data}
                  estimated={estimated}
                />
                <PriceCard
                  name="Gasoline EA95"
                  ticker={"KH · per " + fuelUnitDef.abbr}
                  priceUSD={ea95.usd}
                  priceKHR={ea95.khr}
                  unitAbbr={fuelUnitDef.abbr}
                  currency={currency}
                  source={data.cambodiaFuel.ea95.source}
                  accent="#c85c5c"
                  loading={loading && !data}
                  estimated={estimated}
                />
                <PriceCard
                  name="Diesel DO"
                  ticker={"KH · per " + fuelUnitDef.abbr}
                  priceUSD={diesel.usd}
                  priceKHR={diesel.khr}
                  unitAbbr={fuelUnitDef.abbr}
                  currency={currency}
                  source={data.cambodiaFuel.diesel.source}
                  accent="#d4a94a"
                  loading={loading && !data}
                  estimated={estimated}
                />
              </>
            );
          })()}
        </div>
      </section>
      )}

      {/* ===================================================== */}
      {/*  FOOTER / SOURCES                                      */}
      {/* ===================================================== */}
      <footer
        style={{ borderTopColor: PALETTE.rule, background: PALETTE.ink2 }}
        className="border-t mt-8"
      >
        <div className="max-w-6xl mx-auto px-5 md:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div
                style={{ color: PALETTE.gold, fontFamily: "'Manrope', sans-serif" }}
                className="fs-10 uppercase ls-22 mb-2"
              >
                Sources cited
              </div>
              <ul className="space-y-1 text-xs" style={{ color: PALETTE.creamDim }}>
                {sources.map((s) => (
                  <li key={s} className="flex items-baseline gap-2">
                    <span style={{ color: PALETTE.gold }}>·</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div
                style={{ color: PALETTE.gold, fontFamily: "'Manrope', sans-serif" }}
                className="fs-10 uppercase ls-22 mb-2"
              >
                Conversion reference
              </div>
              <ul
                className="space-y-1.5 text-xs"
                style={{ color: PALETTE.creamDim, fontFamily: "'JetBrains Mono', monospace" }}
              >
                <li>1 troy oz = 31.1034768 g</li>
                <li>1 chi (ជី) = 3.75 g</li>
                <li>1 damleung = 37.5 g = 10 chi</li>
                <li>1 Kalon = 1 US gal = 3.78541 L</li>
                <li>1 imperial gal = 4.54609 L</li>
                <li>1 barrel = 158.987 L</li>
              </ul>
            </div>

            <div>
              <div
                style={{ color: PALETTE.gold, fontFamily: "'Manrope', sans-serif" }}
                className="fs-10 uppercase ls-22 mb-2"
              >
                About &amp; disclaimer
              </div>
              <p
                style={{ color: PALETTE.creamDim, fontFamily: "'Fraunces', serif", fontStyle: "italic" }}
                className="text-xs leading-relaxed"
              >
                Prices are fetched live from public sources on each refresh.
                Figures may lag the market and are indicative only — do not use
                for trading decisions. Cambodia retail prices vary between
                shops and stations.
              </p>
              {error && (
                <div
                  style={{ color: PALETTE.down }}
                  className="fs-11 mt-3 inline-flex items-center gap-1"
                >
                  <AlertTriangle size={11} /> Last fetch: {error}
                </div>
              )}
            </div>
          </div>

          <div
            style={{ color: PALETTE.mute, borderTopColor: PALETTE.ruleSoft }}
            className="border-t mt-8 pt-4 flex items-center justify-between fs-10 uppercase ls-22"
          >
            <span>© Ore &amp; Oil · Phnom Penh</span>
            <button
              onClick={() => setShowInfo((v) => !v)}
              className="inline-flex items-center gap-1 hover:opacity-80"
              style={{ color: PALETTE.goldSoft }}
            >
              <Info size={11} /> how this works
            </button>
          </div>

          {showInfo && (
            <div
              style={{ background: PALETTE.ink3, borderColor: PALETTE.rule, color: PALETTE.creamDim }}
              className="mt-4 border rounded-sm p-4 text-xs leading-relaxed fade-in"
            >
              <span style={{ fontFamily: "'Fraunces', serif" }} className="italic">
                Refresh sends one call to Anthropic's Claude API with the
                web_search tool enabled. The model fetches the latest quotes
                from sources like Kitco, Reuters, Cambodia Ministry of
                Commerce, and local jewellers, then returns a structured JSON
                payload. All unit and currency conversions happen client-side
                in this component.
              </span>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
