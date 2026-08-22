function tone(freq: number, ms: number, type: OscillatorType = "square") {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = 0.05;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + ms / 1000);
  window.setTimeout(() => void ctx.close(), ms + 120);
}

export function scanBeep() {
  tone(1400, 80);
}

export function missBeep() {
  tone(420, 90);
  window.setTimeout(() => tone(320, 120), 100);
}
