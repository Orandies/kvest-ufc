(function (root) {
  'use strict';

  const CONFIG = {
    brand: 'UFC ™',
    contact: '@Orandiess',
    salt: 'tv26:'
  };

  function fnv(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16);
  }

  function norm(s) {
    return String(s).toUpperCase().replace(/Ё/g, 'Е').replace(/[^A-ZА-Я0-9]/g, '');
  }

  function binaryToText(s) {
    const bits = String(s).replace(/\s+/g, '');
    if (!/^[01]+$/.test(bits) || bits.length % 8) return null;
    let out = '';
    for (let i = 0; i < bits.length; i += 8) out += String.fromCharCode(parseInt(bits.slice(i, i + 8), 2));
    return out;
  }

  function hashOf(s) { return fnv(CONFIG.salt + norm(s)); }

  function check(input, hash) {
    if (hashOf(input) === hash) return true;
    const t = binaryToText(input);
    return t !== null && hashOf(t) === hash;
  }

  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const toB64 = (u8) => btoa(String.fromCharCode.apply(null, Array.from(u8)));

  async function deriveKey(phrase, salt, iter) {
    const mat = await root.crypto.subtle.importKey(
      'raw', new TextEncoder().encode(norm(phrase)), 'PBKDF2', false, ['deriveKey']);
    return root.crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' },
      mat, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function seal(plain, phrase, iter) {
    iter = iter || 300000;
    const salt = root.crypto.getRandomValues(new Uint8Array(16));
    const iv = root.crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(phrase, salt, iter);
    const ct = new Uint8Array(await root.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(plain)));
    return { s: toB64(salt), v: toB64(iv), c: toB64(ct), i: iter };
  }

  async function rid(n) {
    try {
      const enc = new TextEncoder();
      const mat = await root.crypto.subtle.importKey('raw', enc.encode('id:' + n), 'PBKDF2', false, ['deriveBits']);
      const bits = await root.crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: enc.encode(CONFIG.salt + 'route'), iterations: 300000, hash: 'SHA-256' }, mat, 64);
      return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
    } catch (e) { return null; }
  }

  async function open(pack, phrase) {
    try {
      const key = await deriveKey(phrase, fromB64(pack.s), pack.i);
      const buf = await root.crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(pack.v) }, key, fromB64(pack.c));
      return new TextDecoder().decode(buf);
    } catch (e) { return null; }
  }

  const store = {
    get(k) { try { return sessionStorage.getItem('tvq_' + k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem('tvq_' + k, v); } catch (e) { /* ок */ } }
  };


  const sfx = (function () {
    let ac = null, master = null, nz = null, hissG = null, loops = [], muted = false;
    function init() {
      if (ac) { if (ac.state === 'suspended') ac.resume(); return true; }
      try {
        ac = new (root.AudioContext || root.webkitAudioContext)();
        master = ac.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ac.destination);
        const len = ac.sampleRate * 2; nz = ac.createBuffer(1, len, ac.sampleRate);
        const d = nz.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const s = ac.createBufferSource(); s.buffer = nz; s.loop = true;
        hissG = ac.createGain(); hissG.gain.value = 0; s.connect(hissG); hissG.connect(master); s.start();
        return true;
      } catch (e) { ac = null; return false; }
    }
    function tone(f, d, type, v, f2, t0) {
      if (!ac) return;
      const t = ac.currentTime + (t0 || 0), o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'square'; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
      g.gain.setValueAtTime(v || 0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.02);
    }
    function burst(d, v, f) {
      if (!ac) return;
      const t = ac.currentTime, s = ac.createBufferSource(), g = ac.createGain(), fl = ac.createBiquadFilter();
      s.buffer = nz; fl.type = 'bandpass'; fl.frequency.value = f || 2000;
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(fl); fl.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + d + 0.02);
    }
    function stop() { loops.forEach(clearInterval); loops = []; if (ac) hissG.gain.setTargetAtTime(0, ac.currentTime, 0.02); }
    return {
      init: init, stop: stop, isMuted() { return muted; },
      setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 1; },
      hiss(l) { if (ac) hissG.gain.setTargetAtTime(l * 0.05, ac.currentTime, 0.05); },
      key(d) { tone(520 + d * 55, 0.07, 'square', 0.05); },
      tick() { tone(1900, 0.012, 'square', 0.025); },
      power() { burst(0.5, 0.3, 900); tone(60, 0.6, 'sine', 0.2, 900); },
      sw() { burst(0.45, 0.28, 1500); tone(320, 0.4, 'sawtooth', 0.04, 70); },
      page() { burst(0.1, 0.12, 3200); tone(880, 0.05, 'square', 0.03); },
      err() { tone(150, 0.35, 'sawtooth', 0.08, 80); },
      ok() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.07, 0, i * 0.09)); },
      lock() { tone(1000, 0.7, 'sine', 0.07); [660, 880, 1320].forEach((f, i) => tone(f, 0.3, 'triangle', 0.05, 0, 0.12 * (i + 1))); },
      win() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'square', 0.05, 0, i * 0.1)); },
      scare() { burst(1.6, 0.9, 700); tone(80, 1.6, 'sawtooth', 0.25, 1800); tone(1900, 1.4, 'square', 0.12, 2400); tone(95, 1.6, 'square', 0.2, 1500); },
      brain() {
        stop(); let i = 0; const n = [392, 392, 466, 392, 0, 349, 0, 311];
        loops.push(setInterval(() => {
          const s = i++ % 16;
          if (s % 4 === 0) tone(130, 0.16, 'sine', 0.3, 40);
          if (s % 2 === 1) burst(0.04, 0.1, 6000);
          if (s % 2 === 0 && n[(s / 2) % 8]) tone(n[(s / 2) % 8], 0.12, 'square', 0.05);
          if (s === 6 || s === 14) tone(200, 0.1, 'sawtooth', 0.12, 90);
        }, 115));
      }
    };
  })();


  const noteStore = {
    active() { return store.get('note_active') === '1'; },
    channels() { try { return JSON.parse(store.get('channels') || '[]'); } catch (e) { return []; } },
    record(n) {
      n = String(n);
      if (!/^\d{4}$/.test(n)) return;
      const list = this.channels();
      if (!list.includes(n)) { list.push(n); store.set('channels', JSON.stringify(list)); renderNote(); }
    }
  };

  function renderNote() {
    if (!noteStore.active()) return;
    let note = document.getElementById('tvq-note');
    if (!note) {
      note = document.createElement('aside');
      note.id = 'tvq-note';
      note.className = 'field-note';
      note.innerHTML = '<button type="button" class="field-note-toggle" aria-expanded="true">ДЛЯ ЗАМЕТОК <span>−</span></button><div class="field-note-body"><div class="field-note-label">НАЙДЕННЫЕ КАНАЛЫ</div><ol class="field-note-list"></ol></div>';
      document.body.appendChild(note);
      note.querySelector('.field-note-toggle').addEventListener('click', function () {
        const collapsed = note.classList.toggle('collapsed');
        this.setAttribute('aria-expanded', String(!collapsed));
        this.querySelector('span').textContent = collapsed ? '+' : '−';
      });
    }
    const list = note.querySelector('.field-note-list');
    list.replaceChildren();
    noteStore.channels().forEach((n) => { const li = document.createElement('li'); li.textContent = n; list.appendChild(li); });
  }

  function activateNote(getChannel) {
    store.set('note_active', '1');
    const paper = document.querySelector('.note');
    const first = typeof getChannel === 'function' ? String(getChannel()).trim() : '';
    store.set('channels', JSON.stringify(first ? [first] : []));
    if (paper) paper.remove();
    renderNote();
    return true;
  }

  function remote(o) {
    const S = sfx, scr = document.querySelector('.screen-wrap'), mk = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };
    let buf = '', seq = 0, layer = null, aud = null, tmr = 0;
    const osd = mk('div', 'chosd'); scr.appendChild(osd);
    const say = (t) => { osd.textContent = t; osd.classList.add('show'); clearTimeout(tmr); tmr = setTimeout(() => osd.classList.remove('show'), 2200); };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    function kill() { if (layer) { clearInterval(layer._t); layer.remove(); layer = null; } if (aud) { aud.pause(); aud = null; } S.stop(); }
    function put(l) { layer = l; scr.appendChild(l); }
    function noise(label) {
      const l = mk('div', 'egg'), c = mk('canvas'); c.width = 160; c.height = 120; l.appendChild(c);
      const g = c.getContext('2d'), im = g.createImageData(160, 120);
      l._t = setInterval(() => { for (let i = 0; i < im.data.length; i += 4) { im.data[i] = im.data[i + 1] = im.data[i + 2] = Math.random() * 255; im.data[i + 3] = 255; } g.putImageData(im, 0, 0); }, 60);
      if (label) { const t = mk('div', 'lbl'); t.textContent = label; l.appendChild(t); }
      return l;
    }
    function ytId(u) { const m = String(u).match(/(?:youtu\.be\/|v=|embed\/|shorts\/|live\/)([\w-]{11})/); return m ? m[1] : (/^[\w-]{11}$/.test(u) ? u : ''); }
    function ytStart(u) { const m = String(u).match(/[?&#](?:t|start)=(\d+)/); return m ? m[1] : '0'; }
    function egg(e) {
      const l = mk('div', 'egg'); put(l);
      if (e.youtube) {
        const id = ytId(e.youtube);
        l.innerHTML = '<iframe allow="autoplay; encrypted-media; fullscreen" allowfullscreen src="https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&controls=0&playsinline=1&rel=0&loop=1&playlist=' + id + '&start=' + ytStart(e.youtube) + '"></iframe>';
        return;
      }
      if (e.scare) { l.classList.add('scare'); l.innerHTML = '<div class="lbl">' + (e.text || '◉ ◉') + '</div>'; S.scare(); return; }
      l.classList.add('tung');
      if (e.image) { const im = mk('img'); im.src = e.image; im.alt = ''; im.onerror = () => im.remove(); l.appendChild(im); }
      if (e.text) { const t = mk('div', 'lbl'); t.textContent = e.text; l.appendChild(t); }
      if (!e.audio) return;
      let fell = false; const fall = () => { if (!fell && layer === l) { fell = true; S.brain(); } };
      if (e.audio === 'synth') return fall();
      aud = new Audio(e.audio); aud.loop = true; aud.muted = S.isMuted(); aud.onerror = fall; aud.play().catch(fall);
    }
    async function enter(n) {
      if (!noteStore.active()) { say('СНАЧАЛА НАЙДИТЕ И ОТКРОЙТЕ ЗАПИСКУ'); S.err(); return; }
      const my = ++seq; kill(); S.sw(); put(noise()); say('CH ' + n);
      const pair = await Promise.all([rid(n), sleep(450)]); if (my !== seq) return; kill();
      const f = ((root.QD || {}).routes || {})[pair[0]];
      if (!f) { put(noise('НЕТ СИГНАЛА')); S.hiss(0.6); return; }
      noteStore.record(n);
      store.set('goto', n);
      if (f !== o.file) { location.href = f; return; }
      o.onChannel(n);
    }
    function erase() { S.init(); S.tick(); buf = buf.slice(0, -1); say('CH ' + buf.padEnd(4, '_')); }
    function clearAll() { S.init(); S.tick(); buf = ''; say('CH ____'); }
    function press(d) {
      S.init(); S.key(+d); buf += d; say('CH ' + buf.padEnd(4, '_'));
      if (buf.length === 4) { const n = buf; buf = ''; enter(n); }
    }
    const keys = document.getElementById('keys');
    if (keys) {
      const add = (label, fn, cls, aria) => { const b = mk('button', 'key' + (cls ? ' ' + cls : '')); b.type = 'button'; b.textContent = label; if (aria) b.setAttribute('aria-label', aria); b.addEventListener('click', fn); keys.appendChild(b); };
      '123456789'.split('').forEach((d) => add(d, () => press(d)));
      add('⌫', erase, 'fn', 'Стереть последнюю цифру'); add('0', () => press('0')); add('C', clearAll, 'fn', 'Сбросить номер');
    }
    document.addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      if (/^[0-9]$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') erase(); else if (e.key === 'Escape') clearAll();
    });
    document.addEventListener('paste', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      const t = ((e.clipboardData || root.clipboardData).getData('text') || '').trim(), n = /^\d{4}$/.test(t) ? t : binaryToText(t);
      if (n && /^\d{4}$/.test(n)) { S.init(); enter(n); }
    });
  }

  function boot(opts) {
    opts = opts || {};
    document.querySelectorAll('[data-brand]').forEach((el) => { el.textContent = CONFIG.brand; });
    document.querySelectorAll('[data-contact]').forEach((el) => { el.textContent = CONFIG.contact; });
    const paper = document.querySelector('.note');
    if (paper) {
      if (noteStore.active()) paper.remove();
      else {
        paper.setAttribute('role', 'button');
        paper.setAttribute('tabindex', '0');
        paper.setAttribute('aria-label', 'Открыть записку и начать вести заметки');
        paper.addEventListener('click', () => activateNote(opts.note));
        paper.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activateNote(opts.note); } });
      }
    }
    if (noteStore.active()) renderNote();
    else if (!paper) {
      const gate = document.createElement('div');
      gate.className = 'note-gate';
      gate.textContent = 'ВЕРНИТЕСЬ НА ПЕРВЫЙ ЭКРАН И НАЙДИТЕ ЗАПИСКУ';
      document.body.appendChild(gate);
    }
  }

  const TVQ = { CONFIG, fnv, norm, hashOf, check, binaryToText, seal, open, rid, store, boot, fromB64, toB64, sfx, remote, noteStore, activateNote };
  if (typeof module !== 'undefined' && module.exports) module.exports = TVQ;
  else root.TVQ = TVQ;
})(typeof window !== 'undefined' ? window : globalThis);
