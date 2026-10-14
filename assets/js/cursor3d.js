/* ════════ cursor ════════
   Ligero y sin three.js: lo primero que hace es poner un cursor 2D pixelado (la
   flecha y la mano de siempre, en PNG generados aqui) como cursor del sistema, que
   lo pinta el sistema y no se retrasa nunca. Despues, si la maquina puede, pide la
   version 3D (cursor3d-gl.js) y la cambia en cuanto tiene el primer fotograma.

   Se queda en 2D (y no descarga el 3D):
   - si se pide reducir el movimiento, o el ahorro de datos;
   - con pocos nucleos o poca memoria (menos de 4);
   - si en esta sesion el 3D ya fue lento o no habia WebGL de verdad.
   El 3D, ya en marcha, tambien se quita solo si la pagina va lenta con el.

   Los cartelitos (GO, SAY HI :)...) en 2D son los de antes, que cada pagina sigue
   colocando junto al raton; en 3D, el cursor 3D los copia en un cartel con grosor.
   Solo con raton (pointer:fine). */

/* # contorno, o relleno; lo demas, aire */
const ARROW = [
  '#          ',
  '##         ',
  '#o#        ',
  '#oo#       ',
  '#ooo#      ',
  '#oooo#     ',
  '#ooooo#    ',
  '#oooooo#   ',
  '#ooooooo#  ',
  '#oooooooo# ',
  '#ooooo#####',
  '#oo#oo#    ',
  '#o# #oo#   ',
  '##  #oo#   ',
  '#    #oo#  ',
  '     #oo#  ',
  '      #oo# ',
  '      #oo# ',
  '       ### ',
];
const HAND = [
  '.....##.........',
  '....#oo#........',
  '....#oo#........',
  '....#oo#........',
  '....#oo#........',
  '....#oo###......',
  '....#oo#oo###...',
  '....#oo#oo#oo##.',
  '....#oo#oo#oo#o#',
  '###.#oo#oo#oo#o#',
  '#oo##oo#oo#oo#o#',
  '#ooo#oooooooo#o#',
  '#oooooooooooooo#',
  '.#ooooooooooooo#',
  '..#oooooooooooo#',
  '..#ooooooooooo#.',
  '...#oooooooooo#.',
  '...#oooooooooo#.',
  '....#oooooooo#..',
  '.....#ooooooo#..',
  '.....#ooooooo#..',
  '.....#########..',
];
const HOT = 'a[href], button, [role="button"], summary, label, select, [data-cursor], [data-3d]';
const OFF = '[aria-disabled="true"], .is-soon, :disabled';

(function () {
  if (!matchMedia('(pointer:fine)').matches) return;
  const root = document.documentElement;
  const store = (k, v) => {
    try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ }
    return null;
  };

  /* ---------- 2D: PNG de cada forma, a 1x y a 2x (pantallas retina) ---------- */
  function png(art, vs, fill, ink) {
    const c = document.createElement('canvas');
    c.width = art[0].length * vs; c.height = art.length * vs;
    const x = c.getContext('2d');
    art.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch !== '#' && ch !== 'o') return;
      x.fillStyle = ch === '#' ? ink : fill;
      x.fillRect(i * vs, j * vs, vs, vs);
    }));
    return c.toDataURL('image/png');
  }
  /* cursor: url() de reserva y, donde se entienda, image-set() para que en retina
     salga nitido; el punto del clic va en px CSS */
  function cur(art, hx, hy, fill, ink, fb) {
    const a = png(art, 2, fill, ink), b = png(art, 4, fill, ink), at = `${hx * 2} ${hy * 2}, ${fb} !important`;
    return `cursor:url(${a}) ${at};` +
      `cursor:-webkit-image-set(url(${a}) 1x, url(${b}) 2x) ${at};` +
      `cursor:image-set(url(${a}) 1x, url(${b}) 2x) ${at}`;
  }
  const arrow = cur(ARROW, 0, 0, '#fff', '#000', 'auto');
  const hand = cur(HAND, 6, 0, '#fff', '#000', 'pointer');
  const dim = cur(ARROW, 0, 0, '#8c8c8c', '#2a2a2a', 'not-allowed');

  const st = document.createElement('style');
  st.textContent = `
/* 2D: el del sistema, pixelado. Gana a los cursor:none de cada pagina */
html.cur2d,html.cur2d *{${arrow}}
html.cur2d :is(${HOT}),html.cur2d :is(${HOT}) *{${hand}}
html.cur2d.cur2d :is(${OFF}),html.cur2d.cur2d :is(${OFF}) *{${dim}}
/* del cursor de antes solo se quedan los cartelitos */
html.cur2d .cursor,html.cur2d .cursor-tag .ic{display:none !important}

/* 3D */
.cur3d{position:fixed;left:0;top:0;z-index:10002;pointer-events:none;opacity:0;transition:opacity .2s ease;will-change:transform}
html.has-cur3d .cur3d.is-on{opacity:1}
html.has-cur3d .cur3d.is-off{opacity:.4}
.cur3d .r3d-canvas,.cur3d-tag .r3d-canvas{position:absolute;pointer-events:none;image-rendering:pixelated}
.cur3d-tag{position:fixed;left:0;top:0;z-index:10001;pointer-events:none;will-change:transform;transform:translate3d(-9999px,0,0)}
html:not(.has-cur3d) .cur3d-tag,html.loading .cur3d,html.loading .cur3d-tag{visibility:hidden}
html.has-cur3d .cursor,html.has-cur3d .cursor-tag{display:none !important}
html.has-cur3d,html.has-cur3d *{cursor:none !important}
`;
  document.head.appendChild(st);
  root.classList.add('cur2d');

  /* ---------- ¿3D? ---------- */
  const conn = navigator.connection || {};
  const weak = (navigator.hardwareConcurrency || 8) < 4 || (navigator.deviceMemory || 8) < 4 || conn.saveData;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (weak || calm || store('dg-cur2d')) return;

  /* donde esta el raton mientras carga, para que el 3D salga ya en su sitio */
  const P = { x: 0, y: 0, has: false, target: null };
  const ac = new AbortController();
  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    P.x = e.clientX; P.y = e.clientY; P.has = true; P.target = e.target;
  }, { passive: true, signal: ac.signal });

  import('./cursor3d-gl.js').then(m => {
    ac.abort();
    m.start({
      ARROW, HAND, HOT, OFF, P,
      on3d() { root.classList.remove('cur2d'); root.classList.add('has-cur3d'); },
      /* vuelta al 2D, y en el resto de la sesion ya ni se intenta */
      fail(why) { root.classList.remove('has-cur3d'); root.classList.add('cur2d'); store('dg-cur2d', why || '1'); },
    });
  }).catch(() => { ac.abort(); });
})();
