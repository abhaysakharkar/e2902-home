import * as THREE from 'three';

// WebXR for the walk page.
//   VR (Quest etc.): stand in the flat at true scale. Left stick walks (with wall collision), right stick snap-turns,
//                    trigger at the floor teleports, A/X cycles the room's layout, B/Y toggles the lights.
//   AR dollhouse:    tap a table to put the flat there at 1:40.
//   AR true scale:   stand at the real front door and start; furniture, kitchen and fit-check pieces appear at full size
//                    while the model's own walls and floors are hidden so the real ones show through.
// WebXR needs a secure page: https, or http://localhost.

const PI = Math.PI;
const DOLL = 40;           // dollhouse scale 1:40
const SNAP = PI / 6;       // 30° snap turn

export function setupXR(o) {
  const { renderer, scene, camera, home, free, player } = o;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  // Taps on the AR overlay's own buttons must not also count as an AR 'select' (placing the dollhouse).
  o.overlay.addEventListener('beforexrselect', (e) => e.preventDefault());
  const rig = new THREE.Group(); rig.name = 'xr-rig';
  scene.add(rig); rig.add(camera);

  let mode = null;           // 'vr' | 'ar-doll' | 'ar-true'
  let hitSource = null, placed = false;
  const tmp = new THREE.Vector3(), head = new THREE.Vector3(), dir = new THREE.Vector3();
  const xrCam = () => renderer.xr.getCamera();

  // ---------------------------------------------------------------- controllers + teleport marker
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.24, 32).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd27a, toneMapped: false }));
  marker.visible = false; scene.add(marker);
  const controllers = [0, 1].map((i) => {
    const c = renderer.xr.getController(i);
    const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -6)]), new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.6 }));
    c.add(ray);
    c.userData = { ray, target: null, source: null, prev: [] };
    c.addEventListener('connected', (e) => { c.userData.source = e.data; ray.visible = mode === 'vr'; });
    c.addEventListener('disconnected', () => { c.userData.source = null; });
    c.addEventListener('selectstart', () => onSelect(c));
    rig.add(c);
    return c;
  });
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ray = new THREE.Ray();
  function aimAt(c) {
    c.updateMatrixWorld();
    ray.origin.setFromMatrixPosition(c.matrixWorld);
    ray.direction.set(0, 0, -1).transformDirection(c.matrixWorld);
    const p = ray.intersectPlane(floor, new THREE.Vector3());
    return p && p.distanceTo(ray.origin) < 12 && free(p.x, p.z) ? p : null;
  }

  // ---------------------------------------------------------------- what AR hides
  // True scale: the real walls, floors, windows and railing are there already; only the new things are drawn.
  const M = home.M;
  const shell = new Set([M.wall, M.paint, M.frame, M.glass, M.glassF, M.marble, M.oak, M.deck, M.tileF, M.tile, M.stone]);
  const hidden = [];
  function hide(obj) { if (obj && obj.visible) { obj.visible = false; hidden.push(obj); } }
  function hideShell() {
    scene.traverse((m) => {
      if (!m.isMesh || m === marker) return;
      const mats = [].concat(m.material);
      if (mats.every((x) => shell.has(x))) hide(m);
    });
    for (const w of home.wallish) hide(w.m);
  }
  function hideWorld() { for (const x of o.worldObjects()) hide(x); hide(home.ceilGroup); }
  function restore() { for (const x of hidden.splice(0)) x.visible = true; }
  const fullWalls = () => { for (const w of home.wallish) { w.m.scale.y = w.unit ? 2.86 : 1; } };
  function cutWalls(h) {
    for (const w of home.wallish) {
      const full = w.y1 - w.y0, hh = Math.min(full, Math.max(0, h - w.y0));
      w.m.visible = hh > 0.002;
      w.m.scale.y = Math.max(hh, 1e-4) / (w.unit ? 1 : full);
    }
  }

  // ---------------------------------------------------------------- sessions
  const support = { vr: false, ar: false };
  const ready = (async () => {
    if (!navigator.xr) return support;
    try { support.vr = await navigator.xr.isSessionSupported('immersive-vr'); } catch { /* no */ }
    try { support.ar = await navigator.xr.isSessionSupported('immersive-ar'); } catch { /* no */ }
    return support;
  })();
  let saved = null;
  async function start(m) {
    if (renderer.xr.isPresenting) return;
    const ar = m !== 'vr';
    const init = ar
      ? { requiredFeatures: ['local-floor'], optionalFeatures: ['hit-test', 'dom-overlay'], domOverlay: { root: o.overlay } }
      : { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] };
    const session = await navigator.xr.requestSession(ar ? 'immersive-ar' : 'immersive-vr', init);
    mode = m;
    saved = { bg: scene.background, fog: scene.fog };
    if (ar) {
      scene.background = null; scene.fog = null;
      hideWorld();
      if (m === 'ar-true') hideShell();
      if (m === 'ar-doll') cutWalls(1.2);
    }
    controllers.forEach((c) => (c.userData.ray.visible = m === 'vr'));
    await renderer.xr.setSession(session);
    // Start where you are standing in the walk, facing the same way.
    rig.scale.setScalar(1);
    rig.position.set(player.x, 0, player.z);
    rig.rotation.set(0, player.yaw, 0);
    placed = false;
    if (m === 'ar-doll') {
      rig.visible = true;
      try {
        const space = await session.requestReferenceSpace('viewer');
        hitSource = await session.requestHitTestSource({ space });
      } catch { hitSource = null; }
      reticle.visible = false;
      // Until a surface is tapped, park the dollhouse a metre in front of you at table height.
      placeDoll(new THREE.Vector3(0, 0.75, -1));
    }
    o.overlay.dataset.mode = m;
    session.addEventListener('end', end);
    session.addEventListener('select', () => { if (mode === 'ar-doll') placeFromReticle(); });
    o.onStart && o.onStart(m);
  }
  function end() {
    restore();
    fullWalls();
    if (saved) { scene.background = saved.bg; scene.fog = saved.fog; }
    rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0); rig.scale.setScalar(1);
    marker.visible = false; reticle.visible = false;
    hitSource = null; mode = null;
    delete o.overlay.dataset.mode;
    o.onEnd && o.onEnd();
  }
  // Dollhouse: the middle of the flat sits on the tapped point (given in XR space), at 1:40.
  const CENTER = new THREE.Vector3(7.1, 0, 5.05);
  function placeDoll(p) {
    rig.scale.setScalar(DOLL);
    rig.rotation.set(0, 0, 0);
    rig.position.copy(CENTER).addScaledVector(p, -DOLL);
    placed = true;
  }
  const reticle = new THREE.Mesh(new THREE.RingGeometry(0.04, 0.05, 32).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd27a, toneMapped: false }));
  reticle.visible = false; reticle.matrixAutoUpdate = true;
  // The reticle is drawn in world space at the hit point mapped through the rig (see update).
  scene.add(reticle);

  // True-scale alignment nudges (AR overlay buttons).
  function nudge(kind) {
    const step = 0.05, rot = 2 * PI / 180;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(xrCam().quaternion); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    xrCam().getWorldPosition(head);
    if (kind === 'l' || kind === 'r') { const a = kind === 'l' ? rot : -rot; rotateAbout(head, a); }
    if (kind === 'f') rig.position.addScaledVector(fwd, -step);
    if (kind === 'b') rig.position.addScaledVector(fwd, step);
    if (kind === 'sl') rig.position.addScaledVector(right, step);
    if (kind === 'sr') rig.position.addScaledVector(right, -step);
    if (kind === 'up') rig.position.y -= 0.02;
    if (kind === 'down') rig.position.y += 0.02;
  }
  function rotateAbout(p, a) {
    tmp.copy(rig.position).sub(p).applyAxisAngle(THREE.Object3D.DEFAULT_UP, a);
    rig.position.copy(p).add(tmp);
    rig.rotation.y += a;
  }

  // ---------------------------------------------------------------- per frame
  let turnLatch = false;
  function onSelect(c) {
    if (mode !== 'vr') return;
    const p = aimAt(c);
    if (!p) return;
    xrCam().getWorldPosition(head);
    rig.position.x += p.x - head.x; rig.position.z += p.z - head.z;
  }
  // Returns true while presenting, so the page renders the XR frame itself.
  function update(dt, frame) {
    if (!renderer.xr.isPresenting) return false;
    const cam = xrCam();
    cam.getWorldPosition(head);
    if (mode === 'vr') {
      cam.getWorldDirection(dir); dir.y = 0; dir.normalize();
      const right = new THREE.Vector3(-dir.z, 0, dir.x);
      let mx = 0, mz = 0, turn = 0;
      for (const c of controllers) {
        const src = c.userData.source, gp = src && src.gamepad;
        if (!gp) continue;
        const ax = gp.axes.length >= 4 ? [gp.axes[2], gp.axes[3]] : [gp.axes[0] || 0, gp.axes[1] || 0];
        if (src.handedness === 'left') { mx += ax[0]; mz += ax[1]; } else turn += ax[0];
        // Buttons: 4 = A/X, 5 = B/Y (xr-standard mapping)
        gp.buttons.forEach((b, i) => { const was = c.userData.prev[i]; c.userData.prev[i] = b.pressed; if (b.pressed && !was && (i === 4 || i === 5)) o.onButton && o.onButton(i); });
        // Teleport marker
        const p = aimAt(c);
        if (src.handedness === 'right' || controllers.every((k) => !k.userData.source || k === c)) { marker.visible = !!p; if (p) marker.position.set(p.x, 0.01, p.z); }
      }
      // Walk with the left stick, relative to where you look, sliding along walls.
      const dead = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      mx = dead(mx); mz = dead(mz);
      if (mx || mz) {
        const sp = 1.6 * dt;
        const vx = (dir.x * -mz + right.x * mx) * sp, vz = (dir.z * -mz + right.z * mx) * sp;
        if (free(head.x + vx, head.z)) rig.position.x += vx;
        if (free(head.x, head.z + vz)) rig.position.z += vz;
      }
      // Snap turn with the right stick.
      if (Math.abs(turn) > 0.7 && !turnLatch) { rotateAbout(head, -Math.sign(turn) * SNAP); turnLatch = true; }
      if (Math.abs(turn) < 0.3) turnLatch = false;
    }
    if (mode === 'ar-doll' && hitSource && frame) {
      const hits = frame.getHitTestResults(hitSource);
      if (hits.length) {
        const pose = hits[0].getPose(renderer.xr.getReferenceSpace());
        // pose is in XR space; show the reticle there by mapping through the rig.
        const p = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(pose.transform.matrix));
        reticle.position.copy(p).applyMatrix4(rig.matrixWorld);
        reticle.scale.setScalar(rig.scale.x);
        reticle.position.y += 0.002 * rig.scale.x;
        reticle.visible = true;
        reticle.userData.xr = p;
      } else reticle.visible = false;
    }
    // Keep the walk's notion of "where you are" in sync for room names and the map.
    if (mode !== 'ar-doll') { player.x = head.x; player.z = head.z; }
    return true;
  }
  // Tapping places the dollhouse at the last surface the reticle found.
  const placeFromReticle = () => { if (reticle.userData.xr) placeDoll(reticle.userData.xr.clone()); };

  return {
    rig, ready, support, start, update, nudge,
    get mode() { return mode; },
    get presenting() { return renderer.xr.isPresenting; },
    placeHere: placeFromReticle,
    end: () => renderer.xr.getSession()?.end(),
  };
}
