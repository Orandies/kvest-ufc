(function () {
  'use strict';
  TVQ.boot();
  const S = TVQ.sfx;

  const START  = [0.36, 0.64, 0.22];            
  const TOL = 0.03;                             
  const SPAN = [0.30, 0.30, 0.35];              

  const W = 320, H = 240;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const cvs = $('screen'), ctx = cvs.getContext('2d');
  const vals = START.slice();
  let on = false, locked = false, phase = 0, last = 0, lastStatus = '', serverQuality = 0;

  const base = document.createElement('canvas');
  base.width = W; base.height = H;
  function drawBars(g) {
    const top = Math.floor(H * 0.67), mid = Math.floor(H * 0.08), bw = W / 7;
    ['#bfbfbf', '#bfbf00', '#00bfbf', '#00bf00', '#bf00bf', '#bf0000', '#0000bf'].forEach((c, i) => {
      g.fillStyle = c; g.fillRect(Math.round(i * bw), 0, Math.ceil(bw), top);
    });
    ['#0000bf', '#131313', '#bf00bf', '#131313', '#00bfbf', '#131313', '#bfbfbf'].forEach((c, i) => {
      g.fillStyle = c; g.fillRect(Math.round(i * bw), top, Math.ceil(bw), mid);
    });
    const by = top + mid, bh = H - by, q = Math.round(bw * 1.25);
    g.fillStyle = '#131313'; g.fillRect(0, by, W, bh);
    g.fillStyle = '#00214c'; g.fillRect(0, by, q, bh);
    g.fillStyle = '#ffffff'; g.fillRect(q, by, q, bh);
    g.fillStyle = '#32006a'; g.fillRect(q * 2, by, q, bh);
    g.fillStyle = '#000'; g.fillRect(66, 70, 188, 62);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 27px "Anonymous Pro", monospace'; g.fillText('КАНАЛ 02', 160, 90);
    g.font = 'bold 12px "Anonymous Pro", monospace'; g.fillText('ТЕСТОВАЯ ТАБЛИЦА', 160, 116);
  }
  const baseCtx = base.getContext('2d');
  let src;
  function renderBase() { drawBars(baseCtx); src = baseCtx.getImageData(0, 0, W, H).data; }
  renderBase();
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('bold 27px "Anonymous Pro"', 'КАНАЛ 02'), document.fonts.load('bold 12px "Anonymous Pro"', 'ТЕСТОВАЯ ТАБЛИЦА')]).then(renderBase).catch(() => {});
  }
  const img = ctx.createImageData(W, H), out = img.data;

  let muted = false;
  $('snd').addEventListener('click', function () {
    muted = !muted; S.init(); S.setMuted(muted);
    this.textContent = muted ? 'ЗВУК: ВЫКЛ' : 'ЗВУК: ВКЛ';
    this.setAttribute('aria-pressed', String(!muted));
  });

  function buildKnob(el, i) {
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    for (let k = 0; k <= 10; k++) {
      const a = (-135 + 27 * k) * Math.PI / 180, ln = document.createElementNS(ns, 'line');
      ln.setAttribute('x1', 50 + Math.sin(a) * 42); ln.setAttribute('y1', 50 - Math.cos(a) * 42);
      ln.setAttribute('x2', 50 + Math.sin(a) * 48); ln.setAttribute('y2', 50 - Math.cos(a) * 48);
      ln.setAttribute('stroke', k % 5 === 0 ? '#ffb000' : '#5b666a'); ln.setAttribute('stroke-width', k % 5 === 0 ? 2.4 : 1.6);
      ln.setAttribute('stroke-linecap', 'round'); svg.appendChild(ln);
    }
    const cap = document.createElement('div'); cap.className = 'cap';
    el.appendChild(svg); el.appendChild(cap);
    el._cap = cap;
    paint(i);

    let drag = false, lastA = 0;
    const centre = () => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
    el.addEventListener('pointerdown', (e) => {
      if (!on || locked) return;
      S.init(); drag = true; el.setPointerCapture(e.pointerId);
      const c = centre(); lastA = Math.atan2(e.clientY - c[1], e.clientX - c[0]); e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const c = centre(), a = Math.atan2(e.clientY - c[1], e.clientX - c[0]);
      let d = a - lastA;
      if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
      lastA = a; setVal(i, vals[i] + d / (1.5 * Math.PI));
    });
    const stop = () => { drag = false; };
    el.addEventListener('pointerup', stop); el.addEventListener('pointercancel', stop);
    el.addEventListener('wheel', (e) => {
      if (!on || locked) return; e.preventDefault();
      setVal(i, vals[i] - Math.sign(e.deltaY) * 0.012);
    }, { passive: false });
    el.addEventListener('keydown', (e) => {
      if (!on || locked) return;
      const step = e.shiftKey ? 0.05 : 0.01, m = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: 0.1, PageDown: -0.1 };
      if (m[e.key] !== undefined) { e.preventDefault(); setVal(i, vals[i] + m[e.key]); }
    });
  }
  function paint(i) {
    const el = $('k' + i);
    el._cap.style.setProperty('--rot', (-135 + 270 * vals[i]) + 'deg');
    el.setAttribute('aria-valuenow', String(Math.round(vals[i] * 100)));
  }
  function setVal(i, v) { const o = vals[i]; vals[i] = clamp(v, 0, 1); paint(i); if (Math.floor(o * 60) !== Math.floor(vals[i] * 60)) S.tick(); }
  [0, 1, 2].forEach((i) => buildKnob($('k' + i), i));

  const amp = (i) => clamp((Math.abs(vals[i] - 0.5) - TOL) / SPAN[i], 0, 1);
  function setStatus(s) { if (s !== lastStatus) { lastStatus = s; $('osd').textContent = s; } }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = now - last; if (dt < 33) return; last = now;
    if (!on) return;

    const a1 = amp(0), a2 = amp(1), a3 = amp(2);
    let noise = locked ? 0 : Math.max(0.02, 1 - serverQuality);
    phase += dt * 0.001 * (0.35 + a1 * 1.2);
    const roll = locked ? 0 : Math.floor(a1 * H * (phase % 1));
    const wob = a2 * 22;

    for (let y = 0; y < H; y++) {
      const sy = (y + roll) % H;
      const blank = roll > 1 && sy < 7;
      let sh = 0;
      if (wob > 0) {
        sh = Math.sin(y * 0.12 + now * 0.008) * wob + Math.sin(y * 0.031 - now * 0.003) * wob * 0.6;
        if (Math.random() < a2 * 0.03) sh += (Math.random() - 0.5) * 50;
        sh = Math.round(sh);
      }
      const rn = clamp(noise * (0.75 + Math.random() * 0.5), 0, 1);
      const rs = sy * W * 4, ro = y * W * 4;
      for (let x = 0; x < W; x++) {
        const si = rs + (((x + sh) % W + W) % W) * 4, oi = ro + x * 4;
        let r = src[si], g = src[si + 1], b = src[si + 2];
        if (blank) { r *= 0.08; g *= 0.08; b *= 0.08; }
        if (rn > 0) { const n = Math.random() * 255; r += (n - r) * rn; g += (n - g) * rn; b += (n - b) * rn; }
        out[oi] = r; out[oi + 1] = g; out[oi + 2] = b; out[oi + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    S.hiss(locked ? 0 : noise);

    if (!locked) {
      setStatus(noise > 0.85 ? 'НЕТ СИГНАЛА' : noise > 0.45 ? 'СИГНАЛ СЛАБЫЙ' : 'СИЛЬНЫЙ СИГНАЛ');

    }
  }

  function showNext(channel) {
    if (channel) { $('hint').textContent = 'СЛЕДУЮЩИЙ КАНАЛ ' + channel; $('hint').classList.add('show'); }
  }
  let checking = false;
  async function checkSignal() {
    if (checking || locked || !on) return;
    checking = true;
    try {
      const response = await fetch('/api/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ values: vals })
      });
      const result = await response.json();
      if (typeof result.quality === "number") serverQuality = result.quality;
      if (result.ok) lock(result.next);
    } catch (e) {}
    checking = false;
  }
  function lock(channel) {
    if (locked) return;
    locked = true;
    $('panel').classList.add('done'); $('led').classList.add('on');
    setStatus('СИГНАЛ ПОЙМАН'); S.hiss(0); S.lock();
    setTimeout(() => showNext(channel), 1400);
  }

  function powerOn(instant) {
    on = true; $('panel').classList.remove('off'); $('led').classList.add('on');
    if (!instant) { cvs.classList.add('crt-on'); S.power(); }
    setStatus('НЕТ СИГНАЛА'); S.init();
    if (TVQ.store.get('tuned')) { locked = true; $('panel').classList.add('done'); setStatus('СИГНАЛ ПОЙМАН'); showNext(); }
  }

  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);      
  requestAnimationFrame(frame);
  TVQ.remote({ file: 'index.html', onChannel() { if (!on) powerOn(false); } });
  setInterval(checkSignal, 2000);
  fetch('/api/state', { credentials: 'same-origin', cache: 'no-store' })
    .then((response) => response.json())
    .then((state) => { if (state.stage >= 1) { powerOn(true); locked = true; $('panel').classList.add('done'); setStatus('СИГНАЛ ПОЙМАН'); } })
    .catch(() => {});
})();