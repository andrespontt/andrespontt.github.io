// Render the original Afterhours scores. Requires lamejs 1.2.1 (MIT).
// node tools/render-afterhours.cjs [path/to/lamejs/lame.all.js]
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const encoderContext = {};
vm.runInNewContext(fs.readFileSync(process.argv[2] || require.resolve('lamejs/lame.all.js'), 'utf8'), encoderContext);
const rate = 22050;
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'apps/afterhours/tracks.json'), 'utf8'));

function recording(duration) {
  const samples = new Float64Array(Math.ceil(rate * duration));
  let seed = 1317;
  const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
  function tone(note, start, length, volume, voice = 'bell') {
    const frequency = 440 * 2 ** ((note - 69) / 12), offset = Math.round(start * rate);
    for (let i = 0, count = Math.ceil(length * rate); i < count && offset + i < samples.length; i++) {
      const t = i / rate, phase = 2 * Math.PI * frequency * t;
      let wave = Math.sin(phase), envelope;
      if (voice === 'original' || voice === 'triangle') {
        if (voice === 'triangle') wave = 2 / Math.PI * Math.asin(wave);
        envelope = volume * (.0001 / volume) ** (t / length) * Math.min(1, t / .004);
      } else if (voice === 'pad') {
        wave = (wave + .3 * Math.sin(phase * 1.002) + .18 * Math.sin(phase * 2)) / 1.48;
        envelope = volume * Math.sin(Math.PI * t / length) ** 1.5;
      } else {
        // Rounded keys: mostly fundamental, without bright bell overtones.
        wave = (wave + .08 * Math.sin(phase * 2) * Math.exp(-t * 4)) / 1.08;
        envelope = volume * Math.exp(-t * (voice === 'pluck' ? 6 : 3.5) / length) * Math.min(1, t / (voice === 'felt' ? .035 : .008)) * Math.min(1, (length - t) / .08);
      }
      samples[offset + i] += wave * envelope;
    }
  }
  function drum(start, kind, volume) {
    const length = kind === 'kick' ? .32 : kind === 'snare' ? .16 : .055;
    const offset = Math.round(start * rate);
    let low = 0;
    for (let i = 0; i < length * rate && offset + i < samples.length; i++) {
      const t = i / rate, n = noise(); low = .85 * low + .15 * n;
      const wave = kind === 'kick' ? Math.sin(2 * Math.PI * (48 * t + 5 * (1 - Math.exp(-t * 30)))) : kind === 'snare' ? .6 * low + .4 * Math.sin(2 * Math.PI * 140 * t) : low;
      samples[offset + i] += volume * wave * Math.exp(-t / (length / 6)) * Math.min(1, t / .003);
    }
  }
  function finish(track, gain = 1, echo = 0, {fadeIn = .04, fadeOut = 2} = {}) {
    if (echo) {
      const delay = Math.round(rate * 60 / track.bpm * .75);
      for (let i = delay; i < samples.length; i++) samples[i] += samples[i - delay] * echo;
    }
    let peak = 0, energy = 0;
    const encoder = new encoderContext.lamejs.Mp3Encoder(1, rate, 96), chunks = [];
    for (let offset = 0; offset < samples.length; offset += 1152) {
      const pcm = new Int16Array(Math.min(1152, samples.length - offset));
      for (let i = 0; i < pcm.length; i++) {
        const t = (offset + i) / rate;
        const sample = samples[offset + i] * gain * Math.min(1, t / fadeIn, (duration - t) / fadeOut);
        if (Math.abs(sample) > .98) throw new Error(`${track.id} clips at ${t}s`);
        peak = Math.max(peak, Math.abs(sample)); energy += sample * sample;
        pcm[i] = Math.round(sample * 32767);
      }
      const data = encoder.encodeBuffer(pcm);
      if (data.length) chunks.push(Buffer.from(data));
    }
    chunks.push(Buffer.from(encoder.flush()));
    const destination = path.join(root, 'apps/afterhours', track.src);
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    const file = Buffer.concat(chunks); fs.writeFileSync(destination, file);
    console.log(JSON.stringify({track: track.id, duration, bytes: file.length, peak, rms: Math.sqrt(energy / samples.length)}));
  }
  return {tone, drum, finish};
}

if (!process.argv.includes('--background-only')) {
// Preserve Apartment's original melody and balance for 63 full 19.2-second cycles.
const game = fs.readFileSync(path.join(root, 'apps/apartment/game.js'), 'utf8');
function readNotes(name) {
  const match = game.match(new RegExp('const ' + name + '=(\\[[^;]+\\]);'));
  if (!match) throw new Error('Cannot find Apartment score: ' + name);
  return JSON.parse(match[1]);
}
const original = catalog[0], chords = readNotes('nightChords'), melody = readNotes('nightMelody');
const midnight = recording(original.duration);
for (let step = 0; step < 2016; step++) {
  const chord = chords[Math.floor(step / 8) % 4], when = step * .6;
  midnight.tone(chord[step % 4], when, 1.8, .045, 'original');
  if (step % 2 === 0) midnight.tone(melody[Math.floor(step / 2) % 16], when, 2.1, .035, 'original');
  if (step % 8 === 0) midnight.tone(chord[0] - 12, when, 4, .035, 'triangle');
}
midnight.finish(original, 4);

const scores = [
  {id: 'last-train-home', steps: 896, chords: [[45,52,55,59],[41,48,52,57],[48,55,59,62],[43,50,55,59]], melody: [76,72,71,67,69,72,76,79,76,74,71,67,69,71,72,0], drums: true, voice: 'pluck'},
  {id: 'paper-satellites', steps: 768, chords: [[50,57,61,66],[47,54,57,62],[43,50,54,59],[45,52,57,61]], melody: [78,81,85,81,78,76,74,0,73,76,81,78,76,73,74,0], drums: false, voice: 'bell'},
  {id: 'the-blue-between', steps: 640, chords: [[48,55,58,62],[44,51,55,60],[51,58,62,65],[46,53,58,62]], melody: [75,74,70,67,0,70,72,74,75,79,77,74,72,70,67,0], drums: false, voice: 'bell'},
  {id: 'first-light', steps: 960, chords: [[53,60,64,67],[50,57,60,65],[46,53,57,62],[48,55,60,64]], melody: [77,76,72,69,72,76,79,81,79,77,76,72,74,76,77,0], drums: true, voice: 'pluck'}
];
for (const score of scores) {
  const track = catalog.find(item => item.id === score.id), session = recording(track.duration);
  const interval = 60 / track.bpm / 2;
  for (let step = 0; step < score.steps; step++) {
    const chord = score.chords[Math.floor(step / 16) % 4], when = step * interval;
    const section = Math.floor(step / 32) % 8, intensity = section === 0 ? .7 : section >= 4 ? .85 : 1;
    if (step % 16 === 0) {
      chord.forEach(note => session.tone(note, when, interval * 18, .042 * intensity, 'pad'));
      session.tone(chord[0] - 12, when, interval * 7, .12, 'original');
    }
    if (step % 2 === 0) session.tone(chord[(step / 2) % 4], when, interval * 3.8, .065 * intensity, score.voice);
    if (step % 4 === 0 && section !== 6) {
      const note = score.melody[Math.floor(step / 4) % score.melody.length];
      if (note) session.tone(note - 12, when + .015, interval * 5.2, .105 * intensity, 'bell');
    }
    if (score.drums && section !== 6 && step >= 16 && step < score.steps - 8) {
      if (step % 8 === 0 || step % 8 === 5) session.drum(when, 'kick', .16);
      if (step % 8 === 4) session.drum(when + .012, 'snare', .035);
      session.drum(when + (step % 2 ? .025 : 0), 'hat', step % 2 ? .012 : .018);
    }
  }
  session.finish(track, 1.5, .22);
}
}

// Original furniture music: unhurried triple meter, a narrow middle/low
// register, soft attacks and no percussion, solos, dramatic builds or lifts.
const backgroundScores = [
  {id:'room-for-thought', bars:100, chords:[[38,50,57,61],[42,49,56,61],[40,50,55,59],[45,52,57,59]], order:[0,0,1,1,2,2,3,0]},
  {id:'the-quiet-margin', bars:100, chords:[[41,53,57,60],[41,50,57,60],[46,53,57,62],[38,50,57,60]], order:[0,1,0,1,2,2,3,1]},
  {id:'nothing-to-finish', bars:105, chords:[[43,50,57,59],[47,54,57,62],[45,52,55,59],[38,50,57,64]], order:[0,0,1,0,2,2,3,0]}
];
for (const score of backgroundScores) {
  const track = catalog.find(item => item.id === score.id);
  if (!track) continue;
  const session = recording(track.duration), beat = 60 / track.bpm;
  for (let bar = 0; bar < score.bars; bar++) {
    const chord = score.chords[score.order[Math.floor(bar / 4) % score.order.length]];
    const when = bar * beat * 3;
    // A low note, then a gently spread chord. Identical dynamics leave attention
    // free for something else; occasional rests give the room its own voice.
    session.tone(chord[0], when, beat * 4.8, .11, 'felt');
    if (bar % 12 !== 11) {
      chord.slice(1).forEach((note,i) => session.tone(note, when + beat * 1.1 + i * .022, beat * 3.5, .07, 'felt'));
    }
    if (bar % 8 === 4) session.tone(chord[1], when + beat * 2.3, beat * 2.8, .035, 'felt');
  }
  session.finish(track, 1.35, .12, {fadeIn:8, fadeOut:12});
}
