// Three.js-Darstellung: Galaxie, Sternsystem, Schlacht. Liest nur den Spielzustand.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { SYSTEMS, GATES, SHIPS } from '../game/data.js';
import { sysById, neighbors, playerVisible, shipCount } from '../game/sim.js';

const COL_PLAYER = 0x4fc3ff, COL_AI = 0xff4d5e;

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}
const GLOW = glowTexture();
function glow(color, size) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.scale.set(size, size, 1); return s; }

function starfield(n = 3000, r = 900) {
  const g = new THREE.BufferGeometry(); const p = new Float32Array(n * 3); const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(r * (0.6 + Math.random() * 0.4)); p.set([v.x, v.y, v.z], i * 3); const t = 0.5 + Math.random() * 0.5; c.set([t * 0.8, t * 0.9, t], i * 3); }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, vertexColors: true, sizeAttenuation: false }));
}
function label(html, cls = '') { const d = document.createElement('div'); d.className = 'lbl ' + cls; d.innerHTML = html; const o = new CSS2DObject(d); return o; }

function planetTexture(color, type, seed) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  const base = new THREE.Color(color); g.fillStyle = '#' + base.getHexString(); g.fillRect(0, 0, 256, 128);
  let s = seed; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  if (type.includes('Gas')) { for (let y = 0; y < 128; y += 4) { const k = 0.75 + r() * 0.5; g.fillStyle = '#' + base.clone().multiplyScalar(k).getHexString(); g.fillRect(0, y, 256, 3 + r() * 5); } }
  else for (let i = 0; i < 160; i++) { const k = 0.6 + r() * 0.7; g.fillStyle = '#' + base.clone().multiplyScalar(k).getHexString(); g.beginPath(); g.arc(r() * 256, r() * 128, 2 + r() * 14, 0, 7); g.fill(); }
  if (type.includes('Ozean') || type.includes('Dschungel')) { g.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 30; i++) { g.beginPath(); g.ellipse(r() * 256, r() * 128, 6 + r() * 20, 2 + r() * 4, 0, 0, 7); g.fill(); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function shipGeometry(type) {
  switch (type) {
    case 'jaeger': { const g = new THREE.ConeGeometry(0.7, 2.4, 4); g.rotateX(Math.PI / 2); return g; }
    case 'bomber': { const g = new THREE.ConeGeometry(1.2, 2.8, 3); g.rotateX(Math.PI / 2); return g; }
    case 'fregatte': { const g = new THREE.CylinderGeometry(0.6, 1.3, 5.5, 6); g.rotateX(Math.PI / 2); return g; }
    case 'zerstoerer': { const g = new THREE.OctahedronGeometry(1.5); g.scale(1.2, 0.8, 4.2); return g; }
    case 'plattform': return new THREE.OctahedronGeometry(3.2, 0);
  }
}
const GEOS = {}; for (const t in SHIPS) GEOS[t] = shipGeometry(t);

export class Renderer {
  constructor(canvas, labelsEl) {
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true }); this.r.setPixelRatio(Math.min(2, devicePixelRatio));
    this.labels = new CSS2DRenderer(); labelsEl.appendChild(this.labels.domElement); this.labels.domElement.style.position = 'absolute'; this.labels.domElement.style.inset = '0'; this.labels.domElement.style.pointerEvents = 'none';
    this.view = 'galaxy'; this.ray = new THREE.Raycaster(); this.mouse = new THREE.Vector2();
    this.views = { galaxy: this.makeGalaxy(), system: null, battle: null };
    this.resize(); addEventListener('resize', () => this.resize());
  }
  makeCam(pos) { const cam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 3000); cam.position.set(...pos); const ctl = new OrbitControls(cam, this.r.domElement); ctl.enableDamping = true; ctl.enabled = false; return { cam, ctl }; }
  resize() { this.r.setSize(innerWidth, innerHeight, false); this.labels.setSize(innerWidth, innerHeight); for (const v of Object.values(this.views)) if (v) { v.cam.aspect = innerWidth / innerHeight; v.cam.updateProjectionMatrix(); } }
  setView(name) {
    for (const [k, v] of Object.entries(this.views)) if (v) { v.ctl.enabled = k === name; v.scene.visible = k === name; if (k !== name) v.scene.traverse(o => { if (o.isCSS2DObject) o.element.style.display = 'none'; }); }
    this.view = name;
  }
  disposeView(v) { if (!v) return; v.ctl.dispose(); v.scene.traverse(o => { if (o.isCSS2DObject) o.element.remove(); }); }

  // ---------- Galaxie ----------
  makeGalaxy() {
    const scene = new THREE.Scene(); const { cam, ctl } = this.makeCam([0, 110, 140]); ctl.minDistance = 40; ctl.maxDistance = 450;
    scene.add(starfield()); scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const sys = {};
    for (const s of SYSTEMS) {
      const g = new THREE.Group(); g.position.set(...s.pos);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(3, 24, 16), new THREE.MeshBasicMaterial({ color: s.star })); mesh.userData.system = s.id; g.add(mesh);
      const gl = glow(s.star, 22); g.add(gl);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(7, 0.25, 6, 48), new THREE.MeshBasicMaterial({ color: COL_PLAYER, transparent: true, opacity: 0.8 })); ring.rotation.x = Math.PI / 2; g.add(ring);
      const sel = new THREE.Mesh(new THREE.TorusGeometry(9.5, 0.15, 6, 64), new THREE.MeshBasicMaterial({ color: 0xffffff })); sel.rotation.x = Math.PI / 2; sel.visible = false; g.add(sel);
      const lb = label(s.name); lb.position.set(0, 9, 0); g.add(lb);
      scene.add(g); sys[s.id] = { g, mesh, gl, ring, sel, lb };
    }
    for (const [a, b] of GATES) {
      const pa = new THREE.Vector3(...sysById(a).pos), pb = new THREE.Vector3(...sysById(b).pos);
      const geo = new THREE.BufferGeometry().setFromPoints([pa, pb]);
      const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0x4fc3ff, dashSize: 3, gapSize: 2, transparent: true, opacity: 0.55 })); line.computeLineDistances(); scene.add(line);
      for (const [p, q] of [[pa, pb], [pb, pa]]) { const t = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.35, 6, 20), new THREE.MeshBasicMaterial({ color: 0x9fe6ff })); t.position.copy(p).lerp(q, 0.12); t.lookAt(q); scene.add(t); }
    }
    const fleetGroup = new THREE.Group(); scene.add(fleetGroup);
    return { scene, cam, ctl, sys, fleetGroup, fleetMeshes: new Map() };
  }
  updateGalaxy(state, ui) {
    const v = this.views.galaxy;
    for (const s of SYSTEMS) {
      const o = v.sys[s.id]; const explored = state.explored[s.id];
      const owners = Object.values(state.planets).filter(p => p.system === s.id && p.owner).map(p => p.owner);
      const own = owners.includes('player'), ai = owners.includes('ai') && !!explored;
      o.mesh.material.color.set(explored ? s.star : 0x34404d); o.gl.material.color.set(explored ? s.star : 0x223040); o.gl.scale.setScalar(explored ? 22 : 10);
      o.ring.visible = !!(own || ai); o.ring.material.color.set(own && !ai ? COL_PLAYER : (own && ai ? 0xffb347 : COL_AI));
      o.sel.visible = ui.selectedSystem === s.id; o.sel.rotation.z += 0.01;
      const known = explored || neighbors(s.id).some(n => state.explored[n]);
      const html = explored ? `${s.name}<small>${own ? 'Eigenes Gebiet' : ai ? 'Draxis-Imperium' : 'Neutral'}</small>` : (known ? `? ${s.name}<small>unerforscht</small>` : '?<small>unbekannt</small>');
      if (o.lb.element.innerHTML !== html) o.lb.element.innerHTML = html;
      o.lb.element.className = 'lbl ' + (explored ? (own ? 'own' : ai ? 'ai' : '') : 'dim');
    }
    // Flotten
    const seen = new Set(); const idx = {};
    for (const f of state.fleets) {
      if (!shipCount(f)) continue;
      const visible = f.owner === 'player' || f.role === 'attack' || playerVisible(state, f.system) || (f.move && playerVisible(state, f.move.to));
      if (!visible) continue;
      seen.add(f.id);
      let m = v.fleetMeshes.get(f.id);
      if (!m) {
        const geo = new THREE.ConeGeometry(1.4, 3.6, 4); geo.rotateX(Math.PI / 2);
        m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: f.owner === 'player' ? COL_PLAYER : COL_AI }));
        const gl = glow(f.owner === 'player' ? COL_PLAYER : COL_AI, 8); m.add(gl); m.userData.fleet = f.id;
        const lb = label('', f.owner === 'player' ? '' : 'ai'); lb.position.set(0, -4, 0); m.add(lb); m.userData.lb = lb;
        v.fleetGroup.add(m); v.fleetMeshes.set(f.id, m);
      }
      const html = `${f.name} (${shipCount(f)})`; if (m.userData.lb.element.textContent !== html) m.userData.lb.element.textContent = html;
      m.scale.setScalar(ui.selectedFleet === f.id ? 1.4 : 1);
      if (f.move) {
        const a = new THREE.Vector3(...sysById(f.move.from).pos), b = new THREE.Vector3(...sysById(f.move.to).pos);
        m.position.copy(a).lerp(b, Math.min(1, f.move.t / f.move.total)); m.position.y += 2; m.lookAt(b.x, b.y + 2, b.z);
      } else {
        const k = (idx[f.system] = (idx[f.system] || 0) + 1); const p = new THREE.Vector3(...sysById(f.system).pos);
        const ang = k * 1.3 + (f.owner === 'ai' ? Math.PI : 0); m.position.set(p.x + Math.cos(ang) * 14, p.y - 2, p.z + Math.sin(ang) * 14); m.rotation.y += 0.01;
      }
    }
    for (const [id, m] of v.fleetMeshes) if (!seen.has(id)) { m.userData.lb.element.remove(); v.fleetGroup.remove(m); v.fleetMeshes.delete(id); }
  }

  // ---------- Sternsystem ----------
  buildSystem(sysId) {
    this.disposeView(this.views.system);
    const s = sysById(sysId); const scene = new THREE.Scene(); const { cam, ctl } = this.makeCam([0, 60, 90]); ctl.minDistance = 8; ctl.maxDistance = 260;
    scene.add(starfield()); scene.add(new THREE.AmbientLight(0x8899aa, 0.7));
    const light = new THREE.PointLight(s.star, 2.2, 0, 0); scene.add(light);
    const star = new THREE.Mesh(new THREE.SphereGeometry(5, 32, 24), new THREE.MeshBasicMaterial({ color: s.star })); scene.add(star); scene.add(glow(s.star, 40));
    const planets = [];
    s.planets.forEach((p, i) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(p.size, 32, 20), new THREE.MeshStandardMaterial({ map: planetTexture(p.color, p.type, i * 77 + 13), roughness: 0.9 }));
      mesh.userData.planet = p.id; const pivot = new THREE.Group(); pivot.rotation.y = i * 2.1; mesh.position.x = p.orbit; pivot.add(mesh); scene.add(pivot);
      if (p.type.includes('Gas')) { const r = new THREE.Mesh(new THREE.RingGeometry(p.size * 1.4, p.size * 2.1, 48), new THREE.MeshBasicMaterial({ color: 0xd9c49c, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })); r.rotation.x = Math.PI / 2.4; mesh.add(r); }
      const orbit = new THREE.Mesh(new THREE.RingGeometry(p.orbit - 0.08, p.orbit + 0.08, 128), new THREE.MeshBasicMaterial({ color: 0x4fc3ff, side: THREE.DoubleSide, transparent: true, opacity: 0.25 })); orbit.rotation.x = Math.PI / 2; scene.add(orbit);
      const sel = new THREE.Mesh(new THREE.RingGeometry(p.size * 1.5, p.size * 1.65, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })); sel.visible = false; mesh.add(sel);
      const lb = label(p.name); lb.position.set(0, p.size + 2, 0); mesh.add(lb);
      planets.push({ def: p, mesh, pivot, sel, lb, speed: 0.6 / Math.pow(p.orbit, 1.2) });
    });
    // Sprungtore
    const sp = new THREE.Vector3(...s.pos);
    for (const n of neighbors(sysId)) {
      const dir = new THREE.Vector3(...sysById(n).pos).sub(sp).setY(0).normalize();
      const gate = new THREE.Mesh(new THREE.TorusGeometry(4, 0.6, 8, 32), new THREE.MeshStandardMaterial({ color: 0x9fe6ff, emissive: 0x1b6fa8, metalness: 0.6, roughness: 0.3 }));
      gate.position.copy(dir.clone().multiplyScalar(62)); gate.lookAt(0, 0, 0); scene.add(gate); gate.add(glow(0x4fc3ff, 10));
      const lb = label(`Tor nach ${sysById(n).name}`); lb.position.set(0, 6, 0); gate.add(lb);
    }
    const fleetGroup = new THREE.Group(); scene.add(fleetGroup);
    this.views.system = { scene, cam, ctl, planets, sysId, fleetGroup, fleetKey: '' };
    this.setView(this.view);
  }
  updateSystem(state, ui, time) {
    const v = this.views.system; if (!v) return;
    for (const p of v.planets) {
      p.pivot.rotation.y += p.speed * 0.016; p.mesh.rotation.y += 0.004;
      p.sel.visible = ui.selectedPlanet === p.def.id; p.sel.lookAt(v.cam.position);
      const owner = state.planets[p.def.id].owner;
      const html = `${p.def.name}<small>${owner === 'player' ? 'Eigener Planet' : owner === 'ai' ? 'Draxis-Imperium' : p.def.type}</small>`;
      if (p.lb.element.innerHTML !== html) { p.lb.element.innerHTML = html; p.lb.element.className = 'lbl ' + (owner === 'player' ? 'own' : owner === 'ai' ? 'ai' : ''); }
    }
    // Flotten im System als kleine Schiffsgruppen
    const vis = playerVisible(state, v.sysId);
    const fl = state.fleets.filter(f => !f.move && f.system === v.sysId && shipCount(f) && (f.owner === 'player' || vis));
    const key = fl.map(f => f.id + ':' + shipCount(f)).join(',');
    if (key !== v.fleetKey) {
      v.fleetKey = key; v.fleetGroup.traverse(o => { if (o.isCSS2DObject) o.element.remove(); }); v.fleetGroup.clear();
      fl.forEach((f, i) => {
        const g = new THREE.Group(); const col = f.owner === 'player' ? COL_PLAYER : COL_AI; let k = 0;
        for (const t in f.ships) for (let j = 0; j < Math.min(f.ships[t], 12); j++) { const m = new THREE.Mesh(GEOS[t], new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.3 })); m.scale.setScalar(0.5); m.position.set((k % 5) * 1.6, Math.floor(k / 5) * 1.2, (Math.floor(k / 5) % 2) * 1.2); k++; g.add(m); }
        const ang = (f.owner === 'player' ? 0.6 : 3.6) + i * 0.5; g.position.set(Math.cos(ang) * 48, 4, Math.sin(ang) * 48); g.lookAt(0, 4, 0);
        const lb = label(`${f.name} (${shipCount(f)})`, f.owner === 'player' ? '' : 'ai'); lb.position.set(0, 5, 0); g.add(lb);
        v.fleetGroup.add(g);
      });
    }
  }

  // ---------- Schlacht ----------
  buildBattle(b) {
    this.disposeView(this.views.battle);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x02040a); const { cam, ctl } = this.makeCam([0, 40, 95]); ctl.minDistance = 15; ctl.maxDistance = 400;
    scene.add(starfield()); scene.add(new THREE.AmbientLight(0x7788aa, 0.6)); const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(50, 100, 30); scene.add(dl);
    const s = sysById(b.system); const st = glow(s.star, 300); st.position.set(-300, 120, -500); scene.add(st);
    const grid = new THREE.PolarGridHelper(160, 8, 6, 64, 0x0d3550, 0x0d3550); grid.position.y = -30; grid.material.transparent = true; grid.material.opacity = 0.35; scene.add(grid);
    const units = new Map();
    for (const u of b.units) {
      const col = u.side === 'player' ? COL_PLAYER : COL_AI;
      const m = new THREE.Mesh(GEOS[u.type], new THREE.MeshStandardMaterial({ color: 0x8899aa, emissive: col, emissiveIntensity: 0.45, flatShading: true, metalness: 0.4, roughness: 0.5 }));
      m.scale.setScalar(1.5); m.position.set(u.pos.x, u.pos.y, u.pos.z); scene.add(m); units.set(u.id, m);
      if (u.type === 'plattform') { const r = new THREE.Mesh(new THREE.TorusGeometry(5, 0.4, 6, 24), m.material); r.rotation.x = Math.PI / 2; m.add(r); }
    }
    const MAX = 4000;
    const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 6), 3)); lineGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX * 6), 3));
    const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending })); lines.frustumCulled = false; scene.add(lines);
    const ptGeo = new THREE.BufferGeometry(); ptGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3)); ptGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
    const pts = new THREE.Points(ptGeo, new THREE.PointsMaterial({ size: 1.6, map: GLOW, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); pts.frustumCulled = false; scene.add(pts);
    this.views.battle = { scene, cam, ctl, units, lines, pts, booms: [], battle: b, tactical: false, target: new THREE.Vector3() };
    this.setView(this.view);
  }
  toggleTactical() { const v = this.views.battle; if (!v) return; v.tactical = !v.tactical; if (v.tactical) { v.cam.position.set(v.target.x, 230, v.target.z + 1); } else v.cam.position.set(v.target.x, 40, v.target.z + 95); }
  updateBattle(b) {
    const v = this.views.battle; if (!v || v.battle !== b) return;
    const c = new THREE.Vector3(); let n = 0;
    for (const u of b.units) {
      const m = v.units.get(u.id); if (!m) continue;
      if (!u.alive) { if (m.visible) { m.visible = false; this.boom(v, m.position, u.side, SHIPS[u.type].size); } continue; }
      m.position.set(u.pos.x, u.pos.y, u.pos.z);
      if (u.heading) m.lookAt(u.pos.x + u.heading.x, u.pos.y + u.heading.y, u.pos.z + u.heading.z); else if (u.type === 'plattform') m.rotation.y += 0.01;
      m.material.emissiveIntensity = 0.15 + 0.6 * (u.shield / (u.maxShield || 1));
      c.add(m.position); n++;
    }
    if (n) { c.divideScalar(n); const d = c.clone().sub(v.target).multiplyScalar(0.03); v.target.add(d); v.ctl.target.add(d); v.cam.position.add(d); }
    // Schüsse
    const lp = v.lines.geometry.attributes.position.array, lc = v.lines.geometry.attributes.color.array; const pp = v.pts.geometry.attributes.position.array, pc = v.pts.geometry.attributes.color.array;
    let li = 0, pi = 0;
    for (const s of b.shots) {
      const col = s.side === 'player' ? [0.3, 0.85, 1] : [1, 0.35, 0.3];
      const k = Math.min(1, s.t / s.dur);
      const end = s.hit ? s.to : { x: s.to.x + (s.to.x - s.from.x) * 0.3, y: s.to.y + 4, z: s.to.z + (s.to.z - s.from.z) * 0.3 };
      const px = s.from.x + (end.x - s.from.x) * k, py = s.from.y + (end.y - s.from.y) * k, pz = s.from.z + (end.z - s.from.z) * k;
      if (s.weapon === 'laser') { if (li < 4000 && s.t < s.dur + 0.12) { lp.set([s.from.x, s.from.y, s.from.z, px, py, pz], li * 6); lc.set([...col, ...col], li * 6); li++; } }
      else if (s.t < s.dur && pi < 4000) { pp.set([px, py, pz], pi * 3); const cc = s.weapon === 'torpedo' ? [1, 0.75, 0.3] : col; pc.set(cc, pi * 3); pi++;
        if (li < 4000) { const k2 = Math.max(0, k - 0.08); lp.set([s.from.x + (end.x - s.from.x) * k2, s.from.y + (end.y - s.from.y) * k2, s.from.z + (end.z - s.from.z) * k2, px, py, pz], li * 6); lc.set([...cc, ...cc], li * 6); li++; } }
    }
    v.lines.geometry.setDrawRange(0, li * 2); v.lines.geometry.attributes.position.needsUpdate = true; v.lines.geometry.attributes.color.needsUpdate = true;
    v.pts.geometry.setDrawRange(0, pi); v.pts.geometry.attributes.position.needsUpdate = true; v.pts.geometry.attributes.color.needsUpdate = true;
    for (const bo of v.booms) { bo.life -= 0.016; bo.s.scale.setScalar(bo.size * (1 + (1 - bo.life) * 4)); bo.s.material.opacity = Math.max(0, bo.life); }
    v.booms = v.booms.filter(bo => { if (bo.life <= 0) { v.scene.remove(bo.s); return false; } return true; });
  }
  boom(v, pos, side, size) { const s = glow(side === 'player' ? 0x99ddff : 0xffaa55, 1); s.position.copy(pos); s.material.opacity = 1; v.scene.add(s); v.booms.push({ s, life: 1, size: 4 * size }); }

  pick(ev) {
    const v = this.views[this.view]; if (!v) return null;
    this.mouse.set(ev.clientX / innerWidth * 2 - 1, -ev.clientY / innerHeight * 2 + 1); this.ray.setFromCamera(this.mouse, v.cam);
    const hits = this.ray.intersectObjects(v.scene.children, true);
    for (const h of hits) { let o = h.object; while (o) { if (o.userData.system || o.userData.planet || o.userData.fleet) return o.userData; o = o.parent; } }
    return null;
  }
  focusSystem(id) { const v = this.views.galaxy; const p = new THREE.Vector3(...sysById(id).pos); const d = p.clone().sub(v.ctl.target); v.ctl.target.add(d); v.cam.position.add(d); }
  render() { const v = this.views[this.view]; if (!v) return; v.ctl.update(); this.r.render(v.scene, v.cam); this.labels.render(v.scene, v.cam); }
}
