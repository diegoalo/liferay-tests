/* ════════ cursor 3D (la parte con three.js) ════════
   La pide cursor3d.js solo si la maquina puede; mientras tanto, y si no, se queda el
   cursor 2D pixelado del sistema.

   La flecha de toda la vida (cursor.vox de MagicaVoxel: 11 x 19) y la mano de los
   enlaces, en voxeles: contorno negro algo mas grueso que el relleno blanco, que
   queda un poco hundido, y pintadas con el mismo motor retro que los titulos.

   - Flota: sube y baja un poco y se balancea.
   - Al entrar en algo pulsable da una vuelta sobre si misma y, al ponerse de canto,
     pasa a ser la mano, inclinada hacia fuera (la muñeca hacia ti), que da golpecitos
     con el dedo; al salir, vuelta al reves y vuelve a ser la flecha. Al salir espera
     un instante: pasar por el hueco entre dos enlaces no la hace girar.
   - Los cartelitos de antes (GO, SAY HI :), ROAR!...) salen en 3D: un cartel con
     grosor que cae colgado junto al cursor y se balancea con el movimiento.
   - Sobre un enlace que no esta activo (aria-disabled, .is-soon, :disabled) se "apaga":
     se oscurece, se queda medio transparente y se ladea dormida.
   - El clic cae en la punta de la flecha o en la yema del dedo: las inclinaciones
     giran sobre ese punto. Se inclina con el movimiento del raton y se hunde al pulsar.
   - Si no hay WebGL, si es por software o si la pagina va lenta con el 3D, avisa
     (fail) y se quita: vuelve el 2D. */
import { THREE, createView, lights, REDUCED, damp, wake } from './retro3d.js';

export function start({ ARROW, HAND, HOT, OFF, P, on3d, fail }) {
  /* todos los listeners cuelgan de esta señal: si hay que volver al 2D, se van de golpe */
  const ac = new AbortController(), sig = { signal: ac.signal }, sigp = { passive: true, signal: ac.signal };
  const VS = 3;          /* px CSS por voxel: la flecha mide 33 x 57 y la mano 48 x 66 */
  const AX = 4 * VS;     /* eje de la vuelta: vertical, a 4 voxeles a la derecha del punto del clic */

  /* la caja es la de la flecha, con el punto del clic en su esquina de arriba a la
     izquierda; el margen del canvas deja sitio a la mano y a las vueltas */
  const host = document.createElement('div');
  host.className = 'cur3d';
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, { width: ARROW[0].length * VS + 'px', height: ARROW.length * VS + 'px' });
  document.body.appendChild(host);

  const view = createView(host, { pad: .8, pixel: 1, levels: 7, grain: .02, shift: .5, fov: 30, clampX: false });
  if (!view) { host.remove(); fail('nogl'); return; }
  /* WebGL por software (sin grafica, o con la aceleracion apagada): ni lo intenta */
  let gpu = '';
  try {
    const gl = view.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  } catch (e) { /* sin nombre: se juzga por como va */ }
  if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(gpu)) { view.destroy(); host.remove(); fail('soft'); return; }

  const ink = new THREE.MeshPhongMaterial({ color: 0x050505, specular: 0x1a1a1a, shininess: 20, flatShading: true });
  const paper = new THREE.MeshPhongMaterial({
    color: 0xffffff, specular: 0x5a5a5a, shininess: 30, flatShading: true, emissive: 0x4a4a4a,
  });

  /* una forma: solo las caras que dan al aire. El contorno sobresale del relleno por
     delante y por detras, asi que sus lados tambien se ven donde toca relleno */
  function shape(art, hx, hy) {
    const R = art.length, W = art[0].length;
    const at = (x, y) => (y >= 0 && y < R && x >= 0 && x < W) ? art[y][x] : ' ';
    const solid = c => c === '#' || c === 'o';
    const build = (ch, z, open) => {
      const pos = [], nor = [];
      const quad = (a, b, c, d, n) => { for (const p of [a, b, c, a, c, d]) { pos.push(...p); nor.push(...n); } };
      for (let y = 0; y < R; y++) for (let x = 0; x < W; x++) {
        if (at(x, y) !== ch) continue;
        const x0 = x, x1 = x + 1, y0 = -y, y1 = -y - 1, z0 = -z, z1 = z;
        quad([x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1], [0, 0, 1]);       /* delante */
        quad([x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0], [0, 0, -1]);      /* detras */
        if (open(at(x - 1, y))) quad([x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0], [-1, 0, 0]);
        if (open(at(x + 1, y))) quad([x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1], [1, 0, 0]);
        if (open(at(x, y - 1))) quad([x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], [0, 1, 0]);
        if (open(at(x, y + 1))) quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, -1, 0]);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      return g;
    };
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(build('#', 1, c => c !== '#'), ink));
    grp.add(new THREE.Mesh(build('o', .7, c => !solid(c)), paper));
    grp.scale.setScalar(VS);
    /* el punto del clic (hx, hy) de la forma cae en el origen de `tip` */
    grp.position.set(-AX - hx * VS, hy * VS, 0);
    return grp;
  }

  /* tip: pivote en el punto del clic (inclinaciones); spin: la vuelta, sobre un eje
     vertical que pasa mas o menos por el centro de las dos formas */
  const tip = new THREE.Group(), spin = new THREE.Group();
  spin.position.x = AX;
  const arrow = shape(ARROW, 0, 0), hand = shape(HAND, 6, 0);
  hand.visible = false;
  spin.add(arrow, hand); tip.add(spin); view.scene.add(tip);
  lights(view.scene, { key: 2, amb: 1.25 });
  let baseX = 0, baseY = 0;
  view.onResize = (w, h) => { baseX = -w / 2; baseY = h / 2; tip.position.set(baseX, baseY, 0); };

  /* movimiento: la caja sigue al raton al instante (fuera del bucle) y la forma se
     inclina segun la velocidad, suavizada */
  let mx = -100, my = -100, vx = 0, vy = 0, lx = null, ly = null, press = 0, shown = false;
  const place = () => { host.style.transform = `translate3d(${mx}px,${my}px,0)`; };
  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    mx = e.clientX; my = e.clientY; place();
    if (lx !== null) { vx += (mx - lx); vy += (my - ly); }
    lx = mx; ly = my;
    if (!shown) { shown = true; host.classList.add('is-on'); }
    probe(e.target);
  }, sigp);
  document.addEventListener('mouseleave', () => { shown = false; host.classList.remove('is-on'); }, sig);
  addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') press = 1; }, sig);

  /* flecha o mano. La vuelta va de 0 a una vuelta entera al entrar y de vuelta a 0
     al salir; si se cambia a mitad, se da la vuelta desde donde este */
  const TAU = Math.PI * 2, SPIN = .6;
  let want = false, isHand = false, turn = 0, tFrom = 0, tTo = 0, tAt = -1, clock = 0, edge = null;
  const show = h => { isHand = h; arrow.visible = !h; hand.visible = h; };
  function aim(h) {
    if (h === want) return;
    want = h;
    if (REDUCED) { show(h); return; }
    const k = turn / TAU;
    tFrom = turn; tTo = (h ? Math.floor(k + 1e-6) + 1 : Math.ceil(k - 1e-6) - 1) * TAU; tAt = clock;
  }

  /* encima de algo pulsable, o de algo apagado; y fuera sobre los iframes (YouTube),
     que se quedan el raton y no avisan de donde esta. Se mira en cada movimiento (no
     solo al cruzar de un elemento a otro) y otra vez tras el scroll, que mueve la
     pagina por debajo de un raton quieto */
  let isOff = false, leaveAt = 0, reprobe = false;
  function probe(t) {
    if (!t || !t.closest) return;
    isOff = !!t.closest(OFF);
    if (!isOff && t.closest(HOT)) { leaveAt = 0; aim(true); }
    else if (want && !leaveAt) leaveAt = performance.now() + 110;
    host.classList.toggle('is-off', isOff);
    if (t.tagName === 'IFRAME') { shown = false; host.classList.remove('is-on'); }
  }
  document.addEventListener('mouseover', e => probe(e.target), sig);
  addEventListener('scroll', () => { reprobe = true; }, { passive: true, capture: true, signal: ac.signal });

  /* salida rapida con un pelin de rebote al final */
  const back = u => { const c = 1.1; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };
  let last = 0, sx = 0, sy = 0, hv = 0, of = 0;
  /* vigilante: si con el cursor 3D la pagina va a menos de ~40 fps durante un rato
     (maquina lenta, modo ahorro, pestaña con mucho 3D), vuelve al cursor 2D, que lo
     pinta el sistema y no se retrasa nunca */
  let warm = 0, slow = 0, dead = false, quit = '';
  function watch(raw) {
    if (!enabled || !shown || document.hidden || raw <= 0 || raw > .5) return;
    if (document.documentElement.classList.contains('loading')) return;
    warm += raw;
    if (warm < 1.5) return;                       /* el arranque (shaders, texturas) no cuenta */
    slow = raw > 1 / 40 ? slow + raw : Math.max(0, slow - raw * .5);
    if (slow > 1.5) quit = 'slow';             /* se quita al acabar este fotograma */
  }
  function stop(why) {
    if (dead) return; dead = true;
    ac.abort();
    view.destroy(); host.remove();
    if (sign) sign.destroy();
    fail(why);
  }

  view.update = t => {
    const raw = last ? t - last : 0;
    clock = t;
    const dt = Math.min(.05, last ? t - last : .016); last = t;
    watch(raw);
    if (reprobe) { reprobe = false; if (shown) probe(document.elementFromPoint(mx, my)); }
    if (leaveAt && performance.now() >= leaveAt) { leaveAt = 0; aim(false); }
    /* la velocidad se acumula entre fotogramas y se suaviza */
    sx = damp(sx, vx / Math.max(dt, .008) / 1000, 10, dt); sy = damp(sy, vy / Math.max(dt, .008) / 1000, 10, dt);
    vx = 0; vy = 0;
    press = damp(press, 0, 9, dt);
    hv = damp(hv, isHand ? 1 : 0, REDUCED ? 60 : 8, dt);
    of = damp(of, isOff ? 1 : 0, REDUCED ? 60 : 5, dt);
    const lean = REDUCED ? 0 : THREE.MathUtils.clamp(sx, -2.5, 2.5);
    const dip = REDUCED ? 0 : THREE.MathUtils.clamp(sy, -2.5, 2.5);

    /* flotar: vaiven vertical y balanceo lento; apagada, casi quieta */
    const A = REDUCED ? 0 : 1 - of * .75;
    const bob = Math.sin(t * 2.1) * 2.5 * A;
    const sway = Math.sin(t * 1.15) * .3 * A;
    const nod = Math.sin(t * 1.7) * .07 * A;
    const tilt = Math.sin(t * .8 + 1) * .06 * A;
    /* la mano da golpecitos con el dedo */
    const tap = REDUCED ? 0 : Math.pow(Math.max(0, Math.sin(t * 6)), 6) * hv;

    if (tAt >= 0) {
      const u = (t - tAt) / SPIN;
      if (u >= 1) { turn = tTo; tAt = -1; } else turn = tFrom + (tTo - tFrom) * back(Math.max(0, u));
    }
    const yaw = -.3 + lean * .18 + sway + hv * .62;
    /* el cambio de forma, justo cuando se pone de canto (no se ve el salto) */
    const e = Math.floor((yaw + turn - Math.PI / 2) / Math.PI);
    if (isHand !== want && ((edge !== null && e !== edge) || tAt < 0)) show(want);
    edge = e;

    tip.position.set(baseX, baseY + bob, 0);
    tip.rotation.set(.26 + dip * .12 + press * .5 + nod - hv * .62 + tap * .28 - of * .12, yaw, -lean * .06 + tilt + of * .5);
    spin.rotation.y = turn;
    tip.scale.setScalar((1 - press * .12) * (1 - tap * .05) * (1 - of * .08));
    if (sign) sign.tick(t, dt, sx, sy);

    /* apagada: la luz propia baja y el blanco se queda gris */
    paper.color.setScalar(1 - of * .5);
    paper.emissive.setScalar(.29 * (1 - of));
  };
  const sign = tagSign(() => ({ x: mx, y: my, on: shown }), ac.signal);
  /* si el raton ya se movio mientras cargaba, sale ya donde esta */
  if (P.has) { mx = P.x; my = P.y; lx = mx; ly = my; place(); shown = true; host.classList.add('is-on'); probe(P.target); }
  /* el 2D se cambia por el 3D cuando ya hay un fotograma pintado con el cursor a la vista */
  let enabled = false;
  const draw = view.draw;
  view.draw = t => {
    draw(t);
    if (quit) { stop(quit); return; }
    if (!enabled && shown) { enabled = true; on3d(); }
  };
  view.start();
}

/* ---------- cartelito 3D ----------
   El texto, sus colores y cuando sale los sigue poniendo cada pagina en el cartel
   de antes (.cursor-tag .tag, oculto): aqui solo se lee y se pinta en un cartel con
   grosor, colgado de su borde de arriba. Al salir cae balanceandose; al cambiar de
   texto vuelve a caer con el nuevo; al irse se pliega hacia dentro. */
function tagSign(pointer, signal) {
  const old = document.querySelector('.cursor-tag .tag');
  if (!old) return null;
  const th = document.createElement('div');
  th.className = 'cur3d-tag';
  th.setAttribute('aria-hidden', 'true');
  Object.assign(th.style, { width: '40px', height: '24px' });
  document.body.appendChild(th);
  const tv = createView(th, { pad: .3, pixel: 1, levels: 7, grain: .02, shift: .4, fov: 30, clampX: false });
  if (!tv) { th.remove(); return null; }
  lights(tv.scene, { key: 2, amb: 1.25 });

  /* la cara con el texto va sin luces (los colores de marca, tal cual); los cantos
     con luz, en el mismo color mas oscuro */
  const face = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const edge = new THREE.MeshPhongMaterial({ color: 0x888888, specular: 0x222222, shininess: 20, flatShading: true });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [edge, edge, edge, edge, face, edge]);
  const hinge = new THREE.Group(); hinge.add(box); tv.scene.add(hinge);
  tv.onResize = (w, h) => {
    hinge.position.set(0, h / 2, 0);
    box.scale.set(w, h, Math.max(6, Math.round(h * .38)));
    box.position.y = -h / 2;
  };

  const cv = document.createElement('canvas'), cx = cv.getContext('2d');
  let key = '', W = 40, H = 24, up = false;
  function paint(text) {
    const cs = getComputedStyle(old);
    if (cs.textTransform === 'uppercase') text = text.toUpperCase();
    const fs = parseFloat(cs.fontSize) || 20;
    const font = `${cs.fontWeight || 400} ${fs}px ${cs.fontFamily}`;
    cx.font = font;
    const padX = Math.round(fs * .4);
    W = Math.ceil(cx.measureText(text).width) + padX * 2; H = Math.round(fs * 1.5);
    const S = 2;
    cv.width = W * S; cv.height = H * S;
    cx.setTransform(S, 0, 0, S, 0, 0);
    cx.fillStyle = cs.backgroundColor; cx.fillRect(0, 0, W, H);
    cx.fillStyle = cs.color; cx.font = font; cx.textBaseline = 'middle';
    cx.fillText(text, padX, H / 2 + fs * .05);
    /* textura nueva en cada texto (cambia de tamano) */
    if (face.map) face.map.dispose();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
    face.map = tex; face.needsUpdate = true;
    edge.color.setStyle(cs.backgroundColor).multiplyScalar(.5);
    Object.assign(th.style, { width: W + 'px', height: H + 'px' });
    tv.resize();
  }

  /* estado: oculto, cayendo, colgado o plegandose */
  let mode = 'off', t0 = -1, from = 0, ang = 0, ry = 0, rz = 0;
  const DROP = .55, FOLD = .16;
  const swing = u => { const c = 1.7; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };
  const place = p => {
    th.style.transform = `translate3d(${Math.round(p.x + 42)}px,${Math.round(up ? p.y - H - 20 : p.y + 46)}px,0)`;
  };
  addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && mode !== 'off') place(pointer()); }, { passive: true, signal });

  tv.update = t => {
    if (mode === 'in') {
      if (t0 < 0) t0 = t;
      const u = Math.min(1, (t - t0) / DROP);
      /* cae desde tumbado hacia ti (de canto) hasta colgar, pasandose un poco */
      ang = REDUCED ? -.2 : -.2 + (from + .2) * (1 - swing(u));
      if (u >= 1) mode = 'hang';
    } else if (mode === 'out') {
      if (t0 < 0) t0 = t;
      const u = Math.min(1, (t - t0) / FOLD);
      ang = ang + (Math.PI / 2 - ang) * u;
      if (u >= 1 || REDUCED) { mode = 'off'; th.style.transform = 'translate3d(-9999px,0,0)'; }
    }
    hinge.rotation.set(ang, ry, rz);
  };

  tv.start();
  return {
    destroy() { tv.destroy(); th.remove(); if (face.map) face.map.dispose(); },
    /* desde el bucle del cursor (que siempre corre): decide si sale, y con que */
    tick(t, dt, sx, sy) {
      const p = pointer();
      const text = (old.textContent || '').trim();
      const want = p.on && text !== '' && document.body.classList.contains('over-tag');
      if (want) {
        up = document.body.classList.contains('tag-up');
        const k = text + '|' + old.style.getPropertyValue('--tagbg') + '|' + up;
        if (k !== key) {
          key = k; paint(text);
          /* nuevo texto: cae (si ya estaba colgado, solo desde medio camino) */
          from = mode === 'off' || mode === 'out' ? -Math.PI / 2 : -Math.PI / 4;
          mode = 'in'; t0 = -1;
          place(p); wake();
        }
      } else if (mode !== 'off' && mode !== 'out') { mode = 'out'; t0 = -1; key = ''; }
      /* balanceo: gira con el movimiento horizontal y se ladea; en reposo, un vaiven.
         Nunca del todo de frente: un poco girado y con la base hacia ti, para que se
         vean el canto de la izquierda y el de abajo, como la mano */
      const idle = REDUCED ? 0 : Math.sin(t * 1.4) * .06;
      ry = damp(ry, .3 + THREE.MathUtils.clamp(sx * .22, -.6, .6) + idle, 6, dt);
      rz = damp(rz, THREE.MathUtils.clamp(-sx * .06, -.15, .15), 6, dt);
      if (mode === 'hang' && !REDUCED) ang = damp(ang, -.2 + THREE.MathUtils.clamp(-sy * .18, -.45, .45), 5, dt);
    },
  };
}
