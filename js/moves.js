// moves.js — how the athlete moves.
// Each movement fills in a pose: where the pelvis, chest, hands and feet are, plus the small things that
// make it read as a person — shoulders that shrug and set, hips that turn, a head that looks where it's going.
// Nothing here is evenly timed: lowering is slow and controlled, the push is quicker, and no two reps match exactly.
import * as THREE from '../vendor/three.module.min.js';
import { B, LEG, SPINE, STAND, FOOT, clamp, lerp, ease } from './figure.js';

const PI = Math.PI;

/* Figure faces +x, y is up. "A" is the side nearest the camera (+z), "B" the far side.
   pelvis, chest  hip line and base of the neck          spine  which way the waist bows
   head           direction of the neck                  look   turn, nod, tilt of the head (radians)
   twist, tilt    turn / side-tip of (pelvis, chest)     grip   finger curl (A, B): 0 open, 1 fist
   h, e, s        wrist target, elbow direction, shoulder shrug (forward, up, out)
   g, n           where the fingers point, where the palm faces (zero = follow the forearm)
   f, k, t        ankle target, knee direction, where the toes point */
export const POSE_KEYS = ['pelvis', 'chest', 'spine', 'head', 'look', 'twist', 'tilt', 'grip',
  'hA', 'hB', 'eA', 'eB', 'sA', 'sB', 'gA', 'gB', 'nA', 'nB', 'fA', 'fB', 'kA', 'kB', 'tA', 'tB'];
export const makePose = () => Object.fromEntries(POSE_KEYS.map(k => [k, new THREE.Vector3()]));
export const copyPose = (dst, src) => { for (const k of POSE_KEYS) dst[k].copy(src[k]); };
export const lerpPose = (out, a, b, t) => { for (const k of POSE_KEYS) out[k].lerpVectors(a[k], b[k], t); };

const sstep = (a, b, x) => ease((x - a) / (b - a));
const STANDX = .035;                // standing, the hips sit a little ahead of the ankles
/** A repeatable 0..1 number per rep, so every rep is a little different but never jitters. */
const hash = (n, s = 0) => { const x = Math.sin(n * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
/** Slow organic wobble in −1..1. */
export const wob = (t, f, ph = 0) => Math.sin(t * f + ph) * .62 + Math.sin(t * f * 1.73 + ph * 2.3 + 1.3) * .38;

/** One rep, 0 → 1 → 0: lower until a (controlled), pause until b, drive back up until c, then rest at the top. */
function rep(u, a, b, c) {
  if (u <= 0 || u >= c) return 0;
  if (u < a) return .5 - .5 * Math.cos(PI * u / a);
  if (u < b) return 1;
  return .5 + .5 * Math.cos(PI * Math.pow((u - b) / (c - b), 1.15));
}

const both = (p, key, x, y, z) => { p[key + 'A'].set(x, y, z); p[key + 'B'].set(x, y, -z); };

function base(p) {
  p.spine.set(1, 0, 0); p.head.set(.05, 1, 0); p.look.set(0, 0, 0); p.twist.set(0, 0, 0); p.tilt.set(0, 0, 0); p.grip.set(.4, .4, 0);
  both(p, 'e', -1, -.25, .35); both(p, 's', 0, 0, 0); both(p, 'g', 0, 0, 0); both(p, 'n', 0, 0, 0);
  both(p, 'k', 1, .15, .1); both(p, 't', 1, 0, .12);
}
/** Pelvis at (x, y) with the torso leaning `lean` radians forward of upright; `curl` rounds the back. */
function torso(p, x, y, lean, curl = 0) {
  const L = SPINE * (1 - curl);
  p.pelvis.set(x, y, 0);
  p.chest.set(x + Math.sin(lean) * L, y + Math.cos(lean) * L, 0);
}
/** Neck direction as an angle forward of straight up. */
const neck = (p, a) => p.head.set(Math.sin(a), Math.cos(a), 0);
/** Foot on the floor at x. pitch < 0 lifts the heel (rolling onto the ball of the foot), pitch > 0 lifts the toes. */
function plant(p, k, x, z, pitch = 0, yaw = 0) {
  const c = Math.cos(pitch), s = Math.sin(pitch);
  const dx = pitch <= 0 ? FOOT.ball * (1 - c) - s * FOOT.sole : -FOOT.heel * (1 - c) - s * FOOT.sole;
  const y = pitch <= 0 ? -s * FOOT.ball + c * FOOT.sole : s * FOOT.heel + c * FOOT.sole;
  p['f' + k].set(x + dx * Math.cos(yaw), y, z + dx * Math.sin(yaw));
  p['t' + k].set(c * Math.cos(yaw), s, c * Math.sin(yaw));
}
/** Hand hung from its shoulder: `ang` radians forward of straight down, `reach` from the shoulder. */
function arm(p, k, ang, reach = .545, out = .055, lean = 0) {
  const s = k === 'A' ? 1 : -1, C = p.chest;
  p['h' + k].set(C.x - Math.sin(lean) * .045 + Math.sin(ang) * reach, C.y - Math.cos(lean) * .045 - Math.cos(ang) * reach, C.z + s * (B.shW + out));
}
const flatHands = p => { p.gA.set(1, 0, .16); p.gB.set(1, 0, -.16); both(p, 'n', 0, -1, 0); p.grip.set(.04, .04, 0); };

/* ---------------------------------------------------------------- floor -- */
const TOE_PITCH = -1.28;
const TOE_Y = -Math.sin(TOE_PITCH) * FOOT.ball + Math.cos(TOE_PITCH) * FOOT.sole;
const PLANK_L = LEG * .995 + .03 + SPINE;

/** Straight body balanced on the toes at ankle-x `ax`, neck base at height `sy`. Returns the neck-base x. */
function plankLine(p, sy, ax, sag = 0) {
  const sx = ax + Math.sqrt(PLANK_L * PLANK_L - (sy - TOE_Y) ** 2), f = (LEG * .995 + .03) / PLANK_L;
  p.chest.set(sx, sy, 0);
  p.pelvis.set(lerp(ax, sx, f), lerp(TOE_Y, sy, f) - sag, 0);
  both(p, 'f', ax, TOE_Y, .075); both(p, 't', Math.cos(TOE_PITCH), Math.sin(TOE_PITCH), 0);
  both(p, 'k', .15, -1, 0);
  p.spine.set(0, 1, 0);
  return sx;
}

function pushup(p, u, c) {
  base(p);
  const v = hash(c.rep), d = rep(u, .42, .48, .8) * (1 - .06 * v), late = rep(u - .04, .42, .48, .8);
  const grind = u > .48 && u < .8 ? 1 : .25;                              // arms shake most on the way up
  const sy = lerp(.592, .215, d) + c.k * wob(c.t, 29) * .004 * grind;
  const sx = plankLine(p, sy, -.93, .012 * d + .02 * c.k * d);            // hips sag a touch at the bottom, more when tired
  both(p, 'h', .37, .028, .26); both(p, 'e', -1, .1, .7); flatHands(p);
  both(p, 's', lerp(.02, -.028, d), lerp(0, .014, d), 0);                 // shoulder blades spread at the top, pinch at the bottom
  const a = Math.atan2(sy - TOE_Y, sx + .93) + .2 + .14 * late;           // the head follows a beat behind the chest
  p.head.set(Math.cos(a), Math.sin(a), 0);
  p.twist.y = (v - .5) * .05 * d;
}

function plank(p, u, c) {
  base(p);
  const k = c.k, drift = wob(c.t, .5) * .012;                             // weight rocks slowly over the elbows
  const sx = plankLine(p, .352 + Math.sin(c.t * 1.6) * .004 + k * wob(c.t, 27) * .004, -.97 + drift, .01 * wob(c.t, .23) + .016 * k);
  both(p, 'h', sx + .192, .034, .075); both(p, 'e', -.35, -1, .22);
  p.nA.set(0, 0, -1); p.nB.set(0, 0, 1); p.grip.set(.8, .8, 0);
  const a = Math.atan2(.352 - TOE_Y, sx + .97) + .14;
  p.head.set(Math.cos(a), Math.sin(a), 0);
  p.look.z = wob(c.t, .33) * .03;
}

/* ---------------------------------------------------------------- legs --- */
function squat(p, u, c) {
  base(p);
  const v = hash(c.rep), d = rep(u, .42, .47, .8) * (1 - .05 * v), late = rep(u - .05, .42, .47, .8);
  const lean = lerp(.02, .68, d);
  torso(p, lerp(.035, -.25, d), lerp(STAND, .475, d), lean);              // hips go back and down, chest tips to balance
  plant(p, 'A', 0, .17, 0, .3); plant(p, 'B', 0, -.17, 0, -.3);
  both(p, 'k', 1, .1, .5);                                                // knees track out over the toes
  for (const k of 'AB') arm(p, k, lerp(.05, 1.5, late), lerp(.545, .5, late), lerp(.055, -.07, late), lean);   // arms float up as a counterweight
  neck(p, lerp(.05, .34, d));                                             // eyes stay level
  p.grip.set(lerp(.4, .2, d), lerp(.4, .2, d), 0);
  p.pelvis.z = (v - .5) * .02 * d; p.tilt.x = (v - .5) * .03 * d;
}

function lunge(p, u, c) {
  base(p);
  const lead = c.rep % 2 === 0, z = lead ? 1 : -1, F = lead ? 'A' : 'B', R = lead ? 'B' : 'A';   // alternate the leading leg
  const s = sstep(0, .42, u) * (1 - sstep(.5, .8, u)), sy = Math.pow(s, .8);                     // the body falls into the step…
  const go = sstep(0, .24, u), ret = sstep(.6, .84, u), reach = go * (1 - ret);                  // …the foot lands first and comes home last
  torso(p, lerp(STANDX, .52, s), lerp(STAND, .56, sy), .02 + .12 * s);
  const lift = Math.sin(PI * go) * .14 + Math.sin(PI * ret) * .11;
  const fx = Math.min(.92 * reach, p.pelvis.x + .15 + .45 * reach);                              // knee lifts and the foot swings through, no straight-leg kick
  if (lift > .004) {
    p['f' + F].set(fx, FOOT.sole + lift, z * .1);
    p['t' + F].set(1, go < 1 ? .5 * Math.sin(PI * go) - .25 * Math.sin(PI * go * 2) : -.3 * Math.sin(PI * ret), z * .1);
  } else plant(p, F, fx, z * .1, 0, z * .1);
  plant(p, R, 0, -z * .1, -1.08 * ease(s), -z * .1);                      // back heel peels up as the hips travel
  p['k' + F].set(1, .4, z * .08); p['k' + R].set(lerp(1, .75, s), lerp(.15, -1, s), -z * .05);
  arm(p, R, .9 * s, lerp(.545, .37, s), .03, .1);                         // arms swing against the legs, like a stride
  arm(p, F, -.5 * s, lerp(.545, .46, s), .05, .1);
  p.twist.set(z * .16 * s, -z * .12 * s, 0);
  neck(p, .05 + .05 * s);
}

/* ----------------------------------------------------------------- bars -- */
const BAR = 2.25;
function barGrip(p) {
  both(p, 'h', -.037, BAR - .052, .3);
  both(p, 'g', 0, 1, 0); p.nA.set(1, 0, 0); p.nB.set(1, 0, 0); p.grip.set(1, 1, 0);
  both(p, 'e', -.1, -1, .7);
}

function pullup(p, u, c) {
  base(p);
  const v = hash(c.rep);
  const set = sstep(0, .09, u) * (1 - sstep(.88, .98, u));                // shoulders pull down before the arms bend
  const d = (u < .5 ? sstep(.06, .42, u) : 1 - sstep(.5, .9, u)) * (1 - .04 * v);
  const late = u < .5 ? sstep(.1, .46, u) : 1 - sstep(.54, .94, u);
  const cx = -.03 - .11 * d + wob(c.t, 1.3) * .008, cy = 1.612 + .045 * set + .49 * d, lean = -.03 - .2 * d;
  p.chest.set(cx, cy, 0); p.pelvis.set(cx - Math.sin(lean) * SPINE, cy - Math.cos(lean) * SPINE, 0);
  barGrip(p);
  both(p, 's', 0, .045 * (1 - set) - .012 * d, 0);
  const P = p.pelvis, kick = (d - late) * .5;                              // legs trail the body like a pendulum
  p.fA.set(P.x - .16 - .1 * d + kick, P.y - .85 + .05 * d, .05);
  p.fB.set(P.x - .25 - .1 * d + kick, P.y - .8 + .05 * d, -.05);
  both(p, 't', .3, -1, 0);
  neck(p, -.02 - .14 * d); p.look.y = .32 - .2 * d;                       // eyes on the bar
}

function hang(p, u, c) {
  base(p);
  const k = c.k, sw = wob(c.t, .9) * (.014 + .03 * k), tw = wob(c.t, .6, 2) * (.05 + .07 * k);
  const reset = Math.pow(Math.max(0, Math.sin(c.t * .55)), 10);           // now and then the shoulders re-set
  const set = .1 + .6 * reset;
  p.chest.set(-.03 + sw * .35, 1.612 + .045 * set + k * wob(c.t, 23) * .002, 0);
  p.pelvis.set(p.chest.x + sw * .9, p.chest.y - SPINE, 0);
  barGrip(p);
  both(p, 's', 0, .045 * (1 - set), 0);
  const P = p.pelvis;
  p.fA.set(P.x + sw * .9 - .05, P.y - .89, .07); p.fB.set(P.x + sw * 1.1 - .1, P.y - .88, -.06);
  both(p, 't', .35, -1, 0);
  p.twist.set(tw, tw * .7, 0);
  neck(p, .03); p.look.set(0, .12 - .1 * reset, wob(c.t, .4) * .04);
}

function dip(p, u, c) {
  base(p);
  const v = hash(c.rep), d = rep(u, .42, .48, .8) * (1 - .05 * v), late = rep(u - .05, .42, .48, .8);
  const lean = lerp(.1, .42, d), shake = c.k * wob(c.t, 27) * .004 * (u > .48 && u < .8 ? 1 : .2);
  const cx = lerp(.03, .16, d), cy = lerp(1.695, 1.4, d) + shake;
  p.chest.set(cx, cy, 0); p.pelvis.set(cx - Math.sin(lean) * SPINE, cy - Math.cos(lean) * SPINE, 0);
  both(p, 'h', 0, 1.089, .255); p.gA.set(0, 0, 1); p.gB.set(0, 0, -1); both(p, 'n', 0, -1, 0); p.grip.set(1, 1, 0);
  both(p, 'e', -1, .05, .22);
  both(p, 's', lerp(0, .02, d), lerp(-.012, .035, d), 0);                 // shoulders ride up towards the ears at the bottom
  const P = p.pelvis;
  p.fA.set(P.x - .36 + .08 * late, P.y - .52, .05); p.fB.set(P.x - .43 + .08 * late, P.y - .47, -.04);
  both(p, 'k', 1, -.35, 0); both(p, 't', -.45, -1, 0);
  neck(p, lerp(.12, .34, d));
}

/* --------------------------------------------------------------- burpee -- */
const relax = (p, lean = 0) => { arm(p, 'A', .04, .545, .055, lean); arm(p, 'B', .04, .545, .055, lean); };
const feetFlat = (p, z, yaw = 0) => { plant(p, 'A', 0, z, 0, yaw); plant(p, 'B', 0, -z, 0, -yaw); };
function kStand(p) { base(p); torso(p, STANDX, STAND, .02); relax(p, .02); feetFlat(p, .11, .12); }
function kReach(p) { base(p); torso(p, -.15, .68, .85); both(p, 'h', .34, .32, .22); feetFlat(p, .14, .2); both(p, 'k', 1, .2, .45); neck(p, .7); p.grip.set(.15, .15, 0); }
function kCrouch(p) {
  base(p); torso(p, -.16, .38, 1.25, .05); both(p, 'h', .4, .028, .24); flatHands(p);
  plant(p, 'A', 0, .14, -.6, .2); plant(p, 'B', 0, -.14, -.6, -.2);
  both(p, 'k', 1, .35, .6); both(p, 'e', -.6, .3, 1); p.head.set(.9, .45, 0); p.spine.set(-.5, 1, 0);
}
function kPlankAt(p, sy, pro, up) {
  base(p);
  const sx = plankLine(p, sy, -.93);
  both(p, 'h', .4, .028, .24); flatHands(p); both(p, 'e', -1, .1, .7); both(p, 's', pro, up, 0);
  const a = Math.atan2(sy - TOE_Y, sx + .93) + .24;
  p.head.set(Math.cos(a), Math.sin(a), 0);
}
const kPlank = p => kPlankAt(p, .592, .02, 0), kPlankLow = p => kPlankAt(p, .225, -.028, .014);
function kLoad(p) { base(p); torso(p, -.2, .58, .72); arm(p, 'A', -.95, .5, .06, .72); arm(p, 'B', -.95, .5, .06, .72); feetFlat(p, .12, .15); both(p, 'k', 1, .15, .35); neck(p, .42); }
function kExtend(p) { base(p); torso(p, .02, 1.03, -.02); both(p, 'h', .42, 1.84, .2); plant(p, 'A', 0, .11, -.9); plant(p, 'B', 0, -.11, -.9); neck(p, -.04); p.grip.set(.25, .25, 0); }
function kApex(p) { base(p); torso(p, 0, 1.3, -.03); both(p, 'h', .05, 2.34, .16); both(p, 'f', -.02, .43, .11); both(p, 't', .45, -1, 0); neck(p, -.08); p.look.y = .15; p.grip.set(.1, .1, 0); }
function kTouch(p) { base(p); torso(p, 0, 1.02, .04); both(p, 'h', .44, 1.74, .22); plant(p, 'A', 0, .11, -.8); plant(p, 'B', 0, -.11, -.8); p.grip.set(.3, .3, 0); }
function kAbsorb(p) { base(p); torso(p, -.08, .84, .32); arm(p, 'A', .5, .5, .03, .32); arm(p, 'B', .5, .5, .03, .32); feetFlat(p, .11, .12); both(p, 'k', 1, .15, .3); neck(p, .2); }

const BURPEE = [[0, kStand], [.09, kReach], [.16, kCrouch], [.26, kPlank], [.35, kPlankLow], [.44, kPlank], [.54, kCrouch],
  [.61, kLoad], [.695, kExtend], [.775, kApex], [.855, kTouch], [.92, kAbsorb], [1, kStand]];
const CONTACT = new Set(['hA', 'hB', 'fA', 'fB', 'tA', 'tB', 'gA', 'gB', 'nA', 'nB', 'grip']);
const _k = [makePose(), makePose(), makePose(), makePose()];

/** The body flows through the key poses on a spline; hands and feet move point to point so they never slide on the floor. */
function burpee(p, u) {
  const K = BURPEE, n = K.length;
  let i = 1;
  while (i < n - 1 && u > K[i][0]) i++;
  const i0 = Math.max(0, i - 2), i3 = Math.min(n - 1, i + 1);
  K[i0][1](_k[0]); K[i - 1][1](_k[1]); K[i][1](_k[2]); K[i3][1](_k[3]);
  const t1 = K[i - 1][0], t2 = K[i][0], dt = t2 - t1, q = clamp((u - t1) / dt, 0, 1), q2 = q * q, q3 = q2 * q;
  const h00 = 2 * q3 - 3 * q2 + 1, h10 = q3 - 2 * q2 + q, h01 = -2 * q3 + 3 * q2, h11 = q3 - q2;
  const m1 = i === 1 ? 0 : h10 * dt / (t2 - K[i0][0]), m2 = i === n - 1 ? 0 : h11 * dt / (K[i3][0] - t1), e = ease(q);
  for (const key of POSE_KEYS) {
    const a = _k[1][key], b = _k[2][key], o = p[key];
    if (CONTACT.has(key)) { o.lerpVectors(a, b, e); continue; }
    const z = _k[0][key], y = _k[3][key];
    o.set(h00 * a.x + m1 * (b.x - z.x) + h01 * b.x + m2 * (y.x - a.x),
      h00 * a.y + m1 * (b.y - z.y) + h01 * b.y + m2 * (y.y - a.y),
      h00 * a.z + m1 * (b.z - z.z) + h01 * b.z + m2 * (y.z - a.z));
  }
  if (i === 3 || i === 6) {                                               // feet jump back / forward: hips pop up, knees stay tucked until the legs shoot out
    const hop = Math.sin(PI * q), late = i === 3 ? q * q * q : 1 - (1 - q) ** 3;
    p.fA.y += hop * .1; p.fB.y += hop * .1; p.pelvis.y += hop * .12; p.chest.y += hop * .03;
    p.kA.lerpVectors(_k[1].kA, _k[2].kA, late); p.kB.lerpVectors(_k[1].kB, _k[2].kB, late);
  }
}

/* ------------------------------------------------------------- the rest -- */
function walk(p, u) {
  base(p);
  const a = u * PI * 2, co = Math.cos(a), si = Math.sin(a);
  torso(p, .02, .958 - .015 * Math.cos(2 * a - .5), .04);                   // rises over each standing leg
  p.pelvis.z = .02 * Math.sin(a + .2); p.chest.z = .012 * Math.sin(a + .2);   // weight shifts over the standing foot
  p.twist.set(.15 * co, -.11 * co, 0);                                    // hips turn with the stride, shoulders against it
  p.tilt.set(.045 * si, -.02 * si, 0);                                    // the swinging side's hip drops
  for (let i = 0; i < 2; i++) {
    const s = i ? -1 : 1, k = i ? 'B' : 'A', ph = (u + i * .5) % 1;
    if (ph < .62) {                                                       // on the ground: heel strike → flat → heel peels → toe-off
      const q = ph / .62;
      plant(p, k, lerp(.3, -.3, q), s * .085, q < .14 ? lerp(.3, 0, q / .14) : q > .62 ? -ease((q - .62) / .38) : 0, s * .1);
    } else {                                                              // swinging through
      const q = (ph - .62) / .38, e = ease(q), pt = lerp(-1, .3, sstep(.05, .9, q));
      p['f' + k].set(lerp(-.188, .275, e), lerp(.126, .088, e) + Math.sin(PI * q) * .07, s * .085);
      p['t' + k].set(Math.cos(pt), Math.sin(pt), s * .1);
    }
    const th = (i ? .5 : -.5) * co, fwd = Math.max(0, th);                // each arm swings against its own leg
    arm(p, k, th, .53 - fwd * .14, .04 - fwd * .08, .04);
  }
  neck(p, .06); p.look.x = .11 * co;                                      // the head stays facing forward
  p.grip.set(.5, .5, 0);
}

function stretch(p, u, c) {
  base(p);
  const tall = sstep(0, .16, u) * (1 - sstep(.2, .48, u));                // reach tall, then swan-dive forward and breathe into it
  const fold = sstep(.2, .5, u) * (1 - sstep(.8, .98, u));
  const deep = fold * (.84 + .16 * sstep(.5, .78, u)) + fold * .025 * Math.sin(c.t * 1.6);
  const lean = lerp(.02, 2.3, deep) - .1 * tall;
  torso(p, lerp(STANDX, -.13, deep), STAND - .05 * deep, lean, .14 * deep);
  p.spine.set(lerp(1, -.5, sstep(0, .3, deep)), deep, 0);                 // the back rounds as it folds
  feetFlat(p, .1, .1);
  for (const k of 'AB') arm(p, k, .04 + 2.9 * tall, lerp(.545, .44, deep), lerp(.055, -.04, Math.max(tall, deep)), lean);   // arms arc up, over and down
  both(p, 'e', -1, lerp(-.25, .6, tall), .35);
  p.head.set(lerp(.05, .25, deep), lerp(1, -1, deep), 0);                 // the head hangs heavy at the bottom
  p.look.y = .25 * tall;
  p.grip.set(.2, .2, 0);
}

/** Celebration: bouncing on the spot, fists pumping. */
export function victory(p, u, c) {
  base(p);
  const T = .62, ph = (c.t % T) / T, beat = Math.floor(c.t / T) % 2 ? 1 : -1, j = Math.sin(PI * ph);
  const air = ease(Math.max(0, j - .25) / .75), crouch = (1 - Math.min(1, j / .25)) * .08, y = .2 * air;
  torso(p, 0, STAND - .015 - crouch + y, -.04);
  if (air > .01) { both(p, 'f', 0, FOOT.sole + y * .93 + .05 * Math.min(1, air * 3), .12); both(p, 't', 1, -1.3 * Math.min(1, air * 3), 0); } else feetFlat(p, .12, .12);
  const C = p.chest, pump = .1 * j;
  p.hA.set(.06, C.y + .4 + (beat > 0 ? pump : 0), .33); p.hB.set(.06, C.y + .4 + (beat < 0 ? pump : 0), -.33);
  both(p, 'e', .2, -.4, 1); both(p, 'g', 0, 1, 0); p.grip.set(.95, .95, 0);
  p.twist.set(beat * .06, beat * .12 * j, 0);
  neck(p, -.1); p.look.y = .22;
}

/* ------------------------------------------------- exercise presentation --
   T = seconds per demo rep, tap = seconds for a tapped rep, cam frames a W×H box around (tx, ty). */
export const EXS = {
  pushups: { pose: pushup,  T: 2.0, tap: .6,  cam: { tx: -.15, ty: .4,   W: 2.1,  H: 1.25, az: .5,   el: .2 },  hl: { chest: 1, armU: .35 } },
  squats:  { pose: squat,   T: 2.2, tap: .65, cam: { tx: .14,  ty: .9,   W: 1.6,  H: 2.0,  az: .62,  el: .1 },  hl: { thigh: 1 } },
  lunges:  { pose: lunge,   T: 2.4, tap: .9,  cam: { tx: .5,   ty: .9,   W: 1.95, H: 2.0,  az: .5,   el: .1 },  hl: { thigh: 1 } },
  pullups: { pose: pullup,  T: 2.6, tap: .85, cam: { tx: 0,    ty: 1.27, W: 2.0,  H: 2.8,  az: -.85, el: .06 }, hl: { chest: 1, armL: .3 }, bar: true },
  dips:    { pose: dip,     T: 2.2, tap: .7,  cam: { tx: -.05, ty: 1.03, W: 1.6,  H: 2.25, az: .8,   el: .1 },  hl: { armU: 1 }, dipBars: true },
  plank:   { pose: plank,   T: 4,   tap: 1,   cam: { tx: -.2,  ty: .32,  W: 2.1,  H: 1.1,  az: .42,  el: .16 }, hl: { core: 1 } },
  burpees: { pose: burpee,  T: 3.4, tap: 1.6, cam: { tx: -.15, ty: 1.24, W: 2.05, H: 2.8,  az: .55,  el: .08 }, hl: { chest: .9 }, heart: true },
  hang:    { pose: hang,    T: 4,   tap: 1,   cam: { tx: 0,    ty: 1.27, W: 2.0,  H: 2.8,  az: .7,   el: .06 }, hl: { armL: 1 }, bar: true },
  walk:    { pose: walk,    T: 1.1, tap: 1.1, cam: { tx: 0,    ty: .92,  W: 1.5,  H: 2.05, az: .6,   el: .08 }, hl: { thigh: .6, shin: .8 }, moving: true },
  stretch: { pose: stretch, T: 6,   tap: 6,   cam: { tx: .08,  ty: 1.1,  W: 1.5,  H: 2.4,  az: .4,   el: .1 },  hl: { thigh: 1 } },
};
export const CELEBRATE = { tx: 0, ty: 1.2, W: 1.7, H: 2.7, az: .5, el: .1 };
