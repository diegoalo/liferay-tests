/* ════════ retro3d ════════
   Motor comun del 3D del site: titulos que flotan (DIEGOALO, BIO, ALO!, WORK)
   y objetos (DVD, CD, libro) de la newsletter.

   Estetica de 3D temprano, de render de los 90: se pinta a baja resolucion y se
   escala con los pixeles a la vista, luces Phong con brillos duros y un pase final
   de tramado ordenado (Bayer 8x8, el mismo tipo de tramado que las imagenes de
   ALO!), algo de grano y un pelin de desfase de color.

   Cada vista es un canvas dentro de su elemento (asi se mueve con el aunque sea
   sticky o este entrando con su animacion) y todas comparten un unico bucle que
   solo pinta las que estan en pantalla y para con la pestana oculta.
   Sin WebGL no pasa nada: el SVG original sigue ahi. */
import * as THREE from '../vendor/three.module.min.js';
export { THREE };

export const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SMALL = () => matchMedia('(max-width:700px)').matches;

/* ---------- pase final: tramado ordenado + grano + desfase ---------- */
const POST_VS = `varying vec2 vUv;
void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`;
const POST_FS = `precision highp float;
uniform sampler2D tex; uniform vec2 res; uniform float t, levels, grain, shift;
varying vec2 vUv;
float b2(vec2 a){ a=floor(a); return fract(dot(a, vec2(.5, a.y*.75))); }
float b4(vec2 a){ return b2(.5*a)*.25 + b2(a); }
float b8(vec2 a){ return b4(.5*a)*.25 + b2(a); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1./2.4))-.055, step(.0031308, c)); }
void main(){
  vec4 c=texture2D(tex, vUv);
  if(c.a<.5) discard;                         /* bordes duros, de pixel */
  float dx=shift/res.x;
  c.r=texture2D(tex, vUv+vec2(dx,0.)).a>.5 ? texture2D(tex, vUv+vec2(dx,0.)).r : c.r;
  c.b=texture2D(tex, vUv-vec2(dx,0.)).a>.5 ? texture2D(tex, vUv-vec2(dx,0.)).b : c.b;
  vec3 s=toSRGB(clamp(c.rgb,0.,1.));
  s+=(hash(gl_FragCoord.xy+fract(t)*91.7)-.5)*grain;
  float L=levels-1.;
  s=floor(s*L + b8(gl_FragCoord.xy)) / L;     /* cuantiza con umbral Bayer: tramado */
  gl_FragColor=vec4(clamp(s,0.,1.),1.);
}`;

/* ---------- bucle unico ---------- */
const views = new Set();
let raf = 0;
function frame(now) {
  raf = 0;
  const t = now / 1000;
  let live = false;
  for (const v of views) {
    if (!v.onScreen || !v.ready) continue;
    v.draw(t);
    live = true;
  }
  if (live && !REDUCED && !document.hidden) raf = requestAnimationFrame(frame);
}
export function wake() { if (!raf) raf = requestAnimationFrame(frame); }
document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });

/* puntero global: cada vista lo lee relativo a su caja */
const ptr = { x: -1e4, y: -1e4, has: false };
addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || e.pointerType === 'pen') { ptr.x = e.clientX; ptr.y = e.clientY; ptr.has = true; } }, { passive: true });

/* giroscopio (movil): inclinar el telefono hace girar las letras y los objetos.
   El cero es como sujetas el movil al empezar y se va recentrando poco a poco,
   asi que solo cuentan los giros, no la postura. iOS pide permiso: se pregunta
   al primer toque en la pagina (Safari solo deja pedirlo tras un gesto). */
const gyro = { x: 0, y: 0, on: false, b0: null, g0: null };
const clampG = v => v < -1.2 ? -1.2 : v > 1.2 ? 1.2 : v;
function onOrient(e) {
  if (e.beta == null || e.gamma == null) return;
  const a = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  /* en horizontal se intercambian los ejes */
  let lr = e.gamma, fb = e.beta;
  if (a === 90) { lr = e.beta; fb = -e.gamma; } else if (a === -90 || a === 270) { lr = -e.beta; fb = e.gamma; }
  if (gyro.b0 === null) { gyro.b0 = fb; gyro.g0 = lr; }
  gyro.b0 += (fb - gyro.b0) * .006; gyro.g0 += (lr - gyro.g0) * .006;
  gyro.x = clampG((lr - gyro.g0) / 22);
  gyro.y = clampG((gyro.b0 - fb) / 22);
  gyro.on = true;
  wake();
}
if ('DeviceOrientationEvent' in window && matchMedia('(pointer:coarse)').matches && !REDUCED) {
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    /* el aviso de iOS no salta al tocar un enlace o un boton (cortaria la navegacion):
       espera a un toque en cualquier otra parte */
    const ask = e => {
      if (e.target.closest && e.target.closest('a, button, [data-3d="dvd"], [data-3d="cd"], [data-3d="book"]')) return;
      removeEventListener('pointerup', ask);
      DeviceOrientationEvent.requestPermission()
        .then(s => { if (s === 'granted') { removeEventListener('deviceorientation', onOrient); addEventListener('deviceorientation', onOrient); } })
        .catch(() => {});
    };
    addEventListener('pointerup', ask, { passive: true });
    /* si ya se dio permiso en otra pagina del site, los eventos llegan sin volver a
       preguntar: se escucha desde el principio (si no hay permiso, no llega nada) */
    addEventListener('deviceorientation', onOrient);
  } else addEventListener('deviceorientation', onOrient);
}

const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => {
  for (const e of es) { const v = e.target.__r3d; if (v) v.onScreen = e.isIntersecting; }
  wake();
}, { rootMargin: '120px 0px' }) : null;

/* ---------- una vista ----------
   host: elemento al que se pega el canvas (tiene que ir con position:relative)
   opts.pad: margen extra alrededor de la caja, en fraccion del lado mayor (lo que
             sobresale al girar)
   opts.pixel: px CSS por pixel de render (2 = bien gordo)
   opts.levels / grain / shift: el tramado del pase final
   opts.fov: apertura de la camara (poca = casi isometrico)
   opts.crisp: sin estetica retro (resolucion de pantalla, antialias y sin tramado),
               para lo que tiene que leerse nitido, como las portadas */
export function createView(host, opts = {}) {
  const o = Object.assign({ pad: .14, pixel: 2, levels: 7, grain: .05, shift: .6, fov: 22, crisp: false }, opts);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: o.crisp, alpha: true, powerPreference: 'low-power' });
  } catch (e) { return null; }
  if (!renderer.getContext()) return null;
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);

  /* el canvas va absoluto dentro del elemento: si este no esta posicionado se le
     da relative (los que ya son sticky, como BIO o ALO!, se dejan como estan) */
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  const canvas = renderer.domElement;
  canvas.className = 'r3d-canvas' + (o.crisp ? ' is-crisp' : '');
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(o.fov, 1, 1, 10);
  const rt = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: true, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter });
  const post = new THREE.ShaderMaterial({
    vertexShader: POST_VS, fragmentShader: POST_FS, depthTest: false, depthWrite: false,
    uniforms: { tex: { value: rt.texture }, res: { value: new THREE.Vector2(2, 2) }, t: { value: 0 },
                levels: { value: o.levels }, grain: { value: o.grain }, shift: { value: o.shift } }
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post);
  const postScene = new THREE.Scene(); postScene.add(quad);
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const v = {
    host, scene, camera, renderer, o, onScreen: !io, ready: false,
    w: 0, h: 0, pad: 0, update: null, onResize: null,
    tilt: new THREE.Vector2(), hover: 0,
    /* puntero relativo al centro de la caja, -1..1 (y hacia arriba) */
    pointer() {
      if (!ptr.has && gyro.on) return { x: gyro.x, y: gyro.y, inside: true };
      if (!ptr.has) return { x: 0, y: 0, inside: false };
      const r = host.getBoundingClientRect();
      const x = (ptr.x - (r.left + r.width / 2)) / Math.max(1, r.width / 2);
      const y = -(ptr.y - (r.top + r.height / 2)) / Math.max(1, r.height / 2);
      return { x, y, inside: Math.abs(x) <= 1 && Math.abs(y) <= 1 };
    },
    resize() {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return false;
      const pad = Math.round(o.pad * Math.max(w, h));
      /* a lo ancho, el canvas nunca pasa del borde de la pantalla: si sobresale, la
         pagina se hace mas ancha que el movil y iOS la aleja (zoom y margenes mal) */
      const r = host.getBoundingClientRect(), vw = document.documentElement.clientWidth;
      const free = o.clampX === false;   /* el cursor se mueve por toda la pantalla: margen completo */
      const padL = free ? pad : Math.max(0, Math.min(pad, Math.floor(r.left))), padR = free ? pad : Math.max(0, Math.min(pad, Math.floor(vw - r.right)));
      const W = w + padL + padR, H = h + 2 * pad;
      Object.assign(canvas.style, { left: -padL + 'px', top: -pad + 'px', width: W + 'px', height: H + 'px' });
      let rw, rh;
      if (o.crisp) {
        /* a resolucion de pantalla (hasta 2x) */
        renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
        renderer.setSize(W, H, false);
        rw = W; rh = H;
      } else {
        const px = SMALL() ? Math.max(o.pixel, 1.5) : o.pixel;
        rw = Math.max(2, Math.round(W / px)); rh = Math.max(2, Math.round(H / px));
        renderer.setSize(rw, rh, false);
      }
      rt.setSize(rw, rh);
      post.uniforms.res.value.set(rw, rh);
      /* la caja del elemento ocupa exactamente su sitio en el plano z=0 */
      camera.aspect = W / H;
      const d = (H / 2) / Math.tan(THREE.MathUtils.degToRad(o.fov / 2));
      camera.position.set(0, 0, d); camera.near = d * .2; camera.far = d * 4;
      camera.lookAt(0, 0, 0);
      /* si el margen izquierdo y el derecho no son iguales, se desplaza el encuadre
         (no la camara) para que el centro de la caja siga cayendo en su sitio */
      camera.setViewOffset(W, H, (padR - padL) / 2, 0, W, H);
      camera.updateProjectionMatrix();
      v.w = w; v.h = h; v.pad = pad;
      if (v.onResize) v.onResize(w, h);
      return true;
    },
    draw(t) {
      if (v.update) v.update(t);
      if (o.crisp) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
      post.uniforms.t.value = t;
      renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, camera);
      renderer.setRenderTarget(null); renderer.clear(); renderer.render(postScene, postCam);
    },
    start() {
      v.ready = v.resize();
      if (io) io.observe(host); else v.onScreen = true;
      host.__r3d = v;
      views.add(v);
      v.ro = new ResizeObserver(() => { if (v.resize()) { v.ready = true; if (REDUCED) v.draw(0); wake(); } });
      v.ro.observe(host);
      if (v.ready) v.draw(0);           /* un primer fotograma ya, aunque no haya bucle */
      wake();
    },
    /* fuera del bucle y suelta el contexto WebGL (el cursor, si la maquina no puede) */
    destroy() {
      views.delete(v);
      if (io) io.unobserve(host);
      if (v.ro) v.ro.disconnect();
      rt.dispose(); renderer.dispose(); renderer.forceContextLoss();
      canvas.remove();
    },
  };
  return v;
}

/* ---------- luces de render de los 90 ----------
   Llave blanca arriba a la izquierda, contra magenta por detras a la derecha y un
   relleno azul desde abajo. Las intensidades van multiplicadas por PI (luces
   fisicas de three): la cara que mira a camara sale con su color real. */
export function lights(scene, { key = 1.9, amb = 1.05, rim = 0xff4fd8, fill = 0x3d5cff } = {}) {
  scene.add(new THREE.AmbientLight(0xffffff, amb));
  const k = new THREE.DirectionalLight(0xffffff, key); k.position.set(-.45, .6, 1); scene.add(k);
  const r = new THREE.DirectionalLight(rim, 1.6); r.position.set(.9, .15, -.55); scene.add(r);
  const f = new THREE.DirectionalLight(fill, .9); f.position.set(.2, -1, .3); scene.add(f);
  /* un punto para el brillo duro que recorre las caras al girar */
  const p = new THREE.PointLight(0xffffff, 0, 0, 0); scene.add(p);
  return { key: k, rim: r, fill: f, spot: p };
}

/* reflejos de plastico: un cubo de entorno oscuro con tiras de luz, hecho en canvas */
export function studioEnv() {
  const S = 128, faces = [];
  for (let i = 0; i < 6; i++) {
    const c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, S); g.addColorStop(0, '#2a2f3a'); g.addColorStop(1, '#07080b');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    x.fillStyle = '#ffffff';
    if (i === 0) { x.fillRect(S * .18, 0, S * .12, S); x.fillRect(S * .62, 0, S * .05, S); }   /* +x: dos tiras */
    if (i === 1) { x.fillRect(S * .4, 0, S * .2, S); }                                          /* -x */
    if (i === 2) { x.fillRect(0, S * .35, S, S * .3); }                                         /* +y: techo */
    if (i === 4) { x.globalAlpha = .55; x.fillRect(S * .1, S * .1, S * .35, S * .8); x.globalAlpha = 1; } /* +z, detras de camara */
    if (i === 5) { x.fillStyle = '#ff4fd8'; x.globalAlpha = .5; x.fillRect(S * .7, S * .2, S * .1, S * .6); }
    faces.push(c);
  }
  const t = new THREE.CubeTexture(faces); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}

export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
