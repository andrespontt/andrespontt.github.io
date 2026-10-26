// Procedural combat sounds. The shell owns the AudioContext and passes
// `env.audio = { context, output }` to areas while sound is on (null otherwise).
const noiseCache = new WeakMap();
const SPEED_OF_SOUND = 343;

function noise(context) {
  let buffer = noiseCache.get(context);
  if (!buffer) {
    buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseCache.set(context, buffer);
  }
  return buffer;
}

// Distance attenuation, stereo pan and arrival delay for a world point.
// listener = { x, z, yaw } where yaw 0 looks along +Z (the shell's convention).
function place(audio, listener, x, z) {
  const dx = x - listener.x, dz = z - listener.z, distance = Math.hypot(dx, dz) || .001;
  // Camera right for yaw 0 is -X.
  const pan = Math.max(-1, Math.min(1, (dx * -Math.cos(listener.yaw) + dz * Math.sin(listener.yaw)) / distance));
  const panner = audio.context.createStereoPanner();
  panner.pan.value = pan * .85;
  panner.connect(audio.output);
  return { panner, distance, delay: distance / SPEED_OF_SOUND, loudness: Math.min(1, 8 / (distance + 4)) };
}

function burst(audio, destination, start, { filter = 'bandpass', frequency = 1500, q = .8, gain = 1, attack = .002, decay = .12 }) {
  const ctx = audio.context, source = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  source.buffer = noise(ctx);
  f.type = filter; f.frequency.value = frequency; f.Q.value = q;
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + attack);
  g.gain.exponentialRampToValueAtTime(.0005, start + attack + decay);
  source.connect(f).connect(g).connect(destination);
  source.start(start, Math.random() * .5, attack + decay + .05);
}

function thump(audio, destination, start, gain, from = 140, to = 45) {
  const ctx = audio.context, osc = ctx.createOscillator(), g = ctx.createGain();
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + .12);
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(.0005, start + .16);
  osc.connect(g).connect(destination);
  osc.start(start); osc.stop(start + .2);
}

// A rifle shot at a world position. Far shots lose their highs and arrive later.
export function gunshot(audio, listener, x, z, { hostile = false, pistol = false } = {}) {
  if (!audio) return;
  const { panner, distance, delay, loudness } = place(audio, listener, x, z);
  const t = audio.context.currentTime + delay + Math.random() * .01;
  const bright = Math.max(500, (pistol ? 4200 : 3200) - distance * 45);
  // Pistols: a sharper, lighter crack with less low end than a rifle.
  const body = pistol ? .45 : 1;
  burst(audio, panner, t, { frequency: bright, q: .6, gain: 1.1 * loudness, decay: .09 });
  burst(audio, panner, t, { filter: 'lowpass', frequency: 900, gain: .7 * body * loudness, attack: .004, decay: pistol ? .14 : .25 });
  thump(audio, panner, t, .8 * body * loudness, pistol ? 240 : hostile ? 110 : 150);
  // Echo off the ridges: a soft, dark tail.
  burst(audio, panner, t + .18 + distance * .002, { filter: 'lowpass', frequency: 600, gain: .18 * loudness, attack: .02, decay: .5 });
}

// Bullet hitting concrete or sandbags near a position.
export function impact(audio, listener, x, z) {
  if (!audio) return;
  const { panner, delay, loudness } = place(audio, listener, x, z);
  const t = audio.context.currentTime + delay;
  burst(audio, panner, t, { frequency: 2400, q: 2, gain: .5 * loudness, decay: .05 });
  burst(audio, panner, t, { filter: 'lowpass', frequency: 500, gain: .35 * loudness, decay: .12 });
}

// A pane shattering: a bright crack, then scattered tinkles as shards land.
export function glass(audio, listener, x, z) {
  if (!audio) return;
  const { panner, delay, loudness } = place(audio, listener, x, z);
  const t = audio.context.currentTime + delay;
  burst(audio, panner, t, { filter: 'highpass', frequency: 3000, gain: .9 * loudness, decay: .08 });
  for (let i = 0; i < 9; i++) {
    burst(audio, panner, t + .05 + Math.random() * .5, { frequency: 4500 + Math.random() * 3500, q: 6, gain: (.15 + Math.random() * .2) * loudness, attack: .001, decay: .03 + Math.random() * .05 });
  }
}
