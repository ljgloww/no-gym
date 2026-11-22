// scene.js — the 3D stage: a clay athlete that performs each movement.
// Every pose is described by a few key points (pelvis, chest, hands, feet);
// two-bone IK fills in the elbows, knees and spine so hands and feet stay planted.
import * as THREE from '../vendor/three.module.min.js';

const COL = {
  ink: 0x0a0b0d, volt: 0xd4ff3a, coral: 0xff5b3a, gold: 0xffc83a,
  body: 0xe9e3d6, shorts: 0x1f232a, metal: 0xb4bcc8, plat: 0x15181d, dim: 0x2a2f37,
};
// Body proportions in metres.
const B = { thigh: .44, shin: .44, spineLo: .22, spineHi: .30, armU: .29, armL: .27, shW: .19, hipW: .10, neck: .2 };
const LEG = B.thigh + B.shin;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const Y = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

/** Two-bone IK: from root `a` towards target `c`; writes the middle joint and the (reach-clamped) end. */
function ik2(a, c, l1, l2, pole, outMid, outEnd) {
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
}

function seg(mesh, a, b, f = .5) {
  mesh.position.lerpVectors(a, b, f);
  _d.subVectors(b, a);
  const l = _d.length();
  if (l > 1e-6) mesh.quaternion.setFromUnitVectors(Y, _d.divideScalar(l));
}

/* ---------------------------------------------------------------- poses --
   Figure faces +x, y is up. "A" is the side nearest the camera (+z), "B" the far side.
   h = hand target, f = ankle target, e/k = elbow/knee pole, t = toe direction. */
const POSE_KEYS = ['pelvis', 'chest', 'hA', 'hB', 'fA', 'fB', 'eA', 'eB', 'kA', 'kB', 'tA', 'tB', 'head', 'spine'];
const makePose = () => Object.fromEntries(POSE_KEYS.map(k => [k, new THREE.Vector3()]));
const copyPose = (dst, src) => { for (const k of POSE_KEYS) dst[k].copy(src[k]); };
const lerpPose = (out, a, b, t) => { for (const k of POSE_KEYS) out[k].lerpVectors(a[k], b[k], t); };

function base(p) {
  p.eA.set(-1, -.3, .4); p.eB.set(-1, -.3, -.4);
  p.kA.set(1, .2, .05); p.kB.set(1, .2, -.05);
  p.tA.set(1, 0, 0); p.tB.set(1, 0, 0);
  p.head.set(0, .35, 0); p.spine.set(-1, 0, 0);
}

/** Straight plank body: toes at (ax, .19), shoulders at height sy. Returns shoulder x. */
function plankLine(p, sy, ax) {
  const ay = .19, L = 1.38;
  const sx = ax + Math.sqrt(L * L - (sy - ay) ** 2);
  const f = LEG * .995 / L;
  p.chest.set(sx, sy, 0);
  p.pelvis.set(lerp(ax, sx, f), lerp(ay, sy, f), 0);
  p.fA.set(ax, ay, .09); p.fB.set(ax, ay, -.09);
  p.tA.set(.35, -1, 0); p.tB.set(.35, -1, 0);
  p.kA.set(0, -1, 0); p.kB.set(0, -1, 0);
  p.spine.set(0, 1, 0);
  return sx;
}

function pushup(p, u) {
  base(p);
  const d = Math.sin(Math.PI * u) ** 2;
  plankLine(p, lerp(.59, .215, d), -.9);
  p.hA.set(.44, .05, .25); p.hB.set(.44, .05, -.25);
  p.eA.set(-1, .15, .85); p.eB.set(-1, .15, -.85);
  p.head.set(.55, .5, 0);
}

function plank(p, u, c) {
  base(p);
  const br = Math.sin(c.t * 2.1) * .007;
  const jx = Math.sin(c.t * 33) * .004 * c.k, jy = Math.sin(c.t * 29 + 1) * .005 * c.k;
  const sx = plankLine(p, .365 + br + jy, -.96);
  p.chest.x += jx;
  p.hA.set(sx + .26, .05, .15); p.hB.set(sx + .26, .05, -.15);
  p.eA.set(-.25, -1, .1); p.eB.set(-.25, -1, -.1);
  p.head.set(.6, .3, 0);
}

function squat(p, u) {
  base(p);
  const d = Math.sin(Math.PI * u) ** 2;
  const lean = lerp(.02, .62, d);
  p.pelvis.set(lerp(0, -.24, d), lerp(.94, .5, d), 0);
  p.chest.set(p.pelvis.x + Math.sin(lean) * .513, p.pelvis.y + Math.cos(lean) * .513, 0);
  const hx = lerp(.04, p.chest.x + .52, d), hy = lerp(.92, p.chest.y + .02, d), hz = lerp(.27, .15, d);
  p.hA.set(hx, hy, hz); p.hB.set(hx, hy, -hz);
  p.fA.set(.02, .08, .15); p.fB.set(.02, .08, -.15);
  p.kA.set(1, .1, .25); p.kB.set(1, .1, -.25);
  p.head.set(.3, .6, 0);
}

function lunge(p, u, c) {
  base(p);
  const lead = c.rep % 2 === 0;                       // alternate the leading leg each rep
  const down = clamp(u / .42, 0, 1), up = clamp((u - .58) / .42, 0, 1);
  const s = ease(down) * (1 - ease(up));
  const lift = (Math.sin(Math.PI * down) + Math.sin(Math.PI * up)) * .1;
  p.pelvis.set(.3 * s, lerp(.94, .5, s), 0);
  p.chest.set(p.pelvis.x + .03, p.pelvis.y + .513, 0);
  const F = lead ? p.fA : p.fB, R = lead ? p.fB : p.fA, z = lead ? 1 : -1;
  F.set(.64 * s, .08 + lift, z * .11);
  R.set(-.04, .08 + .09 * s, -z * .11);
  (lead ? p.tB : p.tA).set(1, -1.6 * s, 0);
  (lead ? p.kA : p.kB).set(1, .5, 0);
  (lead ? p.kB : p.kA).set(lerp(1, .4, s), lerp(.2, -1, s), 0);
  p.hA.set(p.pelvis.x + .02, p.pelvis.y + .1, .2); p.hB.set(p.pelvis.x + .02, p.pelvis.y + .1, -.2);
  p.eA.set(-.4, 0, 1); p.eB.set(-.4, 0, -1);
}

function pullup(p, u, c) {
  base(p);
  const d = Math.sin(Math.PI * u) ** 2, sw = Math.sin(c.t * 1.3) * .012;
  p.chest.set(lerp(0, -.14, d) + sw, lerp(1.705, 2.1, d), 0);
  p.pelvis.set(p.chest.x + lerp(.01, .07, d) + sw, p.chest.y - .511, 0);
  p.hA.set(0, 2.25, .31); p.hB.set(0, 2.25, -.31);
  p.eA.set(-.2, -1, .9); p.eB.set(-.2, -1, -.9);
  const fx = p.pelvis.x - lerp(.1, .2, d), fy = p.pelvis.y - lerp(.85, .78, d);
  p.fA.set(fx, fy, .08); p.fB.set(fx - .03, fy + .02, -.08);
  p.tA.set(.4, -1, 0); p.tB.set(.4, -1, 0);
  p.head.set(.15, lerp(.35, .7, d), 0);
}

function hang(p, u, c) {
  pullup(p, 0, c);
  const sw = Math.sin(c.t * 1.1) * (.012 + .02 * c.k);
  p.pelvis.x += sw;
  p.fA.set(p.pelvis.x + sw * 1.6 - .06, p.pelvis.y - .86, .08);
  p.fB.set(p.pelvis.x + sw * 1.6 - .06, p.pelvis.y - .86, -.08);
}

function dip(p, u) {
  base(p);
  const d = Math.sin(Math.PI * u) ** 2, HB = 1.09;
  p.chest.set(lerp(.02, .13, d), lerp(HB + .545, HB + .2, d), 0);
  p.pelvis.set(lerp(-.03, -.01, d), p.chest.y - lerp(.512, .495, d), 0);
  p.hA.set(0, HB, .3); p.hB.set(0, HB, -.3);
  p.eA.set(-1, .15, .2); p.eB.set(-1, .15, -.2);
  const fy = p.pelvis.y - lerp(.42, .36, d);
  p.fA.set(p.pelvis.x - .38, fy, .08); p.fB.set(p.pelvis.x - .38, fy + .03, -.08);
  p.kA.set(.6, -.8, 0); p.kB.set(.6, -.8, 0);
  p.tA.set(-.2, -1, 0); p.tB.set(-.2, -1, 0);
  p.head.set(.2, .5, 0);
}

function walk(p, u) {
  base(p);
  const a = u * Math.PI * 2;
  p.pelvis.set(0, .915 + Math.cos(a * 2) * .016, 0);
  p.chest.set(.035, p.pelvis.y + .512, 0);
  for (let i = 0; i < 2; i++) {
    const s = i ? -1 : 1, ph = (u + (i ? .5 : 0)) % 1;
    const f = i ? p.fB : p.fA, t = i ? p.tB : p.tA, h = i ? p.hB : p.hA, e = i ? p.eB : p.eA;
    if (ph < .6) {
      const q = ph / .6, heel = Math.max(0, q - .8);
      f.set(lerp(.27, -.27, q), .08 + heel * .25, s * .1);
      t.set(1, -heel * 2.5, 0);
    } else {
      const q = (ph - .6) / .4;
      f.set(lerp(-.27, .27, ease(q)), .08 + Math.sin(Math.PI * q) * .12 + (1 - q) * .05, s * .1);
      t.set(1, lerp(-.5, .25, q), 0);
    }
    const th = -Math.cos(ph * Math.PI * 2 + .3) * .5;      // arm swings opposite to its leg
    const reach = .5 - Math.max(0, Math.sin(th)) * .08;
    h.set(p.chest.x + Math.sin(th) * reach, p.chest.y - .035 - Math.cos(th) * reach, s * .25);
    e.set(-1, -.2, s * .3);
  }
  p.head.set(.1, .4, 0);
}

function stretch(p, u) {
  base(p);
  const k = lerp(.3, 1, ease(.5 - .5 * Math.cos(u * Math.PI * 2)));
  const th = lerp(1.25, 2.36, k);
  p.pelvis.set(lerp(-.07, -.13, k), .93, 0);
  p.chest.set(p.pelvis.x + Math.sin(th) * .512, p.pelvis.y + Math.cos(th) * .512, 0);
  const hx = lerp(.44, .19, k), hy = lerp(.6, .1, k);
  p.hA.set(hx, hy, .13); p.hB.set(hx, hy, -.13);
  p.fA.set(0, .08, .1); p.fB.set(0, .08, -.1);
  p.eA.set(-.3, .3, 1); p.eB.set(-.3, .3, -1);
  p.kA.set(1, .1, 0); p.kB.set(1, .1, 0);
  p.head.set(0, lerp(.2, -.4, k), 0);
  p.spine.set(-.4, 1, 0);
}

function victory(p, u, c) {
  base(p);
  const y = Math.abs(Math.sin(c.t * 6.2)) * .15, pump = Math.sin(c.t * 12.4) * .03;
  p.pelvis.set(0, .93 + y, 0); p.chest.set(0, 1.443 + y, 0);
  p.hA.set(.03, 1.93 + y + pump, .37); p.hB.set(.03, 1.93 + y - pump, -.37);
  p.eA.set(.1, -.3, 1); p.eB.set(.1, -.3, -1);
  const fy = .08 + Math.max(0, y - .03) * .95;
  p.fA.set(0, fy, .13); p.fB.set(0, fy, -.13);
  p.tA.set(1, -y * 3, 0); p.tB.set(1, -y * 3, 0);
  p.head.set(0, .5, 0);
}

// Burpee: keyframed through stand → crouch → plank → crouch → jump.
const sides = (p, key, x, y, z) => { p[key + 'A'].set(x, y, z); p[key + 'B'].set(x, y, -z); };
function kStand(p) { base(p); p.pelvis.set(0, .94, 0); p.chest.set(.01, 1.453, 0); sides(p, 'h', .04, .92, .27); sides(p, 'f', 0, .08, .11); }
function kCrouch(p) {
  base(p); p.pelvis.set(-.12, .4, 0); p.chest.set(.3, .58, 0);
  sides(p, 'h', .44, .05, .25); sides(p, 'f', 0, .1, .13); sides(p, 't', 1, -.2, 0);
  sides(p, 'e', -.6, .3, 1); sides(p, 'k', 1, .5, .3); p.head.set(.5, .4, 0); p.spine.set(-.6, 1, 0);
}
function kPlank(p) { base(p); plankLine(p, .59, -.9); sides(p, 'h', .44, .05, .25); sides(p, 'e', -1, .15, .85); p.head.set(.55, .5, 0); }
function kPlankLow(p) { base(p); plankLine(p, .4, -.9); sides(p, 'h', .44, .05, .25); sides(p, 'e', -1, .15, .85); p.head.set(.55, .5, 0); }
function kExtend(p) { base(p); p.pelvis.set(0, .97, 0); p.chest.set(0, 1.483, 0); sides(p, 'h', .2, 1.75, .2); sides(p, 'f', 0, .11, .11); sides(p, 't', 1, -.5, 0); sides(p, 'e', .6, -.6, .8); }
function kApex(p) { base(p); p.pelvis.set(0, 1.3, 0); p.chest.set(0, 1.813, 0); sides(p, 'h', .05, 2.36, .2); sides(p, 'f', 0, .44, .11); sides(p, 't', .5, -1, 0); sides(p, 'e', .5, 0, 1); sides(p, 'k', 1, 0, 0); p.head.set(0, .5, 0); }
function kLand(p) { base(p); p.pelvis.set(-.05, .86, 0); p.chest.set(.05, 1.36, 0); sides(p, 'h', .12, .86, .27); sides(p, 'f', 0, .08, .11); }
const BURPEE = [
  [0, kStand, 0], [.15, kCrouch, 0], [.29, kPlank, 0], [.37, kPlankLow, 0], [.45, kPlank, 0],
  [.58, kCrouch, 0], [.69, kExtend, 1], [.8, kApex, 2], [.91, kLand, 1], [1, kStand, 0],
];
const _k0 = makePose(), _k1 = makePose();
function burpee(p, u) {
  let i = 1;
  while (i < BURPEE.length - 1 && u > BURPEE[i][0]) i++;
  const [t0, f0] = BURPEE[i - 1], [t1, f1, mode] = BURPEE[i];
  const q = clamp((u - t0) / (t1 - t0), 0, 1);
  const e = mode === 1 ? q * q : mode === 2 ? 1 - (1 - q) ** 2 : ease(q);   // ease-in for take-off/landing, ease-out to the apex
  f0(_k0); f1(_k1); lerpPose(p, _k0, _k1, e);
  if (i === 2 || i === 5) {                                                 // feet hop back / forward
    const hop = Math.sin(Math.PI * q) * .1;
    p.pelvis.y += hop; p.fA.y += hop; p.fB.y += hop;
  }
}

/* ------------------------------------------------- exercise presentation --
   T = seconds per demo rep, tap = seconds for a tapped rep, cam frames a W×H box around (tx, ty). */
const EXS = {
  pushups: { pose: pushup,  T: 2.0, tap: .55, cam: { tx: -.2,  ty: .42,  W: 2.05, H: 1.25, az: .5,   el: .2 },  hl: { chest: 1, armU: .35 } },
  squats:  { pose: squat,   T: 2.2, tap: .6,  cam: { tx: .08,  ty: .86,  W: 1.55, H: 1.95, az: .62,  el: .1 },  hl: { thigh: 1 } },
  lunges:  { pose: lunge,   T: 2.4, tap: .8,  cam: { tx: .28,  ty: .86,  W: 1.7,  H: 1.95, az: .5,   el: .1 },  hl: { thigh: 1 } },
  pullups: { pose: pullup,  T: 2.6, tap: .8,  cam: { tx: 0,    ty: 1.28, W: 2.0,  H: 2.75, az: -.85, el: .06 }, hl: { chest: 1, armL: .3 }, bar: true },
  dips:    { pose: dip,     T: 2.2, tap: .7,  cam: { tx: -.05, ty: 1.0,  W: 1.6,  H: 2.1,  az: .8,   el: .1 },  hl: { armU: 1 }, dipBars: true },
  plank:   { pose: plank,   T: 4,   tap: 1,   cam: { tx: -.25, ty: .34,  W: 2.05, H: 1.1,  az: .42,  el: .16 }, hl: { core: 1 } },
  burpees: { pose: burpee,  T: 3.4, tap: 1.5, cam: { tx: -.2,  ty: 1.2,  W: 2.0,  H: 2.75, az: .55,  el: .08 }, hl: { chest: .9 }, heart: true },
  hang:    { pose: hang,    T: 4,   tap: 1,   cam: { tx: 0,    ty: 1.28, W: 2.0,  H: 2.75, az: .7,   el: .06 }, hl: { armL: 1 }, bar: true },
  walk:    { pose: walk,    T: 1.1, tap: 1.1, cam: { tx: 0,    ty: .9,   W: 1.5,  H: 2.05, az: .6,   el: .08 }, hl: { thigh: .6, shin: .8 }, moving: true },
  stretch: { pose: stretch, T: 6,   tap: 6,   cam: { tx: .1,   ty: .8,   W: 1.5,  H: 1.95, az: .4,   el: .1 },  hl: { thigh: 1 } },
};

const CELEBRATE = { tx: 0, ty: 1.08, W: 1.7, H: 2.5, az: .5, el: .1 };

/* --------------------------------------------------------------- figure -- */
class Figure {
  constructor() {
    this.group = new THREE.Group();
    this.mats = {}; this.w = {};
    this.coral = new THREE.Color(COL.coral);
    const part = name => {
      const m = new THREE.MeshStandardMaterial({ color: COL.body, roughness: .7 });
      m.userData.base = new THREE.Color(COL.body);
      this.mats[name] = m; this.w[name] = 0;
      return m;
    };
    const m = { head: part('head'), chest: part('chest'), core: part('core'), armU: part('armU'), armL: part('armL'), thigh: part('thigh'), shin: part('shin') };
    const shorts = new THREE.MeshStandardMaterial({ color: COL.shorts, roughness: .85 });
    const shoe = new THREE.MeshStandardMaterial({ color: COL.volt, roughness: .5, emissive: COL.volt, emissiveIntensity: .12 });
    const add = (geo, mat) => { const x = new THREE.Mesh(geo, mat); x.castShadow = true; this.group.add(x); return x; };
    const limb = (rEnd, rStart, len, mat) => add(new THREE.CylinderGeometry(rEnd, rStart, len, 16, 1), mat);
    const ball = (r, mat) => add(new THREE.SphereGeometry(r, 18, 12), mat);

    this.pelvis = ball(.118, shorts); this.pelvis.scale.set(.92, .86, 1.22);
    this.core = add(new THREE.CapsuleGeometry(.102, .1, 6, 18), m.core); this.core.scale.set(.84, 1, 1.2);
    this.chest = add(new THREE.CapsuleGeometry(.12, .13, 6, 20), m.chest); this.chest.scale.set(.86, 1, 1.42);
    this.neck = limb(.036, .042, .1, m.head);
    this.head = add(new THREE.SphereGeometry(.112, 26, 18), m.head); this.head.scale.set(1, 1.1, .96);
    const band = new THREE.Mesh(new THREE.TorusGeometry(.109, .017, 8, 30), shoe);
    band.rotation.x = Math.PI / 2; band.position.y = .03; this.head.add(band);

    this.arms = [0, 1].map(() => ({
      sh: ball(.062, m.armU), up: limb(.044, .054, B.armU, m.armU), el: ball(.044, m.armL),
      lo: limb(.034, .043, B.armL, m.armL), ha: ball(.047, m.armL),
    }));
    this.legs = [0, 1].map(() => {
      const shoeGeo = new THREE.CapsuleGeometry(.048, .13, 4, 12); shoeGeo.rotateZ(Math.PI / 2);
      const L = {
        hip: ball(.088, shorts), th: limb(.06, .084, B.thigh, m.thigh), sl: limb(.079, .092, .2, shorts),
        kn: ball(.06, m.shin), sh: limb(.04, .058, B.shin, m.shin), an: ball(.042, m.shin), shoe: add(shoeGeo, shoe),
      };
      L.shoe.scale.set(1, .85, 1.05);
      return L;
    });
    const v = () => new THREE.Vector3();
    this.J = { W: v(), C: v(), head: v(), hd: v(), dLo: v(), dHi: v(), sh: v(), el: v(), ha: v(), hip: v(), kn: v(), an: v() };
  }

  update(p) {
    const J = this.J, P = p.pelvis;
    ik2(P, p.chest, B.spineLo, B.spineHi, p.spine, J.W, J.C);
    J.dLo.subVectors(J.W, P).normalize(); J.dHi.subVectors(J.C, J.W).normalize();
    this.pelvis.position.copy(P).addScaledVector(J.dLo, -.01);
    this.pelvis.quaternion.setFromUnitVectors(Y, J.dLo);
    seg(this.core, P, J.W);
    seg(this.chest, J.W, J.C, .52);
    J.hd.copy(J.dHi).add(p.head).normalize();
    J.head.copy(J.C).addScaledVector(J.hd, B.neck);
    this.head.position.copy(J.head); this.head.quaternion.setFromUnitVectors(Y, J.hd);
    _a.copy(J.C).addScaledVector(J.dHi, .03); _b.copy(J.head).addScaledVector(J.hd, -.07);
    seg(this.neck, _a, _b);
    for (let i = 0; i < 2; i++) {
      const s = i ? -1 : 1, A = this.arms[i], L = this.legs[i];
      J.sh.copy(J.C).addScaledVector(J.dHi, -.035); J.sh.z += s * B.shW;
      ik2(J.sh, i ? p.hB : p.hA, B.armU, B.armL, i ? p.eB : p.eA, J.el, J.ha);
      A.sh.position.copy(J.sh); seg(A.up, J.sh, J.el); A.el.position.copy(J.el); seg(A.lo, J.el, J.ha); A.ha.position.copy(J.ha);
      J.hip.copy(P).addScaledVector(J.dLo, -.03); J.hip.z += s * B.hipW;
      ik2(J.hip, i ? p.fB : p.fA, B.thigh, B.shin, i ? p.kB : p.kA, J.kn, J.an);
      L.hip.position.copy(J.hip); seg(L.th, J.hip, J.kn); seg(L.sl, J.hip, J.kn, .26);
      L.kn.position.copy(J.kn); seg(L.sh, J.kn, J.an); L.an.position.copy(J.an);
      const t = i ? p.tB : p.tA, tl = Math.hypot(t.x, t.y) || 1, tx = t.x / tl, ty = t.y / tl;
      L.shoe.position.set(J.an.x + tx * .07 + ty * .028, J.an.y + ty * .07 - tx * .028, J.an.z);
      L.shoe.rotation.set(0, 0, Math.atan2(ty, tx));
    }
  }

  /** Glow the working muscles. */
  highlight(target, k, pulse) {
    for (const name in this.mats) {
      const w = this.w[name] = lerp(this.w[name], target[name] || 0, k), mat = this.mats[name];
      mat.color.copy(mat.userData.base).lerp(this.coral, w * .82);
      mat.emissive.copy(this.coral).multiplyScalar(w * (.16 + .46 * pulse));
    }
  }
}

/* ------------------------------------------------------------- confetti -- */
class Confetti {
  constructor(scene, n = 160) {
    this.n = n;
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(.06, .1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), n);
    this.mesh.frustumCulled = false; this.mesh.visible = false;
    this.p = Array.from({ length: n }, () => ({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), life: 0 }));
    this.o = new THREE.Object3D(); this.active = false;
    const pal = [COL.volt, COL.coral, COL.gold, 0xf3f1ea], c = new THREE.Color();
    for (let i = 0; i < n; i++) this.mesh.setColorAt(i, c.setHex(pal[i % pal.length]));
    scene.add(this.mesh);
  }
  burst(count, power = 1) {
    const r = Math.random;
    for (let i = 0; i < this.n; i++) {
      const q = this.p[i];
      if (i >= count) { q.life = 0; continue; }
      const a = r() * Math.PI * 2, sp = (1.2 + r() * 2.6) * power;
      q.pos.set((r() - .5) * .5, 1 + r() * .5, (r() - .5) * .5);
      q.vel.set(Math.cos(a) * sp, 3.2 + r() * 3.6 * power, Math.sin(a) * sp);
      q.rot.set(r() * 6, r() * 6, r() * 6);
      q.spin.set((r() - .5) * 14, (r() - .5) * 14, (r() - .5) * 14);
      q.life = 1.5 + r() * 1.3;
    }
    this.active = true; this.mesh.visible = true;
  }
  update(dt) {
    if (!this.active) return;
    let alive = 0;
    const o = this.o;
    for (let i = 0; i < this.n; i++) {
      const q = this.p[i];
      if (q.life > 0) {
        alive++; q.life -= dt;
        q.vel.y -= 8.5 * dt; q.vel.multiplyScalar(1 - 1.1 * dt);
        q.pos.addScaledVector(q.vel, dt);
        if (q.pos.y < .02) { q.pos.y = .02; q.vel.set(0, 0, 0); q.spin.set(0, 0, 0); }
        q.rot.x += q.spin.x * dt; q.rot.y += q.spin.y * dt; q.rot.z += q.spin.z * dt;
      }
      o.position.copy(q.pos); o.rotation.copy(q.rot); o.scale.setScalar(clamp(q.life * 3, 0, 1));
      o.updateMatrix(); this.mesh.setMatrixAt(i, o.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!alive) { this.active = false; this.mesh.visible = false; }
  }
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.3, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function setArc(mesh, inner, outer, frac) {
  mesh.visible = frac > .002;
  if (!mesh.visible) return;
  mesh.geometry.dispose();
  mesh.geometry = new THREE.RingGeometry(inner, outer, Math.max(8, Math.ceil(96 * frac)), 1, -Math.PI / 2, Math.PI * 2 * frac);
}

/* ---------------------------------------------------------------- stage -- */
export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.08;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COL.ink);
    this.scene.fog = new THREE.Fog(COL.ink, 7, 17);
    this.camera = new THREE.PerspectiveCamera(42, 1, .1, 60);

    this.pose = makePose(); this.snap = makePose(); this.out = makePose();
    this.ctx = { t: 0, rep: 0, k: 0 };
    this.lastFn = null; this.blend = 1;
    this.u = 0; this.queue = 0; this.rep = 0; this.loop = true; this.period = 2; this.onCycle = null;
    this.kT = .3; this.victory = 0; this.t = 0; this.punch = 0; this.flash = 0;
    this.ringT = 0; this.ringV = 0; this.ringD = -1; this.goldT = 0; this.goldV = 0; this.goldD = -1;
    this.day = new Array(10).fill(0); this.dayCur = -1;
    this.w = 0; this.h = 0;
    this.heroT = null; this.hero = null; this.cam = null;

    this._build();
    this.show('pushups');
    this.last = performance.now();
    const loop = now => { requestAnimationFrame(loop); if (!document.hidden) this.tick(now); };
    requestAnimationFrame(loop);
  }

  _build() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xdfe6ff, 0x16110d, .95));
    const rig = this.rig = new THREE.Group(); s.add(rig);       // lights turn with the camera, like a studio rig
    const key = this.key = new THREE.DirectionalLight(0xfff0dc, 2.5); key.position.set(2.2, 4.6, 3);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -2.6, right: 2.6, top: 3.2, bottom: -2.2, near: .5, far: 12 });
    key.shadow.bias = -.0004; key.shadow.normalBias = .02; key.shadow.radius = 5;
    const rim = this.rim = new THREE.DirectionalLight(COL.volt, 1.5); rim.position.set(-2.6, 2.4, -3.5);
    const fill = new THREE.DirectionalLight(0xff7a55, .75); fill.position.set(-3, 1.1, 1.6);
    rig.add(key, rim, fill);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(18, 48), new THREE.MeshBasicMaterial({ color: 0x0c0d10 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -.14; s.add(ground);
    // unlit platform (so the coloured rim light never tints the floor) with a shadow-only layer on top
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.56, .14, 72), [
      new THREE.MeshBasicMaterial({ color: 0x0f1115 }), new THREE.MeshBasicMaterial({ color: COL.plat }), new THREE.MeshBasicMaterial({ color: 0x0f1115 })]);
    plat.position.y = -.07; s.add(plat);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.5, 72), new THREE.ShadowMaterial({ opacity: .5 }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = .001; shadow.receiveShadow = true; s.add(shadow);

    // floor ring: progress on the current exercise
    const flat = (geo, color, opacity = 1) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: false, toneMapped: false }));
      m.rotation.x = -Math.PI / 2; s.add(m); return m;
    };
    flat(new THREE.RingGeometry(1.27, 1.34, 96), COL.dim).position.y = .003;
    this.arc = flat(new THREE.RingGeometry(1.27, 1.34, 8), COL.volt); this.arc.position.y = .005; this.arc.visible = false;
    this.arcGold = flat(new THREE.RingGeometry(1.38, 1.42, 8), COL.gold); this.arcGold.position.y = .005; this.arcGold.visible = false;
    this.ticks = new THREE.Group(); s.add(this.ticks);
    const tickGeo = new THREE.BoxGeometry(.012, .002, .06), tickMat = new THREE.MeshBasicMaterial({ color: 0x3a404a });
    for (let i = 0; i < 40; i++) {
      const a = i / 40 * Math.PI * 2, t = new THREE.Mesh(tickGeo, tickMat);
      t.position.set(Math.cos(a) * 1.16, .003, Math.sin(a) * 1.16); t.rotation.y = -a + Math.PI / 2; this.ticks.add(t);
    }
    this.shocks = [0, 1, 2].map(() => { const m = flat(new THREE.RingGeometry(.9, 1, 56), COL.volt, 0); m.position.y = .008; m.visible = false; m.userData.life = 0; return m; });
    this.shockI = 0;

    // equipment
    const metal = new THREE.MeshStandardMaterial({ color: COL.metal, roughness: .38, metalness: .25 });
    const rod = (r, len, x, y, z, axis) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), metal);
      m.position.set(x, y, z); if (axis === 'z') m.rotation.x = Math.PI / 2; if (axis === 'x') m.rotation.z = Math.PI / 2;
      m.castShadow = true; return m;
    };
    this.bar = new THREE.Group();
    this.bar.add(rod(.034, 2.3, 0, 1.15, .8), rod(.034, 2.3, 0, 1.15, -.8), rod(.024, 1.7, 0, 2.25, 0, 'z'));
    this.dipBars = new THREE.Group();
    for (const z of [.3, -.3]) this.dipBars.add(rod(.024, 1, -.05, 1.05, z, 'x'), rod(.026, 1.05, -.48, .525, z), rod(.026, 1.05, .38, .525, z));
    for (const g of [this.bar, this.dipBars]) { g.visible = false; g.userData.s = 0; s.add(g); }

    this.figure = new Figure(); s.add(this.figure.group);

    // halo: ten segments behind the athlete, one per exercise
    this.halo = new THREE.Group(); s.add(this.halo);
    const gap = .07, step = Math.PI * 2 / 10;
    this.haloSegs = Array.from({ length: 10 }, (_, i) => {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(.93, 1, 20, 1, Math.PI / 2 - (i + 1) * step + gap / 2, step - gap),
        new THREE.MeshBasicMaterial({ color: COL.dim, fog: false, toneMapped: false, depthWrite: false }));
      m.userData.c = new THREE.Color(COL.dim);
      this.halo.add(m); return m;
    });
    const glow = glowTexture();
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: COL.volt, transparent: true, opacity: .1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.glow.scale.setScalar(3.2); this.glow.position.z = -.05; this.halo.add(this.glow);

    // drifting motes
    const N = 80, pos = new Float32Array(N * 3); this.moteV = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, rad = .6 + Math.random() * 2.8;
      pos[i * 3] = Math.cos(a) * rad; pos[i * 3 + 1] = Math.random() * 3.4; pos[i * 3 + 2] = Math.sin(a) * rad;
      this.moteV[i] = .05 + Math.random() * .14;
    }
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(mg, new THREE.PointsMaterial({ map: glow, color: COL.volt, size: .06, transparent: true, opacity: .5, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.add(this.motes);

    this.confetti = new Confetti(s);
    this.cVolt = new THREE.Color(COL.volt); this.cDim = new THREE.Color(COL.dim); this.cCur = new THREE.Color(0x7c838f);
  }

  /* ---- public API ---- */
  show(id) {
    const ex = EXS[id]; if (!ex) return;
    this.ex = ex; this.exId = id;
    this.u = 0; this.queue = 0; this.period = ex.T; this.onCycle = null;
  }
  /** Loop reps continuously (demo / auto-pace), calling cb at the end of each rep. */
  setLoop(on, period, cb) {
    this.loop = !!on; this.period = period || this.ex.T; this.onCycle = cb || null;
    if (on && cb) this.u = 0;
  }
  tap() { this.queue = Math.min(this.queue + 1, 6); }
  setIntensity(k) { this.kT = k; }
  setProgress(p, gold = 0) { this.ringT = clamp(p, 0, 1); this.goldT = clamp(gold, 0, 1); }
  setDay(states, current = -1) { this.day = states; this.dayCur = current; }
  /** Visible region for the athlete, in CSS px from the top of the canvas. */
  setHero(top, bottom, width) {
    this.heroT = { cy: (top + bottom) / 2, h: Math.max(120, bottom - top), w: width };
    if (!this.hero) this.hero = { ...this.heroT };
  }
  pulse() {
    this.punch = 1; this.flash = 1;
    const m = this.shocks[this.shockI = (this.shockI + 1) % this.shocks.length]; m.userData.life = 1; m.visible = true;
  }
  celebrate(big) { this.victory = big ? 3.2 : 1.7; this.confetti.burst(big ? 160 : 70, big ? 1.25 : 1); }

  _resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
  }

  tick(now) {
    const dt = clamp((now - this.last) / 1000, 0, .05); this.last = now; this.t += dt;
    this._resize();
    const ex = this.ex, t = this.t;

    // rep phase
    if (this.loop) {
      this.u += dt / this.period;
      if (this.u >= 1) { this.u -= 1; this.rep++; if (this.onCycle) this.onCycle(); }
    } else if (this.queue > 0 || this.u > 0) {
      this.u += dt / ex.tap * (1 + .7 * Math.max(0, this.queue - 1));
      if (this.u >= 1) { this.u = 0; this.rep++; this.queue = Math.max(0, this.queue - 1); }
    }

    // pose (blend smoothly whenever the movement changes)
    if (this.victory > 0) this.victory -= dt;
    const fn = this.victory > 0 ? victory : ex.pose;
    if (fn !== this.lastFn) { if (this.lastFn) { copyPose(this.snap, this.out); this.blend = 0; } this.lastFn = fn; }
    const c = this.ctx; c.t = t; c.rep = this.rep; c.k = lerp(c.k, this.reduced ? 0 : this.kT, 1 - Math.exp(-dt * 3));
    fn(this.pose, this.u, c);
    if (this.blend < 1) { this.blend = Math.min(1, this.blend + dt / .42); lerpPose(this.out, this.snap, this.pose, ease(this.blend)); }
    else copyPose(this.out, this.pose);
    this.figure.update(this.out);

    let pulse = .5 + .5 * Math.sin(t * 4.2);
    if (ex.heart) { const b = (t * 1.5) % 1; pulse = Math.max(Math.exp(-b * 9), .75 * Math.exp(-((b + .78) % 1) * 9)); }
    this.figure.highlight(ex.hl, 1 - Math.exp(-dt * 6), pulse);

    for (const [g, on] of [[this.bar, ex.bar], [this.dipBars, ex.dipBars]]) {
      const s = g.userData.s = lerp(g.userData.s, on ? 1 : 0, 1 - Math.exp(-dt * 7));
      g.visible = s > .01; g.scale.y = Math.max(.001, s);
    }
    if (ex.moving && !this.reduced) this.ticks.rotation.y += dt * .9;

    // camera: frame the movement inside the visible hero region
    const hero = this.hero || { cy: this.h / 2, h: this.h, w: this.w }, hT = this.heroT || hero;
    const kh = 1 - Math.exp(-dt * 8);
    hero.cy = lerp(hero.cy, hT.cy, kh); hero.h = lerp(hero.h, hT.h, kh); hero.w = lerp(hero.w, hT.w, kh);
    const tanF = Math.tan(this.camera.fov * Math.PI / 360);
    const perH = 2 * tanF * hero.h / this.h, perW = 2 * tanF * hero.w / this.h;
    const pre = this.victory > 0 ? Object.assign(CELEBRATE, { az: ex.cam.az }) : ex.cam;
    const fitH = pre.H / perH, fitW = pre.W / perW, want = Math.max(fitH, fitW) * 1.05;
    const shiftT = clamp((1 - fitW / fitH) * 2, 0, 1) * .08;
    if (!this.cam) this.cam = { tx: pre.tx, ty: pre.ty, az: pre.az, el: pre.el, d: want, shift: shiftT };
    const cam = this.cam, kc = 1 - Math.exp(-dt * 3.4);
    cam.tx = lerp(cam.tx, pre.tx, kc); cam.ty = lerp(cam.ty, pre.ty, kc); cam.az = lerp(cam.az, pre.az, kc);
    cam.el = lerp(cam.el, pre.el, kc); cam.d = lerp(cam.d, want, kc); cam.shift = lerp(cam.shift, shiftT, kc);
    this.punch = Math.max(0, this.punch - dt * 5); this.flash = Math.max(0, this.flash - dt * 3.5);
    const sway = this.reduced ? 0 : 1;
    const az = cam.az + Math.sin(t * .23) * .1 * sway, el = cam.el + Math.sin(t * .17) * .025 * sway;
    const d = cam.d * (1 - this.punch * .03 * sway);
    const C = this.camera;
    C.position.set(cam.tx + d * Math.cos(el) * Math.sin(az), cam.ty + d * Math.sin(el), d * Math.cos(el) * Math.cos(az));
    C.lookAt(cam.tx, cam.ty, 0);
    C.setViewOffset(this.w, this.h, -hero.w * cam.shift, this.h / 2 - hero.cy, this.w, this.h);
    this.rig.rotation.y = az;
    this.rim.intensity = 1.5 + this.flash * 2.2;

    // halo follows the camera so it always sits behind the athlete
    const back = 3.2;
    _a.set(cam.tx, cam.ty, 0).sub(C.position).normalize();
    this.halo.position.set(cam.tx, cam.ty, 0).addScaledVector(_a, back);
    this.halo.lookAt(C.position);
    this.halo.scale.setScalar(Math.min((d + back) * perW * .45, (d + back) * perH * .46));
    let done = 0;
    for (let i = 0; i < 10; i++) {
      const m = this.haloSegs[i], on = this.day[i] > 0; if (on) done++;
      const target = on ? this.cVolt : i === this.dayCur ? _colorTmp.copy(this.cDim).lerp(this.cCur, .5 + .5 * Math.sin(t * 3)) : this.cDim;
      m.userData.c.lerp(target, 1 - Math.exp(-dt * 5)); m.material.color.copy(m.userData.c);
    }
    this.glow.material.opacity = .035 + done * .012 + this.flash * .06;

    // floor rings
    const kr = 1 - Math.exp(-dt * 9);
    this.ringV = Math.abs(this.ringT - this.ringV) < .002 ? this.ringT : lerp(this.ringV, this.ringT, kr);
    this.goldV = Math.abs(this.goldT - this.goldV) < .002 ? this.goldT : lerp(this.goldV, this.goldT, kr);
    if (this.ringV !== this.ringD) { setArc(this.arc, 1.27, 1.34, this.ringV); this.ringD = this.ringV; }
    if (this.goldV !== this.goldD) { setArc(this.arcGold, 1.38, 1.42, this.goldV); this.goldD = this.goldV; }
    for (const m of this.shocks) {
      if (m.userData.life <= 0) continue;
      const l = m.userData.life -= dt / .5;
      m.scale.setScalar(lerp(.3, 1.5, 1 - l * l)); m.material.opacity = Math.max(0, l) * .5; m.visible = l > 0;
    }

    if (!this.reduced) {
      const pa = this.motes.geometry.attributes.position;
      for (let i = 0; i < this.moteV.length; i++) { let y = pa.getY(i) + this.moteV[i] * dt; if (y > 3.4) y = 0; pa.setY(i, y); }
      pa.needsUpdate = true;
    }
    this.confetti.update(dt);
    this.renderer.render(this.scene, C);
  }
}
const _colorTmp = new THREE.Color();
