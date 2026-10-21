// Render Apartment's title-screen score as a portable audio file.
// Run: node tools/render-afterhours.cjs
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const game = fs.readFileSync(path.join(root, 'apps/apartment/game.js'), 'utf8');
function readNotes(name) {
  const match = game.match(new RegExp('const ' + name + '=(\\[[^;]+\\]);'));
  if (!match) throw new Error('Cannot find Apartment score: ' + name);
  return JSON.parse(match[1]);
}
const chords = readNotes('nightChords'), melody = readNotes('nightMelody');
const rate = 22050, steps = 128, interval = .6, duration = steps * interval + 4;
const samples = new Float64Array(Math.ceil(rate * duration));
function tone(note, start, length, volume, triangle = false) {
  const frequency = 440 * 2 ** ((note - 69) / 12);
  const count = Math.ceil(length * rate), offset = Math.round(start * rate);
  for (let i = 0; i < count && offset + i < samples.length; i++) {
    const time = i / rate, phase = frequency * time;
    const wave = triangle ? 2 / Math.PI * Math.asin(Math.sin(2 * Math.PI * phase)) : Math.sin(2 * Math.PI * phase);
    // Match Apartment's exponential envelope, with a short de-click attack.
    const envelope = volume * (.0001 / volume) ** (time / length) * Math.min(1, time / .004);
    samples[offset + i] += wave * envelope;
  }
}
for (let step = 0; step < steps; step++) {
  const chord = chords[Math.floor(step / 8) % 4], when = step * interval;
  tone(chord[step % 4], when, 1.8, .045);
  if (step % 2 === 0) tone(melody[Math.floor(step / 2) % 16], when, 2.1, .035);
  if (step % 8 === 0) tone(chord[0] - 12, when, 4, .035, true);
}
const wav = Buffer.alloc(44 + samples.length * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(samples.length * 2, 40);
let peak = 0, energy = 0;
for (let i = 0; i < samples.length; i++) {
  // Lift the standalone recording while keeping the original instrumental balance.
  const sample = samples[i] * 4 * Math.min(1, (duration - i / rate) / 2);
  peak = Math.max(peak, Math.abs(sample)); energy += sample * sample;
  if (Math.abs(sample) > 1) throw new Error('Audio would clip');
  wav.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
}
const destination = path.join(root, 'apps/afterhours/audio/midnight-window.wav');
fs.mkdirSync(path.dirname(destination), {recursive: true});
fs.writeFileSync(destination, wav);
console.log(JSON.stringify({file: destination, duration, bytes: wav.length, peak, rms: Math.sqrt(energy / samples.length)}));
