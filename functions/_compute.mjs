// STREETINT — shared index computation.
// Runs unchanged in two places:
//   1. Cloudflare Worker (scheduled cron) → writes snapshot to KV, serves /v1/indices
//   2. Local  scripts/gen.mjs (node)      → writes web/data.json for the static fallback
// Everything here is keyless: Yahoo chart API, adsb.lol, and the Economist CSV.
//
// tone drives the site's colour and is set by each index's polarity:
//   'stress' red · 'warn' amber · 'ok' green · 'live' cyan · 'neut' gray

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; StreetIntBot/1.0)' };

async function yahoo(symbols) {
  const out = {};
  await Promise.all(symbols.map(async (s) => {
    try {
      const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1d&range=1mo`;
      const r = await fetch(u, { headers: UA });
      const j = await r.json();
      const res = j.chart.result[0];
      const close = (res.indicators.quote[0].close || []).filter((x) => x != null);
      out[s] = { close, last: close[close.length - 1], prev5: close[Math.max(0, close.length - 6)] };
    } catch (e) { out[s] = null; }
  }));
  return out;
}

const pct = (a, b) => (b ? (a / b - 1) * 100 : 0);
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

function relStrength(y, basket, bench) {
  const bk = basket.map((s) => y[s]).filter(Boolean);
  const bm = y[bench];
  if (!bk.length || !bm) return null;
  const bkNow = bk.reduce((s, x) => s + x.last, 0) / bk.length;
  const bkPrev = bk.reduce((s, x) => s + x.prev5, 0) / bk.length;
  return r1(pct(bkNow, bkPrev) - pct(bm.last, bm.prev5));
}
function spark(y, basket, bench) {
  const bk = basket.map((s) => y[s]).filter(Boolean);
  const bm = y[bench];
  if (!bk.length || !bm || !bm.close.length) return [];
  const n = Math.min(6, ...bk.map((x) => x.close.length), bm.close.length);
  const pts = [];
  for (let i = 0; i < n; i++) {
    const k = n - i;
    const bkv = bk.reduce((s, x) => s + x.close[x.close.length - k], 0) / bk.length;
    pts.push(r2(bkv / bm.close[bm.close.length - k]));
  }
  return pts;
}
// stressUp: rising is the concerning direction (red up / green down)
// stressDown: falling is the concerning direction (green up / amber down)
function toneUp(v, up = 0.5, down = -0.5) { return v >= up ? 'stress' : v <= down ? 'ok' : 'neut'; }
function toneDown(v, up = 0.5, down = -0.5) { return v >= up ? 'ok' : v <= down ? 'warn' : 'neut'; }

async function bigMac() {
  try {
    const r = await fetch('https://raw.githubusercontent.com/TheEconomist/big-mac-data/master/output-data/big-mac-full-index.csv', { headers: UA });
    const txt = await r.text();
    const rows = txt.trim().split('\n');
    const head = rows[0].split(',');
    const di = head.indexOf('date'), ni = head.indexOf('name'), ui = head.indexOf('USD_raw');
    const latest = rows[rows.length - 1].split(',')[di];
    let worst = null;
    for (let i = 1; i < rows.length; i++) {
      const c = rows[i].split(',');
      if (c[di] !== latest) continue;
      const under = parseFloat(c[ui]); // negative = undervalued vs USD
      if (!isFinite(under) || under < -0.95) continue; // drop broken/hyperinflation artifacts
      if (!worst || under < worst.under) worst = { name: c[ni], under };
    }
    return worst ? { currency: worst.name, pct: Math.round(worst.under * 100), date: latest } : null;
  } catch (e) { return null; }
}

async function tankers() {
  try {
    const r = await fetch('https://api.adsb.lol/v2/mil', { headers: UA });
    const j = await r.json();
    const ac = j.ac || [];
    const T = new Set(['K35R', 'KC46', 'K10', 'KC10', 'R135', 'KE3', 'A332']);
    const n = ac.filter((a) => T.has(String(a.t))).length;
    return { airborne: n, baseline: 3, total_mil: ac.length };
  } catch (e) { return null; }
}

export async function computeIndices() {
  const SYMS = ['FCFS','EZPW','SPY','GC=F','HG=F','DG','DLTR','XLY','PRAA','ECPG','PKG','IP','SW','THO','WGO','^SKEW','^VIX','BDRY'];
  const [y, bm, tk] = await Promise.all([yahoo(SYMS), bigMac(), tankers()]);
  const indices = [];

  { const v = relStrength(y, ['FCFS','EZPW'], 'SPY');
    const gold = y['GC=F'] ? r1(pct(y['GC=F'].last, y['GC=F'].prev5)) : 0;
    indices.push({ key:'pawn_index', name:'Pawn Index', tick:'FCFS · EZPW vs S&P', group:'distress',
      value:v, unit:'% vs S&P (5d)', tone:toneUp(v), signalText: v>=0.5?'rising · stress':v<=-0.5?'easing':'neutral',
      spark:spark(y,['FCFS','EZPW'],'SPY'),
      read:'Pawn lenders vs the market — households monetizing possessions. Gold moved '+(gold>=0?'+':'')+gold+'% (the control: a bullion rally can flatter these names).',
      src:'Yahoo · daily' }); }

  { const v = relStrength(y, ['DG','DLTR'], 'XLY');
    indices.push({ key:'dollar_store', name:'Dollar-Store Trade-Down', tick:'DG · DLTR vs XLY', group:'distress',
      value:v, unit:'% vs retail (5d)', tone:toneUp(v), signalText: v>=0.5?'rising · stress':v<=-0.5?'easing':'neutral',
      spark:spark(y,['DG','DLTR'],'XLY'),
      read:'Discounters vs mid-market retail. Outperformance = shoppers trading down, the squeeze climbing the income ladder.',
      src:'Yahoo · daily' }); }

  { const v = relStrength(y, ['PRAA','ECPG'], 'SPY');
    indices.push({ key:'debt_collector', name:'Debt-Collector Barometer', tick:'PRAA · ECPG vs S&P', group:'distress',
      value:v, unit:'% vs S&P (5d)', tone:toneUp(v), signalText: v>=0.5?'rising · stress':v<=-0.5?'easing':'neutral',
      spark:spark(y,['PRAA','ECPG'],'SPY'),
      read:'The rare stocks that rally when loans go bad. Strength = a default wave being priced 2–3 quarters early.',
      src:'Yahoo · daily' }); }

  { const c=y['HG=F'], g=y['GC=F']; const ratio=c&&g?c.last/g.last:null;
    const chg=c&&g? r1(pct(c.last/g.last, c.prev5/g.prev5)):0;
    const sp=[]; if(c&&g){const n=Math.min(6,c.close.length,g.close.length);for(let i=0;i<n;i++){const k=n-i;sp.push(r2(c.close[c.close.length-k]/g.close[g.close.length-k]*1000));}}
    indices.push({ key:'copper_gold', name:'Dr. Copper', tick:'copper ÷ gold', group:'physical',
      value: ratio?r2(ratio*1000):null, unit:'ratio ×1000', tone:toneDown(chg), signalText: chg>=0.5?'rising · reflation':chg<=-0.5?'falling · risk-off':'flat',
      spark:sp, read:'The metal with a PhD in economics, divided by fear. Falling ratio = growth expectations deteriorating.',
      src:'Yahoo HG=F/GC=F · daily' }); }

  { const v = relStrength(y, ['PKG','IP','SW'], 'SPY');
    indices.push({ key:'cardboard', name:'Cardboard Box Index', tick:'PKG · IP · SW', group:'physical',
      value:v, unit:'% vs S&P (5d)', tone:toneDown(v), signalText: v>=0.5?'expanding':v<=-0.5?'contracting':'flat',
      spark:spark(y,['PKG','IP','SW'],'SPY'),
      read:'Everything ships in a box first. Box-maker weakness = a goods slowdown forming before GDP admits it. (Stock proxy; Fibre Box shipments are the deeper cut.)',
      src:'Yahoo · daily' }); }

  { const v = relStrength(y, ['THO','WGO'], 'SPY');
    indices.push({ key:'rv_canary', name:'RV Canary', tick:'THO · WGO', group:'physical',
      value:v, unit:'% vs S&P (5d)', tone:toneDown(v), signalText: v>=0.5?'firming':v<=-0.5?'warning':'flat',
      spark:spark(y,['THO','WGO'],'SPY'),
      read:'RV makers — the most cancellable purchase there is. One Indiana county builds 80% of them; it led 2008 and 2020 by 6–12 months.',
      src:'Yahoo · daily' }); }

  { const sk=y['^SKEW'], vx=y['^VIX']; const diverging = sk&&vx && sk.last>=140 && vx.last<20;
    const sp=[]; if(sk){const n=Math.min(6,sk.close.length);for(let i=0;i<n;i++)sp.push(Math.round(sk.close[sk.close.length-(n-i)]));}
    indices.push({ key:'quiet_fear', name:'Quiet Fear', tick:'SKEW vs VIX', group:'fear',
      value: sk?Math.round(sk.last):null, unit:'SKEW · VIX '+(vx?vx.last.toFixed(1):'—'), tone: diverging?'warn':'neut', signalText: diverging?'diverging':'aligned',
      spark:sp, read:'Crash insurance being bought while the surface stays calm. High SKEW + low VIX = fear without stress, smart money hedging quietly.',
      src:'CBOE via Yahoo · daily' }); }

  indices.push({ key:'big_mac', name:'Big Mac Index', tick:'Economist · currency stress', group:'fear',
    value: bm?bm.pct:null, unit:(bm?bm.currency:'')+' vs USD', tone:'live', signalText:'live feed',
    spark:[], read:'A burger as a currency-stress detector. The widest undervaluation flags the most-pressured currency. Most undervalued: '+(bm?bm.currency:'—')+'.',
    src:'Economist CSV'+(bm?' · '+bm.date:'') });

  { const b=y['BDRY']; const chg=b?r1(pct(b.last,b.prev5)):0;
    indices.push({ key:'baltic_dry', name:'Baltic Dry', tick:'BDRY · dry-bulk freight', group:'fear',
      value: b?r2(b.last):null, unit:'BDRY ETF', tone:toneDown(chg,1,-1), signalText: chg>=1?'rising':chg<=-1?'falling':'flat',
      spark: b?b.close.slice(-6).map(r2):[],
      read:'The price to hire a cargo ship — impossible to fake, every quote is a real cargo. It collapsed 94% before the 2008 trade crash.',
      src:'Yahoo BDRY · daily' }); }

  { const elevated = tk && tk.airborne > tk.baseline;
    indices.push({ key:'tanker_tell', name:'Tanker Tell', tick:'adsb.lol · US refuelers', group:'fear',
      value: tk?tk.airborne:null, unit:'refuelers airborne', tone: elevated?'warn':'live', signalText: elevated?'elevated · live':'live feed',
      spark:[], read:'US military tankers airborne right now vs a ~3-plane baseline. Refuelers can\'t hide — an anomalous surge preceded the June 2025 strikes by days.'+(tk?' ('+tk.total_mil+' mil aircraft tracked)':''),
      src:'adsb.lol /v2/mil · live' }); }

  const stressed = indices.filter((i) => i.group === 'distress' && i.tone === 'stress').length;
  const summary = stressed >= 2 ? 'DISTRESS RISING' : stressed === 1 ? 'MIXED' : 'STEADY';
  return { updated: new Date().toISOString(), summary, indices };
}
