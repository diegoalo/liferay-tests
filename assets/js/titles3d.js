/* ════════ titulos en 3D ════════
   Cualquier elemento con data-3d="title" que lleve dentro uno o varios <svg>
   (DIEGOALO, BIO, ALO!, WORK y las letras de la newsletter) se convierte en
   letras extruidas que flotan, cada una a su ritmo, y se inclinan hacia el cursor.

   - Cada subtrazado del SVG es una letra: se extruye por separado con un bisel de
     pocas caras (facetado, de 3D temprano) y gira sobre su propio centro.
   - El color sale del relleno que pinta el navegador (respeta el CSS de cada pagina).
   - El SVG se queda en el DOM (accesibilidad, y por si no hay WebGL); solo se
     oculta cuando el primer fotograma 3D ya esta pintado. */
import { THREE, createView, lights, REDUCED, damp, wake } from './retro3d.js';
import { SVGLoader } from '../vendor/SVGLoader.js';

const loader = new SVGLoader();

function build(host) {
  const svgs = [...host.querySelectorAll('svg')];
  if (!svgs.length) return;
  const view = createView(host, { pad: .16, pixel: 2, levels: 7, grain: .045, shift: .6, fov: 22 });
  if (!view) return;
  const { scene } = view;
  lights(scene);
  const root = new THREE.Group(); scene.add(root);

  /* letras: geometria en unidades del viewBox, se recoloca en cada resize */
  const letters = [];
  const mats = new Map();
  svgs.forEach((svg, si) => {
    const vb = (svg.getAttribute('viewBox') || '0 0 100 100').split(/[ ,]+/).map(Number);
    const data = loader.parse(svg.outerHTML);
    const domPaths = [...svg.querySelectorAll('path')];
    data.paths.forEach((p, pi) => {
      const el = domPaths[pi];
      const fill = el ? getComputedStyle(el).fill : null;
      const col = new THREE.Color(fill && fill !== 'none' ? fill : '#f41519');
      const key = col.getHexString();
      let mat = mats.get(key);
      if (!mat) {
        mat = new THREE.MeshPhongMaterial({
          /* caras planas: el brillo las barre enteras al girar (destello de 3D de
             los 90), pero contenido para que el color de marca aguante */
          color: col, specular: 0x4a4a4a, shininess: 40, flatShading: true,
        });
        mats.set(key, mat);
      }
      const depth = vb[2] * .11;
      for (const shape of SVGLoader.createShapes(p)) {
        const g = new THREE.ExtrudeGeometry(shape, {
          depth, curveSegments: 5,                 /* pocas caras en las curvas: facetado */
          bevelEnabled: true, bevelThickness: depth * .16, bevelSize: vb[2] * .009, bevelSegments: 1,
        });
        g.computeBoundingBox();
        const c = new THREE.Vector3(); g.boundingBox.getCenter(c);
        g.translate(-c.x, -c.y, -c.z);
        const m = new THREE.Mesh(g, mat);
        root.add(m);
        letters.push({ m, svg, vb, cx: c.x, cy: c.y, ph: letters.length * .93 + si * .4 });
      }
    });
  });
  if (!letters.length) { view.renderer.dispose(); view.renderer.domElement.remove(); return; }

  /* coloca cada letra donde esta en el SVG, en pixeles CSS de la caja */
  view.onResize = (w, h) => {
    const hr = host.getBoundingClientRect();
    for (const L of letters) {
      const r = L.svg.getBoundingClientRect();
      let sx = r.width / L.vb[2], sy = r.height / L.vb[3], ox = 0, oy = 0;
      /* si el SVG no se estira (preserveAspectRatio por defecto), el dibujo va
         centrado a escala uniforme dentro de su caja: igual aqui */
      if ((L.svg.getAttribute('preserveAspectRatio') || '') !== 'none') {
        const s = Math.min(sx, sy);
        ox = (r.width - L.vb[2] * s) / 2; oy = (r.height - L.vb[3] * s) / 2; sx = sy = s;
      }
      const X = (r.left - hr.left) + ox + (L.cx - L.vb[0]) * sx;
      const Y = (r.top - hr.top) + oy + (L.cy - L.vb[1]) * sy;
      L.x = X - w / 2; L.y = -(Y - h / 2);
      L.m.scale.set(sx, -sy, sx);
      L.m.position.set(L.x, L.y, 0);
      L.amp = Math.min(r.height, r.width) * .012;  /* vaiven en px, proporcional al tamano */
    }
  };

  /* clic (o toque) en una letra: da una vuelta entera sobre si misma y el resto la
     sigue en ola desde ella. Si el clic cae entre letras, gira la palabra entera. */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const SPIN = 1.05;   /* segundos por vuelta */
  let clock = 0;
  host.addEventListener('click', e => {
    const c = view.renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - c.left) / c.width) * 2 - 1, -((e.clientY - c.top) / c.height) * 2 + 1);
    ray.setFromCamera(ndc, view.camera);
    const hit = ray.intersectObjects(letters.map(L => L.m), false)[0];
    let from = hit ? letters.findIndex(L => L.m === hit.object) : -1;
    if (from < 0) {
      /* la letra mas cercana al punto del clic, en vertical (los titulos van en columna) */
      const y = -((e.clientY - c.top) - c.height / 2);
      from = letters.reduce((b, L, i) => Math.abs(L.y - y) < Math.abs(letters[b].y - y) ? i : b, 0);
    }
    const dir = (e.clientX - (c.left + c.width / 2)) < 0 ? -1 : 1;
    letters.forEach((L, i) => {
      /* una vuelta mas sobre la que ya lleve, y en el sentido del clic */
      L.spin = { t0: clock + Math.abs(i - from) * .07, from: L.spinAt || 0, to: (L.spinAt || 0) + dir * Math.PI * 2 };
    });
    wake();
  });
  const ease = u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  function spinOf(L) {
    if (!L.spin) return L.spinAt || 0;
    const u = Math.min(1, Math.max(0, (clock - L.spin.t0) / SPIN));
    const a = L.spin.from + (L.spin.to - L.spin.from) * ease(u);
    if (u >= 1) { L.spinAt = L.spin.to % (Math.PI * 2); L.spin = null; return L.spinAt; }
    return a;
  }

  let last = 0;
  const tilt = { x: 0, y: 0 }, aim = { x: 0, y: 0 };
  view.update = t => {
    const dt = Math.min(.05, last ? t - last : .016); last = t;
    clock = t;
    if (REDUCED) {
      /* quieto, pero en 3D: un giro fijo enseña el volumen */
      root.rotation.set(-.12, .32, 0);
      letters.forEach((L, i) => { L.m.rotation.set(0, (i % 2 ? -1 : 1) * .06, 0); });
      return;
    }
    const p = view.pointer();
    const k = p.inside ? .42 : .14;                   /* al pasar por encima, mas giro */
    aim.x = THREE.MathUtils.clamp(p.x, -1.5, 1.5) * k;
    aim.y = THREE.MathUtils.clamp(p.y, -1.5, 1.5) * k * .7;
    tilt.x = damp(tilt.x, aim.x, 4, dt); tilt.y = damp(tilt.y, aim.y, 4, dt);
    root.rotation.set(-tilt.y, tilt.x, 0);
    for (const L of letters) {
      const f = L.ph;
      L.m.rotation.set(.1 * Math.sin(t * .53 + f * 1.7), .24 * Math.sin(t * .7 + f) + spinOf(L), .035 * Math.sin(t * .41 + f));
      L.m.position.set(L.x, L.y + L.amp * Math.sin(t * .8 + f * 1.3), L.amp * 2.2 * Math.sin(t * .9 + f));
    }
  };

  /* el SVG se oculta solo cuando ya hay 3D pintado */
  const draw = view.draw;
  view.draw = t => { draw(t); if (!host.classList.contains('is-3d')) host.classList.add('is-3d'); };
  view.start();
}

function init() {
  document.querySelectorAll('[data-3d="title"]').forEach(h => {
    const go = () => { try { build(h); } catch (e) { console.warn('3D off:', e); } };
    /* los que estan ocultos (el DIEGOALO de movil en escritorio y al reves) no
       gastan contexto WebGL hasta que se ven */
    if (h.clientWidth) return go();
    const ro = new ResizeObserver(() => { if (h.clientWidth) { ro.disconnect(); go(); } });
    ro.observe(h);
  });
  wake();
}
/* en cuanto estan las fuentes (las cajas ya tienen su tamano); sin esperar al load */
(document.fonts ? document.fonts.ready : Promise.resolve()).then(init, init);
