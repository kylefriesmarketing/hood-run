/* HOOD RUN — data.js
   All tuning constants, hazard defs, district defs, patterns, missions,
   cosmetics, power-ups. No magic numbers elsewhere. */

export const LANE_W = 2.2, ROAD_W = 8, HALF = ROAD_W / 2, SIDE_W = 3.2;
export const WALL_X = HALF + SIDE_W;

export const TUNE = {
  speed0: 11.0, speedMax: 30, speedRamp: 0.0075,   // u/s per meter
  gravity: 24, jumpV: 8.8, slideT: 0.75, fastFallV: -16,
  laneSnap: 10,                                     // lateral u/s
  laneChangeTime: 0.25,                             // for validation math
  jumpBuffer: 0.14, slideBuffer: 0.14, coyote: 0.09,
  turnWinBase: 9, turnWinSpeed: 0.55,
  stumbleSlow: 0.55, stumbleT: 0.8, invulnT: 1.4,
  // pursuit: patrol officers trail by `gap` metres; stumbles let them close in
  gapStart: 5.5, gapMax: 10, gapRegen: 0.45, gapStumble: 3.5, gapCaught: 2.0,
  puddleSlow: 0.75, puddleT: 0.5,
  simHz: 60,
  rebaseEvery: 420,                                 // origin rebase (float safety)
  // style chain
  styleQuiet: 6, styleDecay: 1,                     // levels/s after quiet
  styleCap: 9,                                      // multiplier = 1 + level (cap 10x)
  styleRepeatFalloff: 0.5,
  // crosstown meter -> Block Party
  partyDur: 8, partyMagnetR: 6.5, partyMultBonus: 2,
  meterGain: { nearMiss: 0.12, perfectJump: 0.15, perfectSlide: 0.15, coinLine: 0.10, weave: 0.15, shortcut: 0.25, airCoin: 0.06, letter: 0.2 },
  styleGain: { nearMiss: 2, perfectJump: 2, perfectSlide: 2, coinLine: 1, weave: 2, shortcut: 3, airCoin: 1, letter: 2 },
  coinScore: 10, letterBonus: 2000, tokenScore: 100,
  shortcutBonus: 250,
  perfectWindow: 1.6,                               // action within this dist of hazard = perfect
  nearMissMargin: 1.35,                             // passed adjacent occupied lane center within this = close call
  // power-ups
  powDur: { boost: 5, magnet: 9, doublestyle: 9, shield: 999 },
  boostSpeed: 1.35, magnetR: 6.5,
  shieldRecover: 1.2,
  powEveryMin: 300, powEveryMax: 520,
  // pickups
  tokenEveryMin: 380, tokenEveryMax: 700,
  letterEveryMin: 220, letterEveryMax: 420,
  // difficulty phases (by run seconds)
  phases: [
    { t: 0,   tier: 0, density: 0.55, movers: 0 },
    { t: 30,  tier: 1, density: 0.7,  movers: 0.15 },
    { t: 90,  tier: 2, density: 0.85, movers: 0.35 },
    { t: 180, tier: 3, density: 1.0,  movers: 0.5 },
    { t: 300, tier: 4, density: 1.1,  movers: 0.65 },
  ],
  recoveryEvery: [5, 8],                            // hazard groups between recovery beats
  shortcutEvery: [3, 5],                            // segments between shortcut offers
};

/* ---------- hazards ----------
   response: how the player survives. clear = 'jump'|'slide'|null (null = lane only)
   h = clearance height for jumps; strict slide = jump does NOT clear.
   stumble = non-lethal; slow = puddle-style flow break; move = lateral motion. */
export const HAZARDS = {
  pothole:  { clear: 'jump', h: 0.3,  depth: 1.0, lanes: 1, tier: 0, hit: 0.82, districts: ['block','market','downtown','nightmarket'] },
  cones:    { clear: 'jump', h: 0.5,  depth: 0.9, lanes: 1, tier: 0, hit: 0.8, stumble: true, districts: ['block','market','downtown','nightmarket'] },
  planter:  { clear: 'jump', h: 0.8,  depth: 1.0, lanes: 1, tier: 0, hit: 0.85, districts: ['block','market'] },
  boxes:    { clear: 'jump', h: 0.95, depth: 1.1, lanes: 1, tier: 1, hit: 0.85, districts: ['block','market','downtown','nightmarket'] },
  grate:    { clear: 'jump', h: 0.25, depth: 1.4, lanes: 1, tier: 1, hit: 0.8, districts: ['block','downtown'] },
  bikerack: { clear: 'jump', h: 0.9,  depth: 0.8, lanes: 1, tier: 1, hit: 0.85, districts: ['block','downtown'] },
  barrier:  { clear: 'jump', h: 0.95, depth: 0.7, lanes: 1, tier: 0, hit: 0.85, districts: ['block','market','downtown','nightmarket'] },
  hydrant:  { clear: 'jump', h: 0.75, depth: 0.8, lanes: 1, tier: 0, hit: 0.85, districts: ['block'] },
  cart:     { clear: null,   depth: 2.0, lanes: 2, tier: 1, hit: 0.9, districts: ['market','block','nightmarket'] },
  table:    { clear: null,   depth: 1.4, lanes: 1, tier: 1, hit: 0.9, districts: ['market','nightmarket'] },
  stand:    { clear: null,   depth: 2.2, lanes: 2, tier: 2, hit: 0.9, districts: ['market','nightmarket'] },
  parkedcar:{ clear: null,   depth: 2.4, lanes: 2, tier: 1, hit: 0.9, districts: ['block','downtown'] },
  dumpster: { clear: null,   depth: 1.9, lanes: 2, tier: 2, hit: 0.9, districts: ['downtown','block'] },
  scaffold: { clear: 'slide', h: 1.3, depth: 1.6, lanes: 3, tier: 1, hit: 0.9, strict: true, districts: ['downtown','block'] },
  awning:   { clear: 'slide', h: 1.25, depth: 1.0, lanes: 2, tier: 1, hit: 0.88, districts: ['market','nightmarket'] },
  clothesline:{ clear: 'slide', h: 1.2, depth: 0.5, lanes: 3, tier: 1, hit: 0.85, strict: true, districts: ['alley'] },
  gatebar:  { clear: 'slide', h: 1.3, depth: 0.8, lanes: 3, tier: 2, hit: 0.88, strict: true, districts: ['downtown'] },
  fence:    { clear: 'jump', h: 0.7,  depth: 0.5, lanes: 3, tier: 2, hit: 0.85, districts: ['block','alley'] },
  puddle:   { clear: null,   depth: 1.6, lanes: 1, tier: 0, hit: 1.0, safe: true, districts: ['block','market','downtown','alley','nightmarket'] },
  // movers (lateral motion; xv = lanes/s across)
  rollbin:  { clear: null,   depth: 1.0, lanes: 1, tier: 2, hit: 0.85, move: 0.9, districts: ['market','downtown','nightmarket'] },
  bball:    { clear: 'jump', h: 0.6, depth: 0.7, lanes: 1, tier: 1, hit: 0.8, move: 1.3, stumble: true, districts: ['block'] },
  robot:    { clear: null,   depth: 0.9, lanes: 1, tier: 2, hit: 0.85, move: 0.55, stumble: true, districts: ['downtown','market','nightmarket'] },
  // rooftop route — jump-focused (bible §4.3)
  acunit:   { clear: 'jump', h: 0.85, depth: 1.2, lanes: 1, tier: 0, hit: 0.85, districts: ['rooftop'] },
  skylight: { clear: 'jump', h: 0.45, depth: 1.6, lanes: 1, tier: 0, hit: 0.85, districts: ['rooftop'] },
  roofgap:  { clear: 'jump', h: 0.4,  depth: 2.0, lanes: 3, tier: 1, hit: 0.8,  districts: ['rooftop'] },
  ducts:    { clear: 'slide', h: 1.25, depth: 1.2, lanes: 3, tier: 2, hit: 0.88, strict: true, districts: ['rooftop'] },
  chimney:  { clear: null,   depth: 1.6, lanes: 2, tier: 1, hit: 0.9, districts: ['rooftop'] },
};

/* ---------- districts ---------- */
export const DISTRICTS = {
  block: {
    label: 'The Block', icon: '🏀',
    sky: 0x9fc7e8, fog: [0xb8d8ec, 40, 175],
    hemi: [0xcfe3f5, 0x77875f, 1.05], sun: [0xfff1cf, 0.95],
    road: 0x3a3d44, side: 0x8f9097, brickset: ['#8a4a34','#a05a3c','#7a4030','#93624a'],
    accent: '#3bd6c6', windowLit: 0.08,
    signs: ["JB'S DELI","CROWN FRIED","BARBER SHOP","LAUNDROMAT","CORNER STORE","99¢ & UP","RECORDS"],
    decor: { trees: true, stoops: true, court: true, chalk: true, murals: true, hydrants: true },
    stringLights: false, buildingH: [8, 15],
  },
  market: {
    label: 'Market Mile', icon: '🍊',
    sky: 0xf2b57e, fog: [0xf2c48d, 38, 165],
    hemi: [0xffe0b0, 0x8a7a50, 1.0], sun: [0xffd9a0, 1.0],
    road: 0x41404a, side: 0x9a948e, brickset: ['#b0683c','#c07a48','#8a5a40','#a06a50'],
    accent: '#ff8c42', windowLit: 0.15,
    signs: ["FISH MARKET","PRODUCE 24HR","TACOS Y MAS","FLOWER SHOP","CAFÉ SOL","JERK CHICKEN","SPICE HOUSE"],
    decor: { stands: true, tables: true, posters: true, murals: true },
    stringLights: true, buildingH: [8, 14],
  },
  downtown: {
    label: 'Downtown Cut', icon: '🚇',
    sky: 0x8095b8, fog: [0x93a4c2, 36, 160],
    hemi: [0xb9c6de, 0x5a6070, 0.95], sun: [0xe8ecf5, 0.8],
    road: 0x33363e, side: 0x7c7f88, brickset: ['#5c6474','#4a5262','#6a7284','#3f4756'],
    accent: '#3be8ff', windowLit: 0.3,
    signs: ["METRO DINER","COPY + PRINT","GALLERY 9","NOODLE BAR","NEWSSTAND","PHARMACY"],
    decor: { glass: true, subway: true, buslane: true, scaffolds: true },
    stringLights: false, buildingH: [14, 26],
  },
  nightmarket: {
    label: 'Night Market', icon: '🏮',
    sky: 0x1a1832, fog: [0x241f42, 30, 140],
    hemi: [0x6a5a9a, 0x2a2440, 0.85], sun: [0xffb86a, 0.35],
    road: 0x2a2836, side: 0x5a5560, brickset: ['#4a3a52','#5c4460','#3f3348','#6a4a54'],
    accent: '#ff4f9a', windowLit: 0.75,
    signs: ["NOODLE HOUSE","DUMPLING BAR","NIGHT OWL CAFÉ","LANTERN GRILL","SWEET BUNS","KARAOKE"],
    decor: { stands: true, tables: true, posters: true, murals: true, lanterns: true, neon: true },
    stringLights: true, buildingH: [9, 16],
  },
  alley: { // shortcut micro-district (inherits current district palette)
    label: 'Alley', icon: '🧺',
    coinMult: 2,
  },
  rooftop: { // elevated shortcut — jump-focused, dramatic (bible §4.3)
    label: 'Rooftops', icon: '🏙️',
    coinMult: 2,
  },
};
export const ROOF_H = 9;                  // how high the rooftop route sits
export const ROOF_MIN_DIST = 600;         // rooftops are "introduced later"
export const DISTRICT_ORDER = ['block', 'market', 'downtown', 'nightmarket'];
export const DISTRICT_LEN = 850;          // metres per district before rotating

/* ---------- power-ups ---------- */
export const POWERUPS = {
  boost:      { label: 'Sneaker Boost', icon: '⚡', color: '#ffd23c', desc: 'Speed burst — smashes minor clutter' },
  magnet:     { label: 'Coin Magnet',   icon: '🧲', color: '#3be8ff', desc: 'Pulls nearby coins' },
  doublestyle:{ label: 'Double Style',  icon: '✨', color: '#ff4f9a', desc: '2× style chain gain' },
  shield:     { label: 'Fresh Start',   icon: '🛡️', color: '#7bff5e', desc: 'Saves you from one crash' },
};

/* ---------- missions ---------- */
export const MISSIONS = [
  { id: 'dist1',    label: 'Run 1,000m total',            stat: 'dist',     target: 1000 },
  { id: 'coins150', label: 'Collect 150 coins',           stat: 'coins',    target: 150 },
  { id: 'slide3',   label: '3 perfect slides',            stat: 'pslide',   target: 3 },
  { id: 'jump5',    label: '5 perfect jumps',             stat: 'pjump',    target: 5 },
  { id: 'near10',   label: '10 close calls',              stat: 'nearmiss', target: 10 },
  { id: 'style5',   label: 'Reach a 5× style chain',      stat: 'stylemax', target: 5, once: true },
  { id: 'alley2',   label: 'Take 2 alley shortcuts',      stat: 'shortcut', target: 2 },
  { id: 'run500',   label: 'Run 500m in one go',          stat: 'rundist',  target: 500, once: true },
  { id: 'party2',   label: 'Trigger Block Party twice',   stat: 'party',    target: 2 },
  { id: 'hood1',    label: 'Spell H-O-O-D once',          stat: 'hood',     target: 1 },
  { id: 'coins400', label: 'Collect 400 coins total',     stat: 'coins',    target: 400 },
  { id: 'dist5k',   label: 'Run 5,000m total',            stat: 'dist',     target: 5000 },
  { id: 'token3',   label: 'Grab 3 Crosstown tokens',     stat: 'tokens',   target: 3 },
  { id: 'nopow90',  label: 'Survive 90s without a power-up', stat: 'nopow', target: 90, once: true },
];
export const MISSION_TOKEN_REWARD = 1;

/* ---------- cosmetics ---------- */
export const COSMETICS = {
  outfit: [
    { id: 'o_coral',  label: 'Coral Windbreaker', color: 0xe8604c, price: 0 },
    { id: 'o_teal',   label: 'Teal Track Jacket', color: 0x1fa89a, price: 120 },
    { id: 'o_violet', label: 'Violet Hoodie',     color: 0x7a3aa8, price: 200 },
    { id: 'o_sun',    label: 'Sunflower Zip-up',  color: 0xe0a020, price: 320 },
    { id: 'o_navy',   label: 'Navy Varsity',      color: 0x2a4a8e, price: 450 },
    { id: 'o_mint',   label: 'Mint Puffer',       color: 0x7fd6a8, price: 520 },
    { id: 'o_rose',   label: 'Rose Bomber',       color: 0xd6558e, price: 600 },
    { id: 'o_char',   label: 'Charcoal Tech',     color: 0x3a3f4a, price: 700 },
    { id: 'o_lantern',label: 'Lantern Silk',      color: 0xff7a3c, price: 850 },
  ],
  shoes: [
    { id: 's_white', label: 'Fresh Whites',  color: 0xf0f0f0, price: 0 },
    { id: 's_red',   label: 'Cherry Reds',   color: 0xd23c3c, price: 100 },
    { id: 's_gold',  label: 'Gold Editions', color: 0xe8b83c, price: 380 },
    { id: 's_ice',   label: 'Ice Blues',     color: 0x7fc4e8, price: 460 },
    { id: 's_neon',  label: 'Neon Volts',    color: 0xbfff3c, price: 560 },
    { id: 's_shadow',label: 'Shadow Blacks', color: 0x22242c, price: 640 },
  ],
  hat: [
    { id: 'h_cap',    label: 'Ball Cap',    kind: 'cap',    color: 0x23262e, price: 0 },
    { id: 'h_beanie', label: 'Beanie',      kind: 'beanie', color: 0xd23c50, price: 80 },
    { id: 'h_bare',   label: 'No Hat',      kind: 'none',   color: 0,        price: 60 },
    { id: 'h_bucket', label: 'Bucket Hat',  kind: 'bucket', color: 0x4a8a3a, price: 240 },
    { id: 'h_visor',  label: 'Sun Visor',   kind: 'visor',  color: 0x3bd6c6, price: 300 },
    { id: 'h_head',   label: 'Headphones',  kind: 'phones', color: 0xe8604c, price: 540 },
  ],
  trail: [
    { id: 't_none',  label: 'No Trail',    kind: 'none',  price: 0 },
    { id: 't_spark', label: 'Star Sparks', kind: 'spark', price: 260 },
    { id: 't_notes', label: 'Music Notes', kind: 'notes', price: 260 },
    { id: 't_coins', label: 'Coin Glints', kind: 'coins', price: 420 },
    { id: 't_petal', label: 'Petal Drift', kind: 'petal', price: 480 },
  ],
  pose: [
    { id: 'p_cheer',  label: 'Hands Up',    kind: 'cheer',  price: 0 },
    { id: 'p_flex',   label: 'Flex',        kind: 'flex',   price: 180 },
    { id: 'p_bow',    label: 'Take a Bow',  kind: 'bow',    price: 300 },
    { id: 'p_point',  label: 'Point & Grin', kind: 'point', price: 420 },
  ],
  skin: [
    { id: 'k_1', label: 'Preset 1', color: 0x8d5a3b, price: 0 },
    { id: 'k_2', label: 'Preset 2', color: 0x6b4226, price: 0 },
    { id: 'k_3', label: 'Preset 3', color: 0xc79a6b, price: 0 },
    { id: 'k_4', label: 'Preset 4', color: 0xa06a44, price: 0 },
    { id: 'k_5', label: 'Preset 5', color: 0x5a3520, price: 0 },
    { id: 'k_6', label: 'Preset 6', color: 0xe0b58a, price: 0 },
  ],
};

/* ---------- the Corner Store ----------
   Everything is bought with cash you actually ran for. No real money, no loot
   boxes, no timers (bible §20). Consumables are disabled on Daily runs so the
   shared-seed leaderboard stays comparable. */
export const HEADSTART_M = 250;
export const STORE = {
  consumables: [
    { id: 'headstart', label: 'Head Start', icon: '🚀', price: 150,
      desc: 'Skip the warm-up — begin your next run 250m in.' },
    { id: 'shield', label: 'Fresh Start', icon: '🛡️', price: 200,
      desc: 'Start carrying a shield that saves you from one crash.' },
    { id: 'doubler', label: 'Payday', icon: '💵', price: 250,
      desc: 'Double all cash you pick up for one run.' },
  ],
  upgrades: [
    { id: 'magnet', label: 'Longer Magnet', icon: '🧲', max: 3, bonus: 2.5,
      price: [300, 650, 1100], desc: 'Coin Magnet lasts +2.5s per level.' },
    { id: 'boost', label: 'Better Tread', icon: '⚡', max: 3, bonus: 1.5,
      price: [300, 650, 1100], desc: 'Sneaker Boost lasts +1.5s per level.' },
    { id: 'doublestyle', label: 'Style Coach', icon: '✨', max: 3, bonus: 2.5,
      price: [300, 650, 1100], desc: 'Double Style lasts +2.5s per level.' },
  ],
};

export const CALLOUTS = {
  nearMiss: 'CLOSE CALL', perfectJump: 'PERFECT JUMP', perfectSlide: 'PERFECT SLIDE',
  weave: 'WEAVE', shortcut: 'SHORTCUT!', coinLine: 'CLEAN SWEEP', party: '🎉 BLOCK PARTY!',
  letter: '', hood: 'H-O-O-D! +2000',
};

export const CRASH_LINES = {
  caught: ["The patrol caught up. Booked!", "Tagged by the beat cops — the bag goes back.", "Too slow — City Trust gets its money back."],
  wall: ["Missed the turn — the wall wins this round.", "Ran outta road. Read the arrows!"],
  generic: ["Wiped out! Shake it off, legend.", "The street got you this time."],
  pothole: ["That pothole's been there since spring."], grate: ["Right down the grate. Ouch."],
  cart: ["Delivery cart: 1, you: 0."], stand: ["Took out the mango display."],
  parkedcar: ["Double-parked. Classic."], dumpster: ["The dumpster won. It always does."],
  scaffold: ["Scaffolding says duck next time."], awning: ["Clipped the awning."],
  clothesline: ["Clotheslined — literally."], gatebar: ["That gate wasn't open yet."],
  boxes: ["Buried in boxes."], rollbin: ["Rolled over by the recycling."],
  table: ["Through the café table. Sorry!"], planter: ["Face first into the petunias."],
  barrier: ["Construction zone: closed."], bikerack: ["Tangled in the bike rack."],
  hydrant: ["Hydrant checked you."], fence: ["The fence said not today."],
  robot: ["Bonked by the delivery bot."], bball: ["Airballed."],
};

/* today's date key (local) and its deterministic Daily Challenge seed */
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function dailySeed(key = dateKey()) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return (h ^ 0x9e3779b9) >>> 0;
}

/* seeded LCG — all gameplay randomness comes through one of these */
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
export function hash2(a, b) { let h = (a * 374761393 + b * 668265263) >>> 0; h = (h ^ (h >> 13)) * 1274126177 >>> 0; return (h ^ (h >> 16)) >>> 0; }
