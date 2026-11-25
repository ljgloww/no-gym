// scene.js — the 3D stage: lights, floor, equipment, camera and the athlete on it.
// The body lives in figure.js and the movements in moves.js; this file runs the show.
import * as THREE from '../vendor/three.module.min.js';
import { COL, Figure, clamp, lerp, ease } from './figure.js';
import { EXS, CELEBRATE, victory, makePose, copyPose, lerpPose, wob } from './moves.js';

const _a = new THREE.Vector3();

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
    this.life = { breath: 0, blink: 0, effort: 0, smile: 0, gaze: 0, gazeY: 0, sweat: 0 };
    this.breathPh = 0; this.breathHz = .24; this.blinkT = 2; this.idleT = 0; this.idle = 0;
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

    // soft studio reflections, so skin, hair and shoes pick up light the way real surfaces do
    try {
      const pm = new THREE.PMREMGenerator(this.renderer), room = new THREE.Scene();
      const card = (color, k, w, h, x, y, z) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
        m.position.set(x, y, z); m.lookAt(0, 0, 0); room.add(m);
      };
      room.background = new THREE.Color(0x06070a);
      card(0xffffff, 5, 4, 4, 0, 6, 0); card(0xfff0dc, 3.5, 3, 3, 4, 3, 4); card(COL.volt, 1.6, 2, 3, -4, 2, -4); card(0xff8a66, 1.2, 3, 2, -5, 1, 2);
      s.environment = pm.fromScene(room, .05).texture; pm.dispose();
    } catch (e) { /* no reflections on this device: the lights alone still work */ }

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

  /** The layer that never stops: breathing, a little sway, blinking, and a glance at you while it waits. */
  _alive(dt, ex) {
    const o = this.out, t = this.t, k = this.ctx.k, L = this.life;
    this.breathHz = lerp(this.breathHz, .23 + .4 * k + (this.loop ? .07 : 0), 1 - Math.exp(-dt * .7));
    this.breathPh += dt * this.breathHz * Math.PI * 2;
    const br = .5 - .5 * Math.cos(this.breathPh);
    L.breath = br * (.75 + .9 * k);
    this.blinkT -= dt;
    if (this.blinkT < -.14) this.blinkT = 1.8 + Math.random() * 3.6;
    L.blink = this.blinkT < 0 ? Math.sin(Math.PI * -this.blinkT / .14) : 0;

    const waiting = !this.loop && this.queue === 0 && this.u === 0 && this.victory <= 0;
    this.idleT = waiting ? this.idleT + dt : 0;
    this.idle = lerp(this.idle, this.idleT > 1.2 ? 1 : 0, 1 - Math.exp(-dt * 2.2));
    // the face: strain shows on the hard part of a rep and builds as the set gets heavy; a grin when it's won, a small one for you
    const push = this.loop ? .5 - .5 * Math.cos(this.u * Math.PI * 2) : Math.sin(Math.PI * this.u);
    const strain = this.victory > 0 ? 0 : clamp(push * (.25 + .75 * k) + .35 * k, 0, 1) * (ex.moving ? .3 : 1);
    L.effort = lerp(L.effort, strain, 1 - Math.exp(-dt * 7));
    L.smile = lerp(L.smile, this.victory > 0 ? 1 : .35 * this.idle, 1 - Math.exp(-dt * 5));
    L.sweat = lerp(L.sweat, k, 1 - Math.exp(-dt * .3));
    if (this.reduced) return;
    const n1 = wob(t, .7), n2 = wob(t, .53, 2.1), n3 = wob(t, .31, 4.2), sway = ex.steady ? .4 : 1;
    o.pelvis.z += n1 * .006 * sway; o.chest.z += n2 * .007 * sway; o.chest.x += n3 * .004 * sway;
    o.sA.y += br * .004; o.sB.y += br * .004;
    const az = this.cam ? this.cam.az : ex.cam.az;
    const glance = clamp((Math.PI / 2 - az) * .55, -.65, .65) * this.idle * (.75 + .25 * Math.sin(t * .45));
    o.look.x += n3 * .05 + glance; o.look.y += n2 * .025; o.look.z += n1 * .02;
    L.gaze = lerp(L.gaze, clamp((Math.PI / 2 - az) * .3, -.32, .32) * this.idle + n3 * .05, 1 - Math.exp(-dt * 9));     // the eyes get there before the head
    L.gazeY = n2 * .03;
  }

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
    if (this.blend < 1) { this.blend = Math.min(1, this.blend + dt / .5); lerpPose(this.out, this.snap, this.pose, ease(this.blend)); }
    else copyPose(this.out, this.pose);
    this._alive(dt, ex);
    this.figure.update(this.out, this.life);

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
