// E2-902 · Palladio Kharadi Central II
// Every coordinate here is in metres, measured from the builder's vector drawing
// "PKC-II- E2-02 DIMENSION Model.pdf" (1.12 pt = 1 inch). Plan x → world x, plan y → world z.
// North is up on the sheet, so -z is north.

export const H = 2.86;        // wall height (floor to ceiling slab)
export const CEIL = 2.84;     // underside of ceiling
export const CUT = 1.2;       // plan cut height
export const EYE = 1.58;

// Wall poché, traced from the grey fills on the drawing.
export const WALLS = [
  [[0,6.2],[0,0.3],[0.65,0.3],[0.65,0.45],[0.2,0.45],[0.2,2.75],[0.95,2.75],[0.95,2.85],[0.2,2.85],[0.2,6.05],[2.8,6.05],[2.8,6.2],[2.2,6.2],[2.2,8.95],[2.65,8.95],[2.65,9.1],[2.05,9.1],[2.05,6.2]],
  [[13.45,0],[14.2,0],[14.2,0.5],[13.9,0.5],[13.9,5.2],[13.25,5.2],[13.25,6.6],[12.38,6.6],[12.38,6.45],[13.1,6.45],[13.1,5.1],[12.4,5.1],[12.4,5.0],[13.75,5.0],[13.75,0.5],[13.45,0.5]],
  [[9.0,5.0],[9.0,7.4],[7.05,7.4],[7.05,7.53],[9.0,7.53],[9.0,7.99],[9.15,7.99],[9.15,7.55],[9.5,7.55],[9.5,7.4],[9.15,7.4],[9.15,5.65],[9.75,5.65],[9.75,5.55],[9.15,5.55],[9.15,5.0]],
  [[3.7,8.75],[3.85,8.75],[3.85,9.95],[9.0,9.95],[9.0,9.5],[9.15,9.5],[9.15,10.1],[3.7,10.1]],
  [[7.45,1.71],[7.2,1.71],[7.2,2.1],[7.0,2.1],[7.0,2.25],[7.2,2.25],[7.2,4.1],[9.6,4.1],[9.6,3.98],[7.45,3.98]],
  [[10.15,7.55],[10.75,7.55],[10.75,6.6],[11.78,6.6],[11.78,6.45],[10.75,6.45],[10.75,5.1],[11.65,5.1],[11.65,5.0],[10.5,5.0],[10.5,7.4],[10.15,7.4]],
  [[10.15,0.3],[11.05,0.3],[11.05,0.5],[10.7,0.5],[10.7,4.1],[10.5,4.1],[10.5,0.5],[10.15,0.5]],
  [[3.95,6.2],[3.7,6.2],[3.7,2.1],[4.25,2.1],[4.25,2.25],[3.95,2.25]],
  [[1.25,0.3],[1.25,0.45],[1.7,0.45],[1.7,2.85],[1.85,2.85],[1.85,0.3]],
  [[3.7,7.4],[3.7,7.85],[4.15,7.85],[4.15,7.53],[6.15,7.53],[6.15,7.4]],
  [[7.2,0],[7.75,0],[7.75,0.5],[7.45,0.5],[7.45,1.1],[7.2,1.1]],
  // Customised layout: the store opening from the lobby is closed for the U-shaped kitchen.
  [[3.7,7.85],[3.85,7.85],[3.85,8.75],[3.7,8.75]],
];

// Outer edge of the floor slab.
export const OUTLINE = [[0,0.3],[1.7,0.3],[1.7,0],[14.2,0],[14.2,0.5],[13.9,0.5],[13.9,5.2],[13.25,5.2],[13.25,6.6],[10.75,6.6],[10.75,7.55],[9.15,7.55],[9.15,10.1],[3.7,10.1],[3.7,9.1],[2.05,9.1],[2.05,6.2],[0,6.2]];

// Openings through walls. rect = [x0,z0,x1,z1]; y from sill to head.
// type: door | window | slide | open
export const OPENINGS = [
  { id:'main',   type:'door',   rect:[2.65,8.95,3.7,9.1],  sill:0,    head:2.1 },
  { id:'parent', type:'door',   rect:[2.8,6.05,3.7,6.2],   sill:0,    head:2.1 },
  { id:'pbath',  type:'door',   rect:[0.95,2.75,1.7,2.85], sill:0,    head:2.1 },
  { id:'kid',    type:'door',   rect:[9.6,3.98,10.5,4.1],  sill:0,    head:2.1 },
  { id:'master', type:'door',   rect:[10.5,4.1,10.7,5.0],  sill:0,    head:2.1 },
  { id:'cbath',  type:'door',   rect:[9.75,5.55,10.5,5.65],sill:0,    head:2.1 },
  { id:'mbath',  type:'door',   rect:[11.65,5.0,12.4,5.1], sill:0,    head:2.1 },
  { id:'kitch',  type:'open',   rect:[6.15,7.4,7.05,7.53], sill:0,    head:2.1 },
  { id:'deck',   type:'slide',  rect:[4.25,2.1,7.0,2.25],  sill:0,    head:2.4 },
  { id:'pglaze', type:'slide',  rect:[1.85,2.76,3.7,2.86], sill:0.45, head:2.4, wall:true },
  { id:'w-pb',   type:'window', rect:[0.65,0.3,1.25,0.45], sill:1.5,  head:2.1 },
  { id:'w-kd',   type:'window', rect:[7.2,1.1,7.45,1.71],  sill:0.9,  head:2.1 },
  { id:'w-kid',  type:'window', rect:[7.75,0.3,10.15,0.5], sill:0.6,  head:2.4 },
  { id:'w-mst',  type:'window', rect:[11.05,0.3,13.45,0.5],sill:0.6,  head:2.4 },
  { id:'w-mb',   type:'window', rect:[11.78,6.45,12.38,6.6],sill:1.5, head:2.1 },
  { id:'w-cb',   type:'window', rect:[9.5,7.4,10.15,7.55], sill:1.5,  head:2.1 },
  { id:'w-ut',   type:'window', rect:[9.0,7.99,9.15,9.5],  sill:0.9,  head:2.1 },
];

// Rooms drive the material sweep. Each room is a set of rects plus the point the sweep starts from.
export const ROOMS = [
  { key:'lobby',   name:'Entrance lobby',    rects:[[2.2,6.2,3.7,9.1]],                         from:[3.17,9.1] },
  { key:'parent',  name:"Parent's bedroom",  rects:[[0.2,2.85,3.7,6.05],[0.2,0.45,1.7,2.75]],   from:[3.25,6.1] },
  { key:'living',  name:'Living',            rects:[[3.95,2.25,7.2,4.6]],                       from:[4.0,6.0] },
  { key:'deck',    name:'Sky deck',          rects:[[1.85,0,7.2,2.1],[1.85,2.1,3.7,2.76],[7.2,0,13.6,0.3]], from:[5.6,2.2] },
  { key:'dining',  name:'Dining',            rects:[[3.95,4.6,9.0,7.4],[7.2,4.1,10.5,4.6],[9.0,4.6,10.5,5.55],[9.15,5.55,10.5,7.4]], from:[4.2,5.6] },
  { key:'kitchen', name:'Kitchen',           rects:[[3.85,7.53,9.0,9.95]],                      from:[6.6,7.45] },
  { key:'kid',     name:"Kid's bedroom",     rects:[[7.45,0.5,10.5,3.98]],                      from:[10.05,4.05] },
  { key:'master',  name:'Master bedroom',    rects:[[10.7,0.5,13.75,5.0],[10.75,5.1,13.1,6.45]], from:[10.6,4.55] },
];

// Labels on the plan sheet: name, size string (from the drawing), position.
export const LABELS = [
  { t:"Parent's bedroom", d:"11'-6\" × 10'-6\"", p:[1.95,4.45] },
  { t:'Bath',             d:"5' × 7'-10\"",     p:[0.95,1.55] },
  { t:'Sky deck',         d:"17'-7\" × 7'-5\"", p:[4.5,1.05] },
  { t:'Living',           d:"10'-8\" × 13'",    p:[5.55,3.55] },
  { t:'Dining',           d:"16'-7\" wide",     p:[6.35,5.75] },
  { t:"Kid's bedroom",    d:"10' × 11'-10\"",   p:[8.95,2.25] },
  { t:'Master bedroom',   d:"10' × 14'-9\"",    p:[12.25,2.35] },
  { t:'Passage',          d:'',                 p:[9.8,4.55] },
  { t:'Bath',             d:'',                 p:[9.85,6.55] },
  { t:'Bath',             d:'',                 p:[11.95,5.75] },
  { t:'Entrance lobby',   d:"4'-11\" × 9'",     p:[2.95,7.6] },
  { t:'Kitchen',          d:"13'-3\" × 7'-11\"",p:[5.9,8.75] },
  { t:'Utility',          d:"3'-5\"",           p:[8.48,8.75] },
];

// The walk. Each shot is a camera pose. `stop` marks a room the visitor rests in.
// Weights decide how much scroll each move and each rest takes.
export const SHOTS = [
  { id:'plan', plan:true, hold:1.2 },
  { pos:[3.17,13,16.5],  look:[3.17,0.6,8.6],  fov:38, move:2.2 },
  { pos:[3.17,1.6,11.4], look:[3.17,1.45,7.8], fov:56, move:1.6, hold:0.5 },
  { pos:[3.4,1.6,8.85],  look:[2.75,1.3,6.0],   fov:62, move:1.1, hold:0.9, stop:'lobby' },
  { pos:[3.25,1.6,6.6],  look:[3.0,1.4,4.8],   fov:60, move:0.8 },
  { pos:[2.95,1.6,5.62], look:[1.8,1.3,5.25],  fov:60, move:0.5 },
  { pos:[1.25,1.6,5.18], look:[3.4,0.95,3.95], fov:64, move:0.8, hold:1.0, stop:'parent' },
  { pos:[2.9,1.6,5.62],  look:[3.4,1.4,7.0],   fov:60, move:0.7 },
  { pos:[3.35,1.6,6.55], look:[5.6,1.35,5.3],  fov:60, move:0.7 },
  { pos:[4.55,1.6,5.75], look:[5.9,1.15,2.6],  fov:62, move:0.9, hold:1.0, stop:'living' },
  { pos:[5.7,1.6,2.75],  look:[5.4,1.45,0.2],  fov:60, move:1.0 },
  { pos:[7.0,1.6,1.95],  look:[3.0,1.1,0.6],   fov:64, move:0.8, hold:1.0, stop:'deck' },
  { pos:[4.3,1.6,1.5],   look:[4.0,1.1,-8],    fov:60, move:0.8, hold:0.5 },
  { pos:[5.35,1.6,3.7],  look:[7.6,1.15,6.0],  fov:60, move:1.0 },
  { pos:[4.75,1.6,4.85], look:[8.5,0.95,6.55], fov:62, move:0.7, hold:1.0, stop:'dining' },
  { pos:[6.6,1.6,6.55],  look:[6.6,1.25,9.2],  fov:60, move:0.9 },
  { pos:[7.15,1.6,8.45], look:[4.2,0.95,8.95], fov:66, move:0.8, hold:1.0, stop:'kitchen' },
  { pos:[4.95,1.6,8.55], look:[8.8,1.05,8.45], fov:66, move:0.9, hold:0.8 },
  { pos:[6.6,1.6,6.9],   look:[9.4,1.5,5.0],   fov:60, move:1.0 },
  { pos:[9.15,1.6,4.6],  look:[10.05,1.5,3.4], fov:60, move:0.9 },
  { pos:[10.0,1.6,3.35], look:[7.9,1.05,1.7],  fov:64, move:0.7, hold:1.0, stop:'kid' },
  { pos:[10.1,1.6,4.55], look:[11.6,1.5,4.5],  fov:60, move:0.8 },
  { pos:[11.05,1.6,4.6], look:[13.0,0.9,2.1],  fov:64, move:0.7, hold:1.0, stop:'master' },
  { pos:[11.9,7,3.6],    look:[11.4,0.6,2.8],  fov:50, move:1.0 },
  { id:'end', plan:true, final:true, move:1.8, hold:1.0 },
];

// Room cards. Facts come from the drawings.
export const FILES = {
  lobby: {
    no:'01', title:'Entrance lobby', time:'Main door · faces south',
    text:'A 4\'-11" wide lobby with shoe storage and a seat on the left wall. Parent\'s bedroom opens to the right, the living room straight ahead.',
    facts:["4'-11\" × 9'", 'Shoe rack + seat', 'Video door phone at 1450 mm'],
  },
  parent: {
    no:'02', title:"Parent's bedroom", time:'Glazed to the sky deck',
    text:'Queen bed against the living-room wall, a full-height wardrobe and dresser, and an attached bath. The north side opens to the sky deck.',
    facts:["11'-6\" × 10'-6\"", 'Attached bath 5\' × 7\'-10"', 'Wardrobe 5\''],
  },
  living: {
    no:'03', title:'Living', time:'9\' sliding door to the deck',
    text:'TV wall on the west, sofa facing it, and a 9 ft sliding door to the sky deck. In the north-east corner there is a new 16 A point for the mopping robot dock.',
    facts:["10'-8\" × 13'", "9' sliding door", 'Note 5 · robot dock point at 1 ft'],
  },
  deck: {
    no:'04', title:'Sky deck', time:'Ninth floor · north',
    text:'A 17\'-7" deck shared by the living room and the parent\'s bedroom. Swing bench, two lounge chairs and a view over Kharadi.',
    facts:["17'-7\" × 7'-5\"", 'Glass railing', 'Level 9'],
  },
  dining: {
    no:'05', title:'Dining', time:'Between kitchen and passage',
    text:'A six-seat table under a pendant. A crockery unit runs along the east wall beside the passage to the bedrooms.',
    facts:["16'-7\" wide", 'Six seats', 'Crockery unit'],
  },
  kitchen: {
    no:'06', title:'Kitchen · option 1', time:'Customised · 06 Jan 2026',
    text:'The store is now part of a U-shaped kitchen, and the opening to the lobby is closed. Hob and a Futura multi-function sink on the long counter, the existing sink and an under-counter purifier on the short one, and a fridge next to the utility.',
    facts:['① U-shaped layout, option 1', '② Purifier inlet + point moved under counter', '③ Futura multi-function sink', '④ PP3 point at 600 mm from floor', "13'-3\" counter · 2'-1\" deep"],
  },
  kid: {
    no:'07', title:"Kid's bedroom", time:'North window',
    text:'Bed along the west wall, a study desk under the deck-side window, and a wardrobe by the door.',
    facts:["10' × 11'-10\"", "7'-10\" window", 'Study desk'],
  },
  master: {
    no:'08', title:'Master bedroom', time:'North-east corner',
    text:'The largest room. King bed against the east wall, wardrobe, a desk by the window and an attached bath.',
    facts:["10' × 14'-9\"", "7'-10\" window", 'Attached bath'],
  },
};

// Numbered markers from the customisation sheet (notes 1–5).
export const SPOTS = [
  { room:'kitchen', n:'1', p:[4.2,1.0,8.6],  t:'Kitchen redesigned as option 1. The store becomes a U-shaped kitchen.' },
  { room:'kitchen', n:'2', p:[5.45,0.95,7.75],t:'Purifier inlet and electrical point moved for an under-counter purifier.' },
  { room:'kitchen', n:'3', p:[7.35,0.95,9.6], t:'Futura multi-function sink in place of the standard sink.' },
  { room:'kitchen', n:'4', p:[8.85,0.6,9.7],  t:'PP3 power point moved to 600 mm from finished floor (switch on SB13).' },
  { room:'living',  n:'5', p:[7.1,0.3,2.55],  t:'Extra 16 A power point for the mopping robot dock, 1 ft from the floor.' },
];

// Furniture layouts per room. Option A is always the layout from the customised drawing.
export const LAYOUTS = {
  lobby:   ['As drawn', 'Console & mirror', 'Tall storage'],
  parent:  ['As drawn', 'Bed on west wall', 'Twin beds'],
  living:  ['As drawn', 'L-sectional', 'Conversation'],
  deck:    ['As drawn', 'Bistro dining', 'Lounge'],
  dining:  ['As drawn · 6 seats', 'Round · 4 seats', 'Long table · 8 seats'],
  kitchen: ['As drawn · sage', 'Walnut & charcoal', 'Navy & white'],
  kid:     ['As drawn', 'Bunk bed', 'Study corner'],
  master:  ['As drawn', 'Bed on west wall', 'Dressing wall'],
};
