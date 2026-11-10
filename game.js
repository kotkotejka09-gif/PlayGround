(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const ui = {
    intro: $('introOverlay'), hud: $('hud'), pause: $('pauseOverlay'), end: $('endOverlay'),
    start: $('startButton'), resume: $('resumeButton'), restart: $('restartButton'),
    pauseButton: $('pauseButton'), distance: $('distance'), coins: $('coins'),
    fuelBar: $('fuelBar'), fuelText: $('fuelText'), touch: $('touchControls'),
    toast: $('toast'), sound: $('soundButton')
  };
  let W = 0, H = 0, dpr = 1, last = 0, mode = 'intro', soundOn = true, audio;
  const keys = { pedal: false, brake: false, lean: 0 };
  const bike = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, spin: 0, grounded: true, fuel: 100, coins: 0, distance: 0, wheel: 17, crashed: false };
  let coinList = [], cameraX = 0, particles = [], toastTimer = 0;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function resize() {
    const r = canvas.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  function terrain(x) {
    // Smooth rolling trail with the first stretch kept welcoming.
    const t = Math.max(0, x);
    const fade = smooth(0, 240, t);
    const hills = Math.sin(t * .0031) * 55 + Math.sin(t * .0068 + 1.1) * 24 + Math.sin(t * .00135 + .7) * 74 + Math.sin(t * .012 + 2.4) * 8;
    const rise = 24 * Math.sin(t * .0007) + Math.max(0, t - 1800) * .007;
    return H * .72 - fade * (hills + rise);
  }
  function slope(x) { return (terrain(x + 2) - terrain(x - 2)) / 4; }
  function normalBike() {
    const x = bike.x;
    const backGround = terrain(x - 34) - bike.wheel;
    const frontGround = terrain(x + 34) - bike.wheel;
    if (bike.grounded) bike.y = (backGround + frontGround) * .5;
  }
  function seedCoins() {
    coinList = [];
    for (let x = 340; x < 60000; x += 220 + (Math.sin(x * .044) + 1) * 70) {
      const ground = terrain(x);
      coinList.push({ x, y: ground - 54 - (Math.sin(x * .03) + 1) * 17, got: false, phase: x * .02 });
    }
  }
  function reset() {
    bike.x = 100; bike.y = terrain(bike.x) - bike.wheel; bike.vx = 0; bike.vy = 0;
    bike.angle = Math.atan(slope(bike.x)); bike.spin = 0; bike.grounded = true;
    bike.fuel = 100; bike.coins = 0; bike.distance = 0; bike.crashed = false;
    cameraX = 0; particles = []; seedCoins(); updateHud();
  }
  function start() {
    reset(); mode = 'playing'; ui.intro.hidden = true; ui.end.hidden = true; ui.pause.hidden = true; ui.hud.hidden = false;
    ui.touch.hidden = !('ontouchstart' in window || navigator.maxTouchPoints > 0);
    last = performance.now(); playTone(440, .07); requestAnimationFrame(loop);
  }
  function pause() { if (mode !== 'playing') return; mode = 'paused'; ui.pause.hidden = false; ui.touch.hidden = true; }
  function resume() { if (mode !== 'paused') return; mode = 'playing'; ui.pause.hidden = true; ui.touch.hidden = !('ontouchstart' in window || navigator.maxTouchPoints > 0); last = performance.now(); requestAnimationFrame(loop); }
  function gameOver(crash) {
    if (mode !== 'playing') return;
    mode = 'ended'; ui.touch.hidden = true; ui.hud.hidden = true; ui.end.hidden = false;
    $('endIcon').textContent = crash ? '↗' : '☼';
    $('endEyebrow').textContent = crash ? 'A LITTLE TOO MUCH AIR' : 'OUT OF ENERGY';
    $('endTitle').textContent = crash ? 'That was a ride.' : 'Time for a breather.';
    $('endMessage').textContent = crash ? 'Every great rider takes a tumble.' : 'The best adventures need a snack stop.';
    $('finalDistance').textContent = Math.floor(bike.distance);
    $('finalCoins').textContent = bike.coins;
    playTone(crash ? 160 : 300, .18);
  }
  function updateHud() {
    ui.distance.textContent = Math.floor(bike.distance);
    $('coins').textContent = bike.coins;
    ui.fuelBar.style.width = `${bike.fuel}%`;
    ui.fuelBar.style.background = bike.fuel < 25 ? '#cc785c' : '#427b52';
    ui.fuelText.textContent = `${Math.ceil(bike.fuel)}%`;
  }
  function showToast(text) {
    ui.toast.textContent = text; ui.toast.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => ui.toast.hidden = true, 1450);
  }
  function playTone(freq, duration) {
    if (!soundOn) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      const osc = audio.createOscillator(), gain = audio.createGain();
      osc.type = 'sine'; osc.frequency.value = freq; gain.gain.setValueAtTime(.035, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
      osc.connect(gain); gain.connect(audio.destination); osc.start(); osc.stop(audio.currentTime + duration);
    } catch (_) {}
  }
  function update(dt) {
    dt = Math.min(dt, .034);
    const pedal = keys.pedal, braking = keys.brake;
    const wasGrounded = bike.grounded;
    const groundAngle = Math.atan(slope(bike.x));
    if (pedal && bike.fuel > 0) {
      bike.vx += (wasGrounded ? 210 : 45) * dt;
      bike.fuel -= 2.6 * dt;
    }
    if (braking) bike.vx -= (wasGrounded ? 310 : 75) * dt;
    const grade = slope(bike.x);
    bike.vx += -grade * (wasGrounded ? 105 : 40) * dt;
    bike.vx *= Math.pow(wasGrounded ? .989 : .997, dt * 60);
    bike.vx = clamp(bike.vx, 0, 415);
    bike.x += bike.vx * dt;
    bike.distance = Math.max(0, (bike.x - 100) / 10);

    const rear = terrain(bike.x - 34) - bike.wheel;
    const front = terrain(bike.x + 34) - bike.wheel;
    const groundY = (rear + front) * .5;
    const targetAngle = Math.atan2(front - rear, 68) + keys.lean * (wasGrounded ? .27 : 1.05);
    if (wasGrounded) {
      bike.y = groundY;
      bike.vy = 0;
      bike.grounded = true;
      bike.angle += (targetAngle - bike.angle) * Math.min(1, dt * (pedal ? 5 : 8));
      // Small bumps create little hops, with speed making the trail lively.
      const bump = Math.abs(slope(bike.x + 13) - slope(bike.x - 13));
      if (bike.vx > 145 && bump > .46 && Math.random() < dt * 1.4) {
        bike.grounded = false; bike.vy = -65 - bike.vx * .20;
      }
    }
    if (!bike.grounded) {
      bike.vy += 650 * dt;
      bike.y += bike.vy * dt;
      bike.spin += (keys.lean * 2.8 + (pedal ? -.18 : 0)) * dt;
      bike.angle += bike.spin * dt;
      if (bike.y >= groundY) {
        bike.y = groundY;
        const impact = bike.vy;
        bike.vy = 0;
        const angleDiff = Math.atan2(Math.sin(bike.angle - groundAngle), Math.cos(bike.angle - groundAngle));
        if (Math.abs(angleDiff) > 1.22 || impact > 570) { gameOver(true); return; }
        bike.grounded = true;
        bike.angle = groundAngle + clamp(angleDiff, -.45, .45);
        bike.spin *= -.24;
        if (impact > 170) { particles.push({x: bike.x, y: groundY + 10, life: .45, max: .45}); playTone(230, .045); }
      }
      if (Math.abs(bike.angle) > 2.55) { gameOver(true); return; }
    }
    bike.fuel = Math.max(0, bike.fuel);
    if (bike.fuel <= 0) bike.vx *= Math.pow(.982, dt * 60);
    if (bike.vx < 7 && bike.fuel <= 0) { gameOver(false); return; }
    for (const c of coinList) {
      if (!c.got && Math.abs(c.x - bike.x) < 35 && Math.abs(c.y - (bike.y - 20)) < 45) {
        c.got = true; bike.coins++; bike.fuel = Math.min(100, bike.fuel + 5.5); playTone(740, .1); showToast('+1 TRAIL COIN  ·  +5% ENERGY');
      }
    }
    const desiredCam = bike.x - W * .35;
    cameraX += (desiredCam - cameraX) * Math.min(1, dt * 3.2);
    particles = particles.filter(p => (p.life -= dt) > 0);
    updateHud();
  }
  function loop(now) {
    if (mode !== 'playing') return;
    const dt = (now - last) / 1000; last = now;
    update(dt); draw();
    if (mode === 'playing') requestAnimationFrame(loop);
  }
  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#dcebd8'); sky.addColorStop(.64, '#eff0d9'); sky.addColorStop(1, '#c9dfbd');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f6dfa0'; ctx.globalAlpha = .85; ctx.beginPath(); ctx.arc(W * .79, H * .2, Math.min(W, H) * .075, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    // distant hills
    for (let layer = 0; layer < 2; layer++) {
      ctx.beginPath(); ctx.moveTo(0, H);
      const base = H * (.65 + layer * .07), amp = H * (.11 + layer * .035), parallax = cameraX * (.09 + layer * .08);
      for (let x = -20; x <= W + 30; x += 8) {
        const wx = x + parallax;
        const y = base - Math.sin(wx * (.004 - layer * .001)) * amp - Math.sin(wx * .009 + 2) * amp * .24;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fillStyle = layer ? '#bfd8b7' : '#cee1c5'; ctx.fill();
    }
    // soft little clouds
    ctx.fillStyle = '#fffdf0'; ctx.globalAlpha = .43;
    for (let i = 0; i < 5; i++) {
      const x = ((i * 223 - cameraX * .035) % (W + 170) + W + 170) % (W + 170) - 70;
      const y = H * (.17 + (i % 3) * .09), s = 1 + (i % 2) * .25;
      ctx.beginPath(); ctx.ellipse(x, y, 35 * s, 9 * s, 0, 0, TAU); ctx.ellipse(x - 18 * s, y + 2, 17 * s, 8 * s, 0, 0, TAU); ctx.ellipse(x + 17 * s, y + 2, 18 * s, 7 * s, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function drawTerrain() {
    ctx.beginPath();
    const startX = cameraX - 25, endX = cameraX + W + 25;
    ctx.moveTo(0, H); ctx.lineTo(0, terrain(startX));
    for (let sx = 0; sx <= W + 30; sx += 5) ctx.lineTo(sx, terrain(cameraX + sx));
    ctx.lineTo(W, H); ctx.closePath();
    const grd = ctx.createLinearGradient(0, H * .5, 0, H);
    grd.addColorStop(0, '#789e68'); grd.addColorStop(1, '#527d59'); ctx.fillStyle = grd; ctx.fill();
    ctx.beginPath();
    for (let sx = -3; sx <= W + 5; sx += 4) {
      const y = terrain(cameraX + sx);
      if (sx === -3) ctx.moveTo(sx, y); else ctx.lineTo(sx, y);
    }
    ctx.strokeStyle = '#f3e8bd'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.stroke();
    ctx.strokeStyle = '#98b978'; ctx.lineWidth = 2; ctx.stroke();
    // tiny grass stitches, deterministic by world position
    const first = Math.floor(cameraX / 38);
    for (let i = first; i < first + W / 38 + 2; i++) {
      const x = i * 38 - cameraX, y = terrain(i * 38);
      ctx.strokeStyle = i % 2 ? '#a7c27d' : '#527d59'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.lineTo(x + ((i % 3) - 1) * 3, y - 2 - Math.abs(i % 4)); ctx.stroke();
    }
  }
  function drawCoins(time) {
    for (const c of coinList) {
      if (c.got || c.x < cameraX - 30 || c.x > cameraX + W + 30) continue;
      const x = c.x - cameraX, y = c.y + Math.sin(time * .002 + c.phase) * 3;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(time * .002 + c.phase) * .12);
      ctx.fillStyle = '#dcae3d'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#fff0b6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#fff3c5'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✦', 0, .5); ctx.restore();
    }
  }
  function line(x1, y1, x2, y2, color, width) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  function drawBike() {
    const sx = bike.x - cameraX, sy = bike.y;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(bike.angle);
    const r = bike.wheel, back = -34, front = 34, crankX = -1, crankY = -31;
    // wheels
    for (const wx of [back, front]) {
      ctx.fillStyle = '#294a39'; ctx.beginPath(); ctx.arc(wx, 0, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#e2e8cc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(wx, 0, r - 5, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#d6e0c8'; ctx.beginPath(); ctx.arc(wx, 0, 3, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#b7c8ad'; ctx.lineWidth = 1;
      for (let a = 0; a < TAU; a += Math.PI / 3) { ctx.beginPath(); ctx.moveTo(wx, 0); ctx.lineTo(wx + Math.cos(a) * (r - 5), Math.sin(a) * (r - 5)); ctx.stroke(); }
    }
    // frame, fork and handlebars
    line(back, 0, crankX, crankY, '#edf0d5', 4); line(crankX, crankY, front, 0, '#edf0d5', 4);
    line(back, 0, front, 0, '#edf0d5', 4); line(back, 0, 0, -57, '#edf0d5', 4);
    line(0, -57, 14, -58, '#edf0d5', 3); line(front, 0, 30, -45, '#edf0d5', 4);
    line(9, -61, -4, -66, '#35583f', 5);
    // rider legs/pedaling
    const pedalPhase = performance.now() * .012 * Math.max(.45, bike.vx / 110);
    const kneeX = crankX + Math.cos(pedalPhase) * 13, kneeY = crankY + Math.sin(pedalPhase) * 10;
    line(-5, -63, kneeX, kneeY - 7, '#c87e56', 6); line(kneeX, kneeY - 7, crankX + Math.cos(pedalPhase + 2.8) * 13, crankY + Math.sin(pedalPhase + 2.8) * 10, '#c87e56', 5);
    line(-5, -63, 13, -50, '#275c44', 9); line(13, -50, 9, -61, '#275c44', 7);
    // head and helmet
    ctx.fillStyle = '#d79a70'; ctx.beginPath(); ctx.arc(1, -82, 9, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d5ee70'; ctx.beginPath(); ctx.arc(1, -85, 9, Math.PI, TAU); ctx.lineTo(10, -83); ctx.quadraticCurveTo(1, -91, -8, -83); ctx.fill();
    ctx.restore();
    // airborne dust / landing twinkles
    for (const p of particles) {
      const alpha = p.life / p.max; ctx.globalAlpha = alpha; ctx.fillStyle = '#f5e3a8'; ctx.beginPath(); ctx.arc(p.x - cameraX + (1 - alpha) * 10, p.y, 3 * alpha, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function draw(time = performance.now()) {
    if (!W || !H) return;
    drawBackground(); drawTerrain(); drawCoins(time);
    if (mode === 'intro') {
      const ghost = bike.x; bike.x = 0; bike.y = terrain(0) - bike.wheel; bike.angle = Math.atan(slope(0));
      cameraX = 0; drawBike(); bike.x = ghost;
    } else drawBike();
  }
  function setAction(action, down) {
    if (action === 'pedal') keys.pedal = down;
    if (action === 'brake') keys.brake = down;
    if (action === 'leanBack') keys.lean = down ? -1 : 0;
  }
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (['arrowright', 'd', 'arrowleft', 'a', 'arrowup', 'w', 'arrowdown', 's', ' '].includes(k)) e.preventDefault();
    if (k === 'arrowright' || k === 'd' || k === ' ') keys.pedal = true;
    if (k === 'arrowleft' || k === 'a') keys.brake = true;
    if (k === 'arrowup' || k === 'w') keys.lean = -1;
    if (k === 'arrowdown' || k === 's') keys.lean = 1;
    if (k === 'escape' || k === 'p') mode === 'playing' ? pause() : mode === 'paused' ? resume() : null;
    if (k === 'enter' && (mode === 'intro' || mode === 'ended')) start();
  }, { passive: false });
  window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k === 'arrowright' || k === 'd' || k === ' ') keys.pedal = false;
    if (k === 'arrowleft' || k === 'a') keys.brake = false;
    if (k === 'arrowup' || k === 'w') keys.lean = 0;
    if (k === 'arrowdown' || k === 's') keys.lean = 0;
  });
  window.addEventListener('blur', () => { keys.pedal = keys.brake = false; keys.lean = 0; if (mode === 'playing') pause(); });
  document.querySelectorAll('.touch-btn').forEach(button => {
    const action = button.dataset.action;
    button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); setAction(action, true); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(ev, () => setAction(action, false));
  });
  ui.start.addEventListener('click', start); ui.restart.addEventListener('click', start);
  ui.resume.addEventListener('click', resume); ui.pauseButton.addEventListener('click', pause);
  ui.sound.addEventListener('click', () => { soundOn = !soundOn; ui.sound.innerHTML = `${soundOn ? '♫' : '♪'} <span>SOUND ${soundOn ? 'ON' : 'OFF'}</span>`; if (soundOn) playTone(500, .08); });
  window.addEventListener('resize', resize);
  reset(); resize();
})();
