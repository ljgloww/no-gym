// figure.js — the athlete's body.
// A pose gives a few key points (pelvis, chest, hands, feet). Two-bone IK turns them into a skeleton, then skin is
// lofted over that skeleton every frame, so the spine, shoulders, elbows and knees bend like a body instead of like
// hinges. The skin is sculpted: each ring of it carries the muscles and bones that show at that height.
import * as THREE from '../vendor/three.module.min.js';

export const COL = {
  ink: 0x0a0b0d, volt: 0xd4ff3a, coral: 0xff5b3a, gold: 0xffc83a,
  skin: 0xb47a55, top: 0xece6da, shorts: 0x272c35, hair: 0x1d1510, sole: 0xf1efe8, sock: 0xe9e6de,
  metal: 0xb4bcc8, plat: 0x15181d, dim: 0x2a2f37,
};
// Body proportions in metres (about 1.8 m tall).
export const B = { thigh: .44, shin: .44, spineLo: .22, spineHi: .30, armU: .29, armL: .27, shW: .19, hipW: .092, neck: .19 };
export const LEG = B.thigh + B.shin;
export const SPINE = .519;          // pelvis → base of the neck with the back straight
export const STAND = .975;          // pelvis height standing tall with soft knees
// Shoe, measured from the ankle joint: ball of the foot ahead, heel behind, sole below.
export const FOOT = { ball: .1, heel: .045, sole: .078, toe: .094 };

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const sstep = (a, b, x) => ease((x - a) / (b - a));
/** 1 at 0, falling smoothly to 0 at ±1. */
const bell = x => { x = Math.abs(x); return x >= 1 ? 0 : .5 + .5 * Math.cos(Math.PI * x); };
const blob = (dx, dy, rx, ry) => bell(Math.hypot(dx / rx, dy / ry));
const turn = d => ((d % 360) + 540) % 360 - 180;      // degrees wrapped to −180..180

const V = () => new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);
const _d = V(), _p = V(), _a = V(), _b = V(), _c = V(), _t = V(), _u = V(), _v = V(), _d1 = V(), _d2 = V();
const _m = new THREE.Matrix4();

/** Two-bone IK: from root `a` towards target `c`; writes the middle joint, the (reach-clamped) end and the bend direction. */
export function ik2(a, c, l1, l2, pole, outMid, outEnd, outPole) {
  _d.subVectors(c, a);
  let d = _d.length();
  if (d < 1e-5) { _d.set(0, -1, 0); d = 1e-5; } else _d.divideScalar(d);
  const dd = clamp(d, Math.abs(l1 - l2) + .002, (l1 + l2) * .999);
  outEnd.copy(a).addScaledVector(_d, dd);
  const x = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-8) _p.set(0, 0, 1);
  _p.normalize();
  outMid.copy(a).addScaledVector(_d, x).addScaledVector(_p, h);
  if (outPole) outPole.copy(_p);
}

/** Body-part frame: `up` along the spine, `side` towards the athlete's near side, turned by yaw and tipped by roll. */
function frame(side, fwd, up, axis, yaw, roll) {
  up.copy(axis);
  _a.copy(Z).addScaledVector(up, -Z.dot(up));
  if (_a.lengthSq() < 1e-6) _a.set(1, 0, 0);
  _a.normalize();
  _b.crossVectors(up, _a);
  side.copy(_a).multiplyScalar(Math.cos(yaw)).addScaledVector(_b, Math.sin(yaw)).addScaledVector(up, roll).normalize();
  up.addScaledVector(side, -up.dot(side)).normalize();
  fwd.crossVectors(up, side);
}

/** Point and tangent at distance s along A→M→…, with the corner at M rounded over ±r. Returns 1 at the joint, 0 away from it. */
function chain(A, M, d1, d2, l1, s, r, outC, outT) {
  if (s <= l1 - r) { outC.copy(A).addScaledVector(d1, s); outT.copy(d1); return 0; }
  if (s >= l1 + r) { outC.copy(M).addScaledVector(d2, s - l1); outT.copy(d2); return 0; }
  const q = (s - (l1 - r)) / (2 * r);
  outC.copy(M).addScaledVector(d1, -r * (1 - q) * (1 - q)).addScaledVector(d2, r * q * q);
  outT.copy(d1).multiplyScalar(1 - q).addScaledVector(d2, q).normalize();
  return 1 - Math.abs(2 * q - 1);
}

/* --------------------------------------------------------------- sculpting --
   Shapes are written as a few rows of measurements and turned into dense rings once, at start-up. */
const slope = (l, r) => l * r <= 0 ? 0 : Math.sign(l) * Math.min((Math.abs(l) + Math.abs(r)) / 2, 3 * Math.min(Math.abs(l), Math.abs(r)));
/** Every column of a sparse table (rows sorted by column 0) at t, smoothly and without overshoot. */
function at(rows, t, out = []) {
  let i = 0;
  while (i < rows.length - 2 && rows[i + 1][0] <= t) i++;
  const a = rows[i], b = rows[i + 1], p = rows[i - 1], n = rows[i + 2];
  const h = b[0] - a[0], f = clamp((t - a[0]) / h, 0, 1), f2 = f * f, f3 = f2 * f;
  out[0] = t;
  for (let c = 1, cols = Math.max(a.length, b.length); c < cols; c++) {
    const A = a[c] || 0, C = b[c] || 0, d = (C - A) / h;
    const m0 = p ? slope((A - (p[c] || 0)) / (a[0] - p[0]), d) : d, m1 = n ? slope(d, ((n[c] || 0) - C) / (n[0] - b[0])) : d;
    out[c] = (2 * f3 - 3 * f2 + 1) * A + (f3 - 2 * f2 + f) * h * m0 + (3 * f2 - 2 * f3) * C + (f3 - f2) * h * m1;
  }
  return out;
}

/** Dense rings from a sparse profile. Row: [t, side, front, back, front offset, …]. Lump: [t, half-length, angle°, half-angle°, height] —
    a muscle or bone pushing the skin out (negative: a groove). Angle 0 is +side, 90 the front. `mir` −1 builds the other side's limb. */
function bake(rows, step, segs, lumps = [], mir = 1, sq = 1) {
  const ts = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i][0], n = Math.max(1, Math.round((rows[i + 1][0] - a) / step));
    for (let k = 0; k < n; k++) ts.push(a + (rows[i + 1][0] - a) * k / n);
  }
  ts.push(rows[rows.length - 1][0]);
  return ts.map(t => {
    const q = at(rows, t), xy = new Float32Array(segs * 2);
    for (let i = 0; i < segs; i++) {
      const a = i / segs * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), d = lumpsAt(lumps, t, i / segs * 360, mir, 4);
      xy[i * 2] = Math.sign(c) * Math.abs(c) ** sq * Math.max(q[1], 3e-4) + c * d;
      xy[i * 2 + 1] = Math.sign(s) * Math.abs(s) ** sq * Math.max(s >= 0 ? q[2] : q[3], 3e-4) + s * d;
    }
    return { t, q, xy };
  });
}
function lumpsAt(lumps, t, deg, mir, col) {
  let d = 0;
  for (const b of lumps) {
    const tt = (t - b[0]) / b[1];
    if (Math.abs(tt) < 1 && b[col]) d += b[col] * bell(tt) * (b[3] >= 360 ? 1 : bell(turn(deg - (mir < 0 ? 180 - b[2] : b[2])) / b[3]));
  }
  return d;
}
/** Skin is never one flat colour. Tone: [t, half-length, angle°, half-angle°, darken, redden] → vertex colours for baked rings. */
function shade(rings, segs, tones, mir = 1) {
  const col = new Float32Array(rings.length * segs * 3);
  rings.forEach((r, j) => {
    for (let i = 0; i < segs; i++) {
      const dk = 1 - lumpsAt(tones, r.t, i / segs * 360, mir, 4), rd = lumpsAt(tones, r.t, i / segs * 360, mir, 5), o = (j * segs + i) * 3;
      col[o] = dk; col[o + 1] = dk * (1 - rd * .6); col[o + 2] = dk * (1 - rd * .7);
    }
  });
  return col;
}
const sym = (t, th, a, ah, h, r) => [[t, th, a, ah, h, r], [t, th, 180 - a, ah, h, r]];
const cut = (rings, t) => rings.findIndex(r => r.t >= t - 1e-6);

/* ------------------------------------------------------------------ skin --
   A Tube is a stack of rings rebuilt each frame around a moving bone. */
class Tube {
  constructor(rings, segs, mats, splits = [], square = 1) {
    this.ns = segs; this.r = 0;
    this.pos = new Float32Array(rings * segs * 3);
    const idx = [];
    for (let r = 0; r < rings - 1; r++) for (let i = 0; i < segs; i++) {
      const a = r * segs + i, b = r * segs + (i + 1) % segs;
      idx.push(a, b, a + segs, b, b + segs, a + segs);
    }
    const g = this.geo = new THREE.BufferGeometry();
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(rings * segs * 3), 3));
    if (Array.isArray(mats)) {
      let start = 0;
      [...splits, rings - 1].forEach((end, k) => { g.addGroup(start * segs * 6, (end - start) * segs * 6, k); start = end; });
    }
    this.cs = new Float32Array(segs); this.sn = new Float32Array(segs);
    for (let i = 0; i < segs; i++) {
      const a = i / segs * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      this.cs[i] = Math.sign(c) * Math.abs(c) ** square; this.sn[i] = Math.sign(s) * Math.abs(s) ** square;
    }
    this.mesh = new THREE.Mesh(g, mats);
    this.mesh.castShadow = true; this.mesh.frustumCulled = false;
  }
  set(name, data, size) { this.geo.setAttribute(name, new THREE.BufferAttribute(data, size)); return this; }
  begin() { this.r = 0; }
  /** A plain oval ring: side, front and back radii. */
  ring(c, u, v, ru, rf, rb = rf) {
    const P = this.pos, n = this.ns;
    let o = this.r++ * n * 3;
    for (let i = 0; i < n; i++) {
      const x = this.cs[i] * ru, y = this.sn[i] * (this.sn[i] >= 0 ? rf : rb);
      P[o++] = c.x + u.x * x + v.x * y; P[o++] = c.y + u.y * x + v.y * y; P[o++] = c.z + u.z * x + v.z * y;
    }
  }
  /** A sculpted ring from a baked outline. (gx, gy, m): loose cloth — the side facing that way hangs out by up to m. */
  put(c, u, v, xy, su = 1, sv = 1, gx = 0, gy = 0, m = 0) {
    const P = this.pos, n = this.ns;
    let o = this.r++ * n * 3;
    for (let i = 0; i < n; i++) {
      let x = xy[i * 2] * su, y = xy[i * 2 + 1] * sv;
      if (m) { const d = (x * gx + y * gy) / Math.hypot(x, y); if (d > 0) { x += gx * m * d; y += gy * m * d; } }
      P[o++] = c.x + u.x * x + v.x * y; P[o++] = c.y + u.y * x + v.y * y; P[o++] = c.z + u.z * x + v.z * y;
    }
  }
  end() { this.geo.attributes.position.needsUpdate = true; this.geo.computeVertexNormals(); }
}

/** Skin a two-bone limb with baked rings: t runs 0 → 1 down the first bone and 1 → 2 down the second.
    "Front" is the side the joint bends towards (kneecap, point of the elbow). */
function loftLimb(tube, A, M, E, pole, rings, r, bump, endV) {
  _d1.subVectors(M, A); const l1 = _d1.length() || 1e-4; _d1.divideScalar(l1);
  _d2.subVectors(E, M); const l2 = _d2.length() || 1e-4; _d2.divideScalar(l2);
  const fix = .25 * r * _d1.distanceTo(_d2) * bump;          // put back the corner that rounding cuts off, plus a bony bump
  tube.begin();
  for (let k = 0; k < rings.length; k++) {
    const g = rings[k], t = g.t, f = t - 1;
    const j = chain(A, M, _d1, _d2, l1, t < 1 ? t * l1 : l1 + f * l2, r, _c, _t);
    _v.copy(pole).addScaledVector(_t, -pole.dot(_t));
    if (endV && f > 0) { _v.normalize().lerp(endV, f * f); _v.addScaledVector(_t, -_v.dot(_t)); }   // the forearm twists to follow the hand
    if (_v.lengthSq() < 1e-8) _v.set(0, 0, 1).addScaledVector(_t, -_t.z);
    _v.normalize();
    _u.crossVectors(_v, _t);
    _c.addScaledVector(_v, (g.q[4] || 0) + fix * j);
    tube.put(_c, _u, _v, g.xy);
  }
  tube.end();
}

/* ---------------------------------------------------------------- the body --
   Torso rows: [height above the hip line, half-width, front depth, back depth, front offset, pelvis→chest turn, breathing, follows the neck] */
const TORSO = [
  [-.125, .02, .02, .02, 0, 0, 0],
  [-.105, .09, .062, .075, 0, 0, 0],
  [-.065, .152, .09, .11, -.005, 0, 0],
  [-.02, .176, .098, .122, -.008, 0, 0],
  [.04, .17, .1, .113, -.005, .06, 0],
  [.1, .152, .098, .096, 0, .16, .2],             // waistband
  [.17, .14, .095, .086, .004, .32, .45],
  [.24, .146, .1, .09, .004, .52, .75],
  [.31, .16, .11, .1, .002, .72, 1],              // bottom of the ribs
  [.37, .174, .122, .108, 0, .86, 1],
  [.42, .182, .126, .112, -.002, .94, .9],
  [.46, .18, .118, .11, -.004, 1, .6],
  [.49, .177, .101, .104, -.006, 1, .4, .1],       // collarbones
  [.508, .165, .09, .099, -.007, 1, .25, .3],     // the shoulders are a shelf out to the arms…
  [.522, .136, .078, .092, -.008, 1, .1, .55],
  [.535, .098, .066, .078, -.01, 1, 0, .85],
  [.548, .0615, .057, .0615, -.01, 1, 0, 1],      // …then run up into the neck
];
const TORSO_M = [
  ...sym(.405, .08, 60, 33, .011),                // pecs
  [.4, .1, 90, 9, -.004],                         // breastbone
  ...sym(.487, .016, 52, 42, .005),               // collarbones
  [.502, .03, 90, 12, -.004],                     // the notch between them
  [.22, .15, 90, 26, .004],                       // belly wall
  ...sym(.35, .13, 345, 30, .008),                // lats
  ...sym(.4, .1, 297, 22, .006),                  // shoulder blades
  [.27, .3, 270, 9, -.006],                       // the groove of the spine
  ...sym(.5, .045, 305, 32, .009),                // trapezius
  ...sym(-.035, .1, 298, 30, .014),               // glutes
];
const TORSO_T = [...sym(.352, .03, 62, 32, .12), [.4, .1, 90, 8, .1], ...sym(.505, .014, 50, 42, .1), [.27, .3, 270, 8, .1]];
// The top is cut loose below the chest: how wide it hangs at each height.
const SHIRT = [[.04, .164, .111, .105], [.12, .162, .11, .103], [.2, .159, .11, .101], [.28, .163, .114, .105], [.34, .171, .121, .109], [.38, 0, 0, 0]];
const NECK = [[0, .08, .06, .074], [.25, .066, .057, .066], [.5, .058, .055, .059], [.8, .0545, .055, .056], [1, .054, .054, .055]];
const NECK_M = [[.56, .2, 90, 16, .004], ...sym(.5, .5, 48, 15, .003), ...sym(.2, .3, 300, 30, .004)];
const NECK_T = [[1, .45, 90, 85, .3, 0]];
// Arms. Angle 0 is the outside of the arm, 90 the back (triceps, point of the elbow), 270 the front (biceps).
const ARM = [
  [-.185, .0005, .0005, .0005], [-.174, .021, .022, .022], [-.148, .038, .04, .04], [-.105, .052, .054, .054], [-.05, .061, .063, .063],
  [0, .0645, .066, .066], [.1, .0655, .066, .064], [.22, .06, .0615, .059], [.36, .0535, .059, .056], [.5, .051, .057, .058],
  [.66, .048, .053, .054], [.82, .0445, .046, .046], [.93, .0435, .0435, .041],
  [1, .043, .045, .039], [1.1, .046, .044, .042], [1.25, .048, .043, .045], [1.42, .0445, .04, .042], [1.6, .0375, .034, .035],
  [1.8, .031, .026, .026], [1.93, .028, .0215, .021], [2, .027, .021, .0205],
];
const ARM_M = [
  [.06, .3, 0, 85, .006],          // deltoid
  [.5, .3, 270, 55, .0065],        // biceps
  [.4, .28, 65, 50, .005],         // triceps
  [.62, .26, 5, 24, -.003],        // the groove between them
  [1, .08, 90, 32, .004],          // point of the elbow
  [1.2, .28, 320, 50, .005],       // top of the forearm
  [1.22, .28, 180, 50, .004],      // forearm flexors
  [1.96, .05, 120, 30, .003],      // wrist bone
];
const ARM_T = [[1, .11, 90, 70, .1, .1], [.02, .22, 180, 70, .2, 0], [.62, .26, 5, 24, .07, 0], [2, .1, 0, 360, .04, .08]];
// Legs. Angle 0 is the inside of the leg, 90 the front (quad, kneecap, shin), 270 the back (hamstring, calf).
const LEGP = [
  [-.15, .03, .03, .03], [-.08, .075, .077, .081], [0, .088, .091, .097], [.14, .091, .096, .097, .002], [.32, .087, .095, .088, .004],
  [.5, .079, .088, .079, .004], [.68, .068, .075, .067, .003], [.84, .059, .062, .056], [.94, .0555, .058, .052],
  [1, .055, .058, .05], [1.08, .0525, .052, .052], [1.18, .054, .046, .062], [1.3, .0565, .044, .068, -.002], [1.45, .051, .041, .059, -.002],
  [1.62, .042, .037, .045], [1.78, .0355, .034, .0375], [1.9, .0325, .033, .0355], [1.925, .0365, .037, .0395], [2, .037, .038, .0385],
];
const LEG_M = [
  [.42, .4, 150, 55, .007],        // outer quad
  [.4, .42, 95, 34, .004],         // front quad
  [.8, .17, 42, 40, .006],         // the teardrop above the knee
  [.45, .42, 270, 60, .005],       // hamstrings
  [.16, .26, 0, 50, .004],         // inner thigh
  [1, .075, 90, 30, .006],         // kneecap
  [1.085, .05, 90, 28, -.0025],    // the dip under it
  [1.27, .21, 318, 44, .0075],     // calf, inner head
  [1.25, .19, 225, 40, .005],      // calf, outer head
  [1.3, .26, 128, 32, .003],       // shin muscle
  [1.7, .2, 270, 22, .003],        // Achilles tendon
];
const LEG_T = [[1, .09, 90, 60, .08, .1], [1, .07, 270, 55, .14, 0], [0, .2, 0, 60, .15, 0]];
const SOCK = 1.915;
const CUFF = [[-.12, .062, .064, .068], [-.04, .09, .094, .1], [.1, .1, .105, .106, .002], [.24, .099, .106, .101, .003], [.36, .096, .104, .096, .004], [.385, .097, .105, .097, .004]];

/* ------------------------------------------------------------- fixed parts -- */
// Shoe, heel to ball, then the toe box (which hinges): [distance, half-width, up, down, centre height]
const SHOE = [
  [-.064, .006, .008, .006, -.05], [-.058, .022, .03, .02, -.05], [-.042, .034, .052, .026, -.05], [-.016, .039, .064, .027, -.05],
  [.014, .041, .06, .027, -.05], [.04, .043, .042, .027, -.05], [.07, .045, .03, .027, -.05], [.102, .046, .024, .026, -.052],
];
const TOE = [[-.004, .046, .024, .02, .006], [.03, .045, .024, .02, .006], [.058, .04, .021, .02, .005], [.08, .029, .016, .017, .004], [.091, .014, .009, .01, .002], [.095, .002, .002, .002, 0]];
const soleOf = (rows, y) => rows.map(([x, w]) => [x, w < .01 ? w * .5 : w + .004, Math.min(.011, w * .5), Math.min(.011, w * .5), y]);

/** A fixed shape lofted once from profile rows [along, side, front, back, offset]. */
function sculpt(rows, segs, square, along, front) {
  const tube = new Tube(rows.length, segs, null, [], square), side = V().crossVectors(front, along);
  tube.begin();
  for (const q of rows) tube.ring(_c.copy(along).multiplyScalar(q[0]).addScaledVector(front, q[4]), side, front, q[1], q[2], q[3]);
  tube.end();
  return tube.geo;
}

/** A fixed surface, rows × columns of points from fn(row, column, out, expression), closed around the columns.
    `out` also takes a colour (r, g, b) and a cover value k (the surface is cut away where k < 0). */
function shell(nr, ns, fn, morphs = 0) {
  const idx = [], o = { x: 0, y: 0, z: 0, r: 1, g: 1, b: 1, k: 1 };
  for (let r = 0; r < nr - 1; r++) for (let i = 0; i < ns; i++) {
    const a = r * ns + i, b = r * ns + (i + 1) % ns;
    idx.push(a, b, a + ns, b, b + ns, a + ns);
  }
  const make = e => {
    const pos = new Float32Array(nr * ns * 3), col = new Float32Array(nr * ns * 3), cov = new Float32Array(nr * ns);
    for (let j = 0, n = 0; j < nr; j++) for (let i = 0; i < ns; i++, n++) {
      o.r = o.g = o.b = o.k = 1; fn(j, i, o, e);
      pos[n * 3] = o.x; pos[n * 3 + 1] = o.y; pos[n * 3 + 2] = o.z;
      col[n * 3] = o.r; col[n * 3 + 1] = o.g; col[n * 3 + 2] = o.b; cov[n] = o.k;
    }
    const g = new THREE.BufferGeometry();
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('cover', new THREE.BufferAttribute(cov, 1));
    g.computeVertexNormals();
    return g;
  };
  const g = make(0);
  if (morphs) {
    g.morphAttributes.position = []; g.morphAttributes.normal = [];
    for (let e = 1; e <= morphs; e++) { const m = make(e); g.morphAttributes.position.push(m.attributes.position); g.morphAttributes.normal.push(m.attributes.normal); }
  }
  return g;
}
const white = (geo, r = 1, g = r, b = r) => {
  const c = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < c.length; i += 3) { c[i] = r; c[i + 1] = g; c[i + 2] = b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
};

/* --------------------------------------------------------------- materials -- */
/** Skin lets light through: past the edge of the light it glows warm instead of going straight to shadow. */
function skinLight(mat) {
  mat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_pars_fragment>', THREE.ShaderChunk.lights_physical_pars_fragment.replace(
      'vec3 irradiance = dotNL * directLight.color;',
      'float wrapNL = saturate( ( dot( geometryNormal, directLight.direction ) + .4 ) / 1.4 );\n\tvec3 irradiance = ( dotNL + vec3( .26, .06, .03 ) * max( wrapNL - dotNL, 0. ) ) * directLight.color;'));
  };
  return mat;
}
/** Cloth and hair are cut to shape: the surface is dropped wherever its `cover` value is below zero. */
function cutout(mat) {
  mat.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute float cover;\nvarying float vCover;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvCover = cover;');
    sh.fragmentShader = 'varying float vCover;\n' + sh.fragmentShader.replace('#include <clipping_planes_fragment>', 'if ( vCover < 0. ) discard;\n\t#include <clipping_planes_fragment>');
  };
  return mat;
}

/* ------------------------------------------------------------------ hands -- */
// Palm, wrist to knuckles: [distance, half-width, back of the hand, palm side, offset]
const PALM = [[-.004, .012, .008, .008, 0], [0, .024, .0135, .0135, 0], [.02, .034, .0165, .016, 0], [.05, .041, .016, .0155, 0], [.08, .042, .0135, .013, 0], [.094, .039, .011, .011, 0], [.101, .03, .005, .005, 0]];
function makeHand(s, mat) {
  // hand space: +x along the fingers, +y the back of the hand, thumb on the `ts` side
  const g = new THREE.Group(), ts = -s, fingers = [];
  const mesh = (geo, parent) => { const m = new THREE.Mesh(white(geo), mat); m.castShadow = true; parent.add(m); return m; };
  const bone = (r, l) => { const geo = new THREE.CapsuleGeometry(r, l, 3, 8); geo.rotateZ(-Math.PI / 2); geo.translate(l / 2, 0, 0); return geo; };
  mesh(sculpt(PALM, 16, .8, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)), g);
  const L1 = [.034, .038, .036, .028], L2 = [.03, .034, .032, .026];
  for (let k = 0; k < 4; k++) {
    const root = new THREE.Group(), mid = new THREE.Group();
    root.position.set(.087 - (k === 3 ? .009 : k === 0 ? .003 : 0), 0, ts * (.0282 - k * .0188));
    mesh(bone(.0099, L1[k]), root);
    mid.position.x = L1[k] + .003; mesh(bone(.0093, L2[k]), mid);
    root.add(mid); g.add(root); fingers.push([root, mid, k]);
  }
  const th = new THREE.Group(), th2 = new THREE.Group();
  th.position.set(.02, -.004, ts * .033); mesh(bone(.0105, .036), th);
  th2.position.x = .039; mesh(bone(.0095, .026), th2); th.add(th2); g.add(th);
  return { g, fingers, th, th2, ts };
}

/** curl: 0 = flat open hand, 1 = fist. */
function setHand(H, curl) {
  for (const [root, mid, k] of H.fingers) {
    root.rotation.set(0, H.ts * (k - 1.5) * .075 * (1 - curl), -(.06 + curl * 1.42));
    mid.rotation.z = -(.08 + curl * 1.5);
  }
  H.th.rotation.set(0, -H.ts * (.8 - .3 * curl), -curl * .55);
  H.th2.rotation.z = -(.12 + curl * .7);
}

/* ------------------------------------------------------------------- feet -- */
let SHOE_GEO;
function makeFoot(upper, sole) {
  // foot space: +x towards the toes, +y up, origin at the ankle
  if (!SHOE_GEO) {
    const X = new THREE.Vector3(1, 0, 0), Yv = new THREE.Vector3(0, 1, 0);
    SHOE_GEO = [sculpt(SHOE, 16, 1, X, Yv), sculpt(soleOf(SHOE, -.0675), 16, .7, X, Yv), sculpt(TOE, 16, 1, X, Yv), sculpt(soleOf(TOE, -.0095), 16, .7, X, Yv)];
  }
  const g = new THREE.Group(), toe = new THREE.Group();
  const mesh = (geo, mat, parent) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; parent.add(m); };
  mesh(SHOE_GEO[0], upper, g); mesh(SHOE_GEO[1], sole, g);
  toe.position.set(FOOT.ball, -.058, 0);
  mesh(SHOE_GEO[2], upper, toe); mesh(SHOE_GEO[3], sole, toe);
  g.add(toe);
  return { g, toe };
}

/* ------------------------------------------------------------------- head --
   Head space: +x is the face, +y the crown, ±z the ears. The skull is a stack of ovals; the face is pressed into the
   front of it as a relief (brow, eye sockets, nose, lips, chin), so there are real planes for the light to catch. */
// [height, half-width, front, back, centre offset towards the face]
const HEAD = [
  [-.104, .004, .004, .004, .058], [-.1, .022, .017, .019, .056], [-.092, .036, .028, .035, .052], [-.08, .047, .039, .049, .046],
  [-.064, .058, .05, .064, .038], [-.043, .0665, .062, .08, .028], [-.018, .0725, .076, .096, .011], [.008, .076, .084, .1, .003],
  [.038, .078, .089, .1, 0], [.068, .0745, .086, .094, -.002], [.096, .063, .071, .078, -.004], [.115, .043, .047, .052, -.005],
  [.126, .013, .015, .016, -.005], [.1275, .0004, .0004, .0004, -.005],
];
const LIPS = -.058;                                  // the line between the lips
const HN = 72, HPSI = Array.from({ length: HN }, (_, i) => { const s = i / HN * Math.PI * 2; return s - .6 * Math.sin(s); });   // columns crowd towards the face
const HY = [-.104, -.1005, -.0965, -.092, -.088, -.084, -.08, -.076];
for (let k = -8; k <= 6; k++) HY.push(LIPS + .002 * k);             // fine rows over the face, finest at the mouth, one exactly on the lip line
for (let k = 0; k < 25; k++) HY.push(-.0425 + .0035 * k);
HY.push(.05, .06, .072, .084, .096, .106, .115, .1215, .126, .1275);
// Where the hair starts, by angle round from the face: forehead, temple, sideburn, over the ear, down to the nape.
const HAIRLINE = [[0, .088], [.6, .085], [.95, .072], [1.12, .036], [1.22, -.012], [1.36, -.01], [1.5, .026], [1.85, .026], [2.05, -.03], [2.4, -.056], [3.1416, -.064]];
const _row = [], _hl = [];
const fromFace = psi => Math.abs(psi > Math.PI ? psi - 2 * Math.PI : psi);
const hairAt = (psi, y) => y - at(HAIRLINE, fromFace(psi), _hl)[1];
const bandY = psi => .064 + .014 * Math.cos(psi);
const browY = az => .0315 + .0035 * bell((az - .03) / .03);

function skull(y, psi, o, grow = 0) {
  const q = at(HEAD, y, _row), c = Math.cos(psi);
  o.x = q[4] + c * ((c > 0 ? q[2] : q[3]) + grow); o.y = y; o.z = -Math.sin(psi) * (q[1] + grow);
}
/** How far the face stands out from the skull at (distance from the centre line, height). */
function face(az, y) {
  let d = .0045 * bell((y - .031) / .02) * bell(az / .07);                // brow ridge
  d -= .008 * blob(az - .031, y - .008, .023, .0155);                     // eye sockets
  const nu = (y + .031) / .058;                                           // nose: 0 at the tip, 1 between the brows
  if (nu > -.25 && nu < 1.15) {
    const ridge = nu < 0 ? .022 * bell(nu / .25) : lerp(.022, .003, Math.pow(Math.min(nu, 1), .75)) * (1 - sstep(1, 1.15, nu));
    d += ridge * bell(az / lerp(.0108, .0058, clamp(nu, 0, 1)));
  }
  d += .004 * blob(az, y + .03, .01, .008);                               // tip of the nose
  d += .008 * blob(az - .0125, y + .0335, .008, .008);                    // nostrils
  d += .004 * blob(az - .05, y + .01, .03, .028);                         // cheekbones
  d += .005 * blob(az, y - LIPS, .036, .026);                             // the mouth sits on a mound
  d += .0046 * bell(az / .027) * bell((y - LIPS - .0058) / .0068);        // upper lip
  d += .0055 * bell(az / .023) * bell((y - LIPS + .0066) / .0075);        // lower lip
  d -= .004 * bell(az / .028) * bell((y - LIPS) / .0032);                 // the line between them
  d -= .0012 * bell(az / .007) * bell((y - LIPS - .013) / .006);          // the dent under the nose
  d -= .0025 * bell(az / .03) * bell((y - LIPS + .018) / .007);           // the crease under the lip
  d += .006 * blob(az, y + .089, .03, .017);                              // chin
  return d;
}
const dye = (o, w, r, g, b) => { o.r *= lerp(1, r, w); o.g *= lerp(1, g, w); o.b *= lerp(1, b, w); };
/** Expressions move the face the way muscles do. e = 1: effort (jaw drops, brows pinch). e = 2: smile. */
function express(o, e) {
  const az = Math.abs(o.z), sz = Math.sign(o.z), y = o.y, line = bell(az / .03) * bell((y - LIPS) / .004);
  if (e === 1) {
    const w = sstep(LIPS + .003, LIPS - .005, y) * sstep(.02, .045, o.x), a = .1 * w, dx = o.x, dy = y + .02;
    o.x = dx * Math.cos(a) + dy * Math.sin(a); o.y = -.02 - dx * Math.sin(a) + dy * Math.cos(a);          // the jaw swings on its hinge
    o.x -= .007 * line; o.y -= .002 * line;
    const brow = blob(az - .028, y - .031, .04, .02);
    o.y -= .0035 * brow; o.z -= sz * .002 * brow;
    o.y += .002 * blob(az - .04, y + .003, .03, .02);
  } else {
    const corner = blob(az - .027, y - LIPS, .016, .013), cheek = blob(az - .042, y + .024, .028, .022);
    o.y += .0065 * corner + .003 * cheek; o.x += .003 * cheek - .004 * corner - .006 * line; o.z += sz * .003 * corner;
    o.y -= .003 * bell(az / .024) * bell((y - LIPS + .0075) / .008);
  }
}
function headPoint(j, i, o, e) {
  const y = HY[j], psi = HPSI[i], front = sstep(0, .3, Math.cos(psi));
  skull(y, psi, o);
  if (front > 0) {
    const az = Math.abs(o.z);
    o.x += face(az, y) * front;
    dye(o, Math.min(1, 1.5 * bell((y - browY(az)) / (.0074 * (1 - .45 * sstep(.03, .058, az))))) * sstep(.005, .012, az) * (1 - sstep(.047, .06, az)), .1, .09, .1);                          // eyebrows
    dye(o, Math.min(1, 1.5 * Math.sqrt(bell(az / .0275)) * Math.max(bell((y - LIPS - .0056) / .0062), bell((y - LIPS + .0068) / .0078))), .66, .42, .42);   // lips
    dye(o, bell(az / .029) * bell((y - LIPS) / .0022), .22, .14, .14);
    dye(o, blob(az - .007, y + .0395, .0042, .0032), .32, .24, .22);                                                                  // nostrils
    dye(o, .24 * blob(az - .031, y - .013, .026, .018), .55, .5, .5);                                                                 // shade in the sockets
    dye(o, .3 * blob(az - .045, y + .022, .03, .024) + .2 * blob(az, y + .03, .013, .011), 1, .82, .8);                               // warmth in the cheeks and nose
    o.y += .0016 * blob(az - .026, y - LIPS, .012, .01);          // the corners of the mouth sit a touch high: a face at ease
    if (e) express(o, e);
  }
  dye(o, sstep(-.012, .004, hairAt(psi, y)), .2, .19, .2);      // the scalp shades into the hair, so a short cut fades into the skin
}
const HAIR_Y = [-.07, -.056, -.042, -.028, -.014, 0, .014, .026, .038, .05, .062, .074, .085, .095, .104, .112, .1185, .1235, .1265, .1275], HAIR_N = 64;
function hairPoint(j, i, o) {
  const y = HAIR_Y[j], psi = i / HAIR_N * Math.PI * 2, k = hairAt(psi, y), top = sstep(.04, .1, y);
  const n = Math.sin(psi * 17 + y * 60) * .5 + Math.sin(psi * 31 - y * 110 + 1.7) * .3 + Math.sin(psi * 9 + y * 190) * .2;    // clumps
  skull(y, psi, o);
  let th = (lerp(.004, .0135, top) + .007 * top * bell(fromFace(psi) / 1.3)) * (1 - .7 * bell((y - bandY(psi)) / .022)) * (1 + .3 * n);
  th = Math.min(th, Math.max(0, k) * .8 + .0008);
  const dx = o.x + .002, dy = o.y - .03, f = th / (Math.hypot(dx, dy, o.z) || 1);
  o.x += dx * f; o.y += dy * f; o.z += o.z * f;
  o.k = k; o.r = o.g = o.b = 1 + .3 * n;
}
const BAND = [[-.0175, .003], [-.013, .0075], [0, .009], [.013, .0075], [.0175, .003]], BAND_N = 48;
function bandPoint(j, i, o) { const psi = i / BAND_N * Math.PI * 2; skull(bandY(psi) + BAND[j][0], psi, o, BAND[j][1]); }

function eyeTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d'), w = g.createLinearGradient(0, 0, 0, 128);
  w.addColorStop(0, '#9c8c84'); w.addColorStop(.38, '#ddd3cb'); w.addColorStop(.6, '#e2d9d1'); w.addColorStop(1, '#a8968d');
  g.fillStyle = w; g.fillRect(0, 0, 256, 128);
  g.translate(128, 64); g.scale(.68, 1);                  // the eyeball is wider than it is tall, so the iris is drawn narrow to come out round
  const ir = g.createRadialGradient(0, 0, 2, 0, 0, 22);
  ir.addColorStop(0, '#3d2313'); ir.addColorStop(.55, '#4c2c16'); ir.addColorStop(.86, '#2a170c'); ir.addColorStop(1, '#100805');
  g.fillStyle = ir; g.beginPath(); g.arc(0, 0, 22, 0, 7); g.fill();
  g.fillStyle = '#040202'; g.beginPath(); g.arc(0, 0, 9, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(8, -8, 3.4, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  return t;
}

function makeHead(skin, hair, band) {
  const g = new THREE.Group(), eyes = [];
  const add = (geo, mat, parent = g) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; parent.add(m); return m; };
  const mesh = add(shell(HY.length, HN, headPoint, 2), skin);
  add(shell(HAIR_Y.length, HAIR_N, hairPoint), hair);
  add(shell(BAND.length, BAND_N, bandPoint), band);

  const ball = new THREE.SphereGeometry(1, 20, 12), lidGeo = edge => {
    const geo = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), p = geo.attributes.position, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = lerp(edge, 1, sstep(0, .3, p.getY(i)));   // the lash line
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return geo;
  };
  const upGeo = lidGeo(.22), loGeo = lidGeo(.7), tex = eyeTexture();
  const earGeo = white(new THREE.SphereGeometry(1, 12, 10)), earIn = white(new THREE.SphereGeometry(1, 10, 8), .42, .3, .3);
  for (const s of [1, -1]) {
    const eye = new THREE.Group(), map = tex.clone(); map.needsUpdate = true;
    eye.position.set(.0662, .008, s * .0315); eye.rotation.y = -s * .22; g.add(eye);
    add(ball, new THREE.MeshStandardMaterial({ map, roughness: .14 }), eye).scale.set(.012, .012, .0175);
    const lid = (geo, flip) => { const piv = new THREE.Group(), m = add(geo, skin, piv); m.scale.set(.0131, .0131, .019); m.rotation.x = flip; eye.add(piv); return piv; };
    eyes.push({ map, up: lid(upGeo, 0), lo: lid(loGeo, Math.PI) });
    const ear = add(earGeo, skin); ear.scale.set(.0125, .029, .0065); ear.position.set(-.007, -.006, s * .0755); ear.rotation.set(0, s * .38, -.12);
    const inner = add(earIn, skin, ear); inner.scale.set(.5, .55, .6); inner.position.set(.14, -.06, s * .56);
  }
  return { g, mesh, eyes };
}

const LIFE0 = { breath: 0, blink: 0, effort: 0, smile: 0, gaze: 0, gazeY: 0, sweat: 0 };

/* ---------------------------------------------------------------- figure -- */
export class Figure {
  constructor() {
    this.group = new THREE.Group();
    this.mats = {}; this.w = {};
    this.coral = new THREE.Color(COL.coral);
    const std = (color, roughness, extra) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
    const part = (name, mat, cloth = 0) => {
      mat.userData.base = mat.color.clone(); mat.userData.cloth = cloth;
      (this.mats[name] = this.mats[name] || []).push(mat); this.w[name] = 0;
      return mat;
    };
    this.skins = [];
    const skin = name => part(name, this.skins[this.skins.length] = skinLight(new THREE.MeshPhysicalMaterial({ color: COL.skin, roughness: .58, vertexColors: true, sheen: .18, sheenColor: 0xffb696, sheenRoughness: .5 })));
    const top = name => part(name, cutout(std(COL.top, .86)), 1);
    const shorts = std(COL.shorts, .88), sole = std(COL.sole, .7), sock = std(COL.sock, .9);
    const hair = cutout(std(COL.hair, .5, { vertexColors: true }));
    const shoe = std(COL.volt, .5, { emissive: COL.volt, emissiveIntensity: .12 });
    const sHead = skin('head'), sArmU = skin('armU'), sArmL = skin('armL'), sThigh = skin('thigh'), sShin = skin('shin');

    // torso, and the top that hangs over it
    const TS = 40, TR = this.TR = bake(TORSO, .02, TS, TORSO_M, 1, .92);
    this.torso = new Tube(TR.length, TS, [shorts, skin('core'), skin('chest')], [cut(TR, .1), cut(TR, .31)]).set('color', shade(TR, TS, TORSO_T), 3);
    const soft = bake(TORSO, .02, TS, TORSO_M.map(b => [b[0], b[1], b[2], b[3], b[4] * .75]), 1, .92), cover = [];
    this.SR = TR.map((r, k) => {
      if (r.t < .04) return null;
      const h = r.t, xy = new Float32Array(TS * 2), hang = at(SHIRT, Math.min(h, .38)), loose = 1 - sstep(.2, .38, h);
      for (let i = 0; i < TS; i++) {
        const a = i / TS * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), x = soft[k].xy[i * 2], y = soft[k].xy[i * 2 + 1], rad = Math.hypot(x, y);
        const f = (Math.max(rad + .007, Math.hypot(c * hang[1], s * (s >= 0 ? hang[2] : hang[3]))) + .002 * Math.sin(a * 6 + h * 37) * loose) / rad;
        xy[i * 2] = x * f; xy[i * 2 + 1] = y * f;
        const neck = Math.hypot(x / .095, (.548 - h) / (y >= 0 ? .115 : .065)) - 1;                       // scooped in front, higher behind
        const arm = Math.max(Math.hypot((h - .455) / .1, y / .085) - 1, (.136 - Math.abs(x)) / .09);      // open round each shoulder
        cover.push(Math.min(neck, arm));
      }
      return { xy, sag: .018 * loose };
    });
    const s0 = this.SR.findIndex(Boolean);
    this.shirt = new Tube(TR.length - s0, TS, [top('core'), top('chest')], [cut(TR, .31) - s0]).set('cover', new Float32Array(cover), 1);

    const NR = this.NR = bake(NECK, .1, 16, NECK_M);
    this.neck = new Tube(NR.length, 16, sHead).set('color', shade(NR, 16, NECK_T), 3);
    this.head = makeHead(sHead, hair, shoe);

    const cuffR = this.cuffR = bake(CUFF, .07, 18);
    this.arms = [1, -1].map(s => {
      const rings = bake(ARM, .07, 16, ARM_M, s);
      return { rings, tube: new Tube(rings.length, 16, [sArmU, sArmL], [cut(rings, 1)]).set('color', shade(rings, 16, ARM_T, s), 3), hand: makeHand(s, sArmL) };
    });
    this.legs = [1, -1].map(s => {
      const rings = bake(LEGP, .07, 18, LEG_M, s);
      return {
        rings, tube: new Tube(rings.length, 18, [sThigh, sShin, sock], [cut(rings, 1), cut(rings, SOCK)]).set('color', shade(rings, 18, LEG_T, s), 3),
        cuff: new Tube(cuffR.length, 18, shorts), foot: makeFoot(shoe, sole),
      };
    });
    this.group.add(this.torso.mesh, this.shirt.mesh, this.neck.mesh, this.head.g);
    for (const a of this.arms) this.group.add(a.tube.mesh, a.hand.g);
    for (const l of this.legs) this.group.add(l.tube.mesh, l.cuff.mesh, l.foot.g);

    this.J = {};
    for (const k of ['W', 'C', 'dLo', 'dHi', 'pS', 'pF', 'pU', 'cS', 'cF', 'cU', 'head', 'hU', 'hF', 'hS', 'nA', 'nB', 'nD', 'sh', 'el', 'ha', 'hip', 'kn', 'an', 'pole', 'x', 'y', 'z']) this.J[k] = V();
  }

  update(p, life = LIFE0) {
    const J = this.J, P = p.pelvis, br = life.breath;
    ik2(P, p.chest, B.spineLo, B.spineHi, p.spine, J.W, J.C);
    J.dLo.subVectors(J.W, P).normalize(); J.dHi.subVectors(J.C, J.W).normalize();
    frame(J.pS, J.pF, J.pU, J.dLo, p.twist.x, p.tilt.x);
    frame(J.cS, J.cF, J.cU, J.dHi, p.twist.y, p.tilt.y);

    // head: the neck sets where it sits; `look` turns, nods and tilts it from there
    J.hU.copy(p.head); if (J.hU.lengthSq() < 1e-6) J.hU.copy(J.cU); J.hU.normalize();
    J.head.copy(J.C).addScaledVector(J.hU, B.neck);
    J.hF.copy(J.cF).addScaledVector(J.hU, -J.cF.dot(J.hU)); if (J.hF.lengthSq() < 1e-6) J.hF.copy(J.cU).negate(); J.hF.normalize();
    J.hS.crossVectors(J.hF, J.hU);
    const yaw = p.look.x, nod = p.look.y, roll = p.look.z;
    J.hF.multiplyScalar(Math.cos(yaw)).addScaledVector(J.hS, Math.sin(yaw)); J.hS.crossVectors(J.hF, J.hU);
    _a.copy(J.hU);
    J.hU.multiplyScalar(Math.cos(nod)).addScaledVector(J.hF, -Math.sin(nod));
    J.hF.multiplyScalar(Math.cos(nod)).addScaledVector(_a, Math.sin(nod));
    _a.copy(J.hS);
    J.hS.multiplyScalar(Math.cos(roll)).addScaledVector(J.hU, Math.sin(roll));
    J.hU.multiplyScalar(Math.cos(roll)).addScaledVector(_a, -Math.sin(roll));
    this.head.g.position.copy(J.head);
    this.head.g.quaternion.setFromRotationMatrix(_m.makeBasis(J.hF, J.hU, J.hS));

    // face: lids blink and narrow, the eyes move, effort and a smile shape the mouth and brows
    const effort = clamp(life.effort || 0, 0, 1), smile = clamp(life.smile || 0, 0, 1), narrow = clamp(.5 * effort + .45 * smile, 0, 1);
    for (const e of this.head.eyes) {
      e.up.rotation.z = lerp(.4, -.46, Math.max(life.blink, .2 * narrow));
      e.lo.rotation.z = lerp(-.38, -.2, narrow) + .08 * life.blink;
      e.map.offset.set((life.gaze || 0) / (2 * Math.PI), -(life.gazeY || 0) / Math.PI);
    }
    const mt = this.head.mesh.morphTargetInfluences; mt[0] = effort; mt[1] = smile;
    const rough = lerp(.58, .4, clamp(life.sweat || 0, 0, 1));          // hard work puts a shine on the skin
    for (const m of this.skins) m.roughness = rough;

    // neck: from inside the collar to inside the jaw
    J.nA.copy(J.C).addScaledVector(J.cU, -.07); J.nB.copy(J.head).addScaledVector(J.hU, -.06);
    J.nD.subVectors(J.nB, J.nA).normalize();
    const N = this.neck; N.begin();
    for (const q of this.NR) {
      _c.lerpVectors(J.nA, J.nB, q.t);
      _u.copy(J.cS).lerp(J.hS, q.t); _u.addScaledVector(J.nD, -_u.dot(J.nD)).normalize();
      _v.crossVectors(J.nD, _u);
      N.put(_c, _u, _v, q.xy);
    }
    N.end();

    // torso: one skin from the hips to the neck, turning from the pelvis frame to the chest frame, with the top draped over it
    const T = this.torso, S = this.shirt; T.begin(); S.begin();
    for (let k = 0; k < this.TR.length; k++) {
      const g = this.TR[k], q = g.q, b = br * q[6], cl = this.SR[k];
      chain(P, J.W, J.dLo, J.dHi, B.spineLo, g.t, .14, _c, _t);
      if (q[7]) _c.lerp(_p.copy(J.nA).addScaledVector(J.nD, g.t - SPINE + .07), q[7]);
      _u.copy(J.pS).lerp(J.cS, q[5]); _u.addScaledVector(_t, -_u.dot(_t)).normalize();
      _v.crossVectors(_t, _u);
      _c.addScaledVector(_v, q[4] + .004 * b);
      T.put(_c, _u, _v, g.xy, 1 + .012 * b, 1 + .04 * b);
      if (cl) {
        _a.set(_t.x * _t.y, _t.y * _t.y - 1, _t.z * _t.y);              // gravity, less the part that runs along the spine: cloth hangs that way
        S.put(_c, _u, _v, cl.xy, 1 + .012 * b, 1 + .04 * b, _a.dot(_u), _a.dot(_v), cl.sag);
      }
    }
    T.end(); S.end();

    for (let i = 0; i < 2; i++) {
      const s = i ? -1 : 1, A = this.arms[i], L = this.legs[i];

      // shoulder: lifts and draws in as the arm goes overhead, plus whatever shrug the pose asks for
      const tgt = i ? p.hB : p.hA, so = i ? p.sB : p.sA;
      J.sh.copy(J.C).addScaledVector(J.cU, -.045).addScaledVector(J.cS, s * B.shW);
      _a.subVectors(tgt, J.sh).normalize();
      const raise = ease(_a.dot(J.cU) / .9);
      J.sh.addScaledVector(J.cF, so.x).addScaledVector(J.cU, so.y + .045 * raise + .005 * br).addScaledVector(J.cS, s * (so.z - .025 * raise));
      ik2(J.sh, tgt, B.armU, B.armL, i ? p.eB : p.eA, J.el, J.ha, J.pole);

      // hand: follows the forearm unless the pose aims the fingers (g) or the palm (n)
      const g = i ? p.gB : p.gA, n = i ? p.nB : p.nA;
      J.x.subVectors(J.ha, J.el).normalize().multiplyScalar(1 - Math.min(1, g.length())).add(g);
      if (J.x.lengthSq() < 1e-6) J.x.subVectors(J.ha, J.el);
      J.x.normalize();
      J.y.copy(J.cS).multiplyScalar(s * (1 - Math.min(1, n.length()))).sub(n);      // back of the hand = opposite the palm
      J.y.addScaledVector(J.x, -J.y.dot(J.x));
      if (J.y.lengthSq() < 1e-6) J.y.copy(J.cF).addScaledVector(J.x, -J.cF.dot(J.x));
      J.y.normalize();
      J.z.crossVectors(J.x, J.y);
      A.hand.g.position.copy(J.ha);
      A.hand.g.quaternion.setFromRotationMatrix(_m.makeBasis(J.x, J.y, J.z));
      setHand(A.hand, clamp(i ? p.grip.y : p.grip.x, 0, 1));
      if (J.y.dot(J.pole) < 0) J.y.negate();
      loftLimb(A.tube, J.sh, J.el, J.ha, J.pole, A.rings, .04, 1, J.y);

      J.hip.copy(P).addScaledVector(J.pU, -.03).addScaledVector(J.pS, s * B.hipW);
      const foot = i ? p.fB : p.fA, knee = i ? p.kB : p.kA;
      ik2(J.hip, foot, B.thigh, B.shin, knee, J.kn, J.an, J.pole);
      if (J.kn.y < .1) {                                                  // a knee never sinks into the floor: swing it up instead
        _a.copy(knee).normalize(); _a.y += 2 * (.1 - Math.max(0, J.kn.y)) / .1;
        ik2(J.hip, foot, B.thigh, B.shin, _a, J.kn, J.an, J.pole);
      }
      loftLimb(L.tube, J.hip, J.kn, J.an, J.pole, L.rings, .05, 1.25);
      loftLimb(L.cuff, J.hip, J.kn, J.an, J.pole, this.cuffR, .05, 1.25);

      // foot: aimed by the pose; the toes bend so they never go through the floor
      const t = i ? p.tB : p.tA;
      J.x.copy(t); if (J.x.lengthSq() < 1e-6) J.x.set(1, 0, 0); J.x.normalize();
      J.y.set(.25, 1, 0).addScaledVector(J.x, -(J.x.x * .25 + J.x.y)).normalize();
      J.z.crossVectors(J.x, J.y);
      L.foot.g.position.copy(J.an);
      L.foot.g.quaternion.setFromRotationMatrix(_m.makeBasis(J.x, J.y, J.z));
      const hy = J.an.y + J.x.y * FOOT.ball - J.y.y * FOOT.sole;
      L.foot.toe.rotation.z = J.x.y < 0 && hy + J.x.y * FOOT.toe < 0
        ? clamp(Math.asin(clamp(-hy / FOOT.toe, -1, 1)) - Math.asin(clamp(J.x.y, -1, 1)), 0, 1.4) : 0;
    }
  }

  /** Glow the working muscles (cloth over them takes less of the colour than skin does). */
  highlight(target, k, pulse) {
    for (const name in this.w) {
      const w = this.w[name] = lerp(this.w[name], target[name] || 0, k);
      for (const mat of this.mats[name]) {
        mat.color.copy(mat.userData.base).lerp(this.coral, w * (mat.userData.cloth ? .22 : .3));        // a flush, not paint: it still reads as skin
        mat.emissive.copy(this.coral).multiplyScalar(w * (.03 + .15 * pulse));
      }
    }
  }
}
