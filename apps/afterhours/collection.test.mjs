import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const tracks = JSON.parse(await readFile(new URL('./tracks.json', import.meta.url), 'utf8'));
test('Every recording contains its full advertised duration, including 20+ and 5+ minute minimums', async () => {
  assert.equal(tracks.length, 8);
  assert.equal(new Set(tracks.map(track => track.id)).size, tracks.length);
  const bitrates = [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160];
  for (const [index, track] of tracks.entries()) {
    const data = await readFile(new URL(track.src, import.meta.url));
    let offset = 0, duration = 0;
    // Walk every MPEG-2 Layer III frame, not just the catalog's duration label.
    while (offset < data.length) {
      assert.equal(data[offset], 255, `${track.id}: truncated frame at ${offset}`);
      assert.equal(data[offset + 1] & 254, 242, `${track.id}: expected MPEG-2 Layer III`);
      const bitrate = bitrates[data[offset + 2] >> 4];
      const sampleRate = [22050,24000,16000][(data[offset + 2] >> 2) & 3];
      assert(bitrate && sampleRate);
      const size = Math.floor(72000 * bitrate / sampleRate) + ((data[offset + 2] >> 1) & 1);
      offset += size; duration += 576 / sampleRate;
    }
    assert.equal(offset, data.length, `${track.id}: complete final frame`);
    assert(duration >= (index === 0 ? 1200 : 300), `${track.id}: duration ${duration}`);
    assert(Math.abs(duration - track.duration) < .15, `${track.id}: metadata agrees with recording`);
    assert.equal(track.story[0].at, 0);
    track.story.forEach((part, i) => {
      assert(part.title && part.text);
      assert(part.at < track.duration);
      if (i) assert(part.at > track.story[i - 1].at);
    });
  }
});

function harness() {
  const elements = new Map(), frames = new Map();
  let nextFrame = 0;
  const canvas = new Proxy({}, {get(object, property) {
    if (property.startsWith('create')) return () => ({addColorStop() {}});
    if (property in object) return object[property];
    return (...args) => args.forEach(arg => { if (typeof arg === 'number') assert(Number.isFinite(arg), `Finite canvas ${property} argument`); });
  }});
  function element() {
    const classes = new Set();
    return {textContent:'', hidden:false, children:[], dataset:{}, attributes:{}, clientWidth:480,
      width:480, height:480, getContext:() => canvas,
      setAttribute(key,value) { this.attributes[key] = value; },
      replaceChildren() { this.children = []; }, append(child) { this.children.push(child); },
      classList:{toggle(name, value) { if(value) classes.add(name); else classes.delete(name); }, contains:name => classes.has(name)}
    };
  }
  const document = {hidden:false, addEventListener() {},
    getElementById(id) { if(!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    createElement:element, querySelectorAll:() => document.getElementById('story-chapters').children};
  const motion = {matches:false, addEventListener() {}};
  const audio = {currentTime:0, paused:true, ended:false};
  const sandbox = {window:{}, document, devicePixelRatio:1, matchMedia:() => motion,
    ResizeObserver:class {observe() {}},
    requestAnimationFrame(callback) { frames.set(++nextFrame,callback); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); }};
  return {sandbox, elements, frames, audio, document, motion};
}

test('Visual stories follow seeks, pauses, track changes, reduced motion and hidden tabs', async () => {
  const h = harness();
  vm.runInNewContext(await readFile(new URL('./story.js', import.meta.url), 'utf8'), h.sandbox);
  const story = new h.sandbox.window.AfterhoursStory(h.audio);
  story.select(tracks[0], 0);
  assert.equal(story.active, false, 'Start with the existing still cover');
  story.toggle();
  assert.equal(h.frames.size, 0, 'Animate does not start audio or motion while paused');
  for (const [index, track] of tracks.entries()) {
    h.audio.currentTime = 0; story.select(track,index);
    assert(story.active, 'Keep Animate enabled when changing songs');
    assert.equal(h.elements.get('cover').dataset.scene, track.visual);
    // Seek forward through every chapter, then backward, while paused.
    for (const part of [...track.story, track.story[0]]) {
      h.audio.currentTime = part.at + 1; story.update();
      assert.equal(h.elements.get('story-line').textContent, part.text);
      assert.equal(h.frames.size, 0);
    }
    h.audio.paused = false; story.update(); assert.equal(h.frames.size, 1);
    story.update(); assert.equal(h.frames.size, 1, 'Only one animation loop survives updates');
    h.document.hidden = true; story.update(); assert.equal(h.frames.size, 0);
    h.document.hidden = false; h.motion.matches = true; story.update();
    assert.equal(h.frames.size, 0, 'Reduced motion uses chapter stills');
    assert.equal(h.elements.get('film-state').textContent, 'STORY STILLS');
    h.motion.matches = false; h.audio.paused = true; story.update();
  }
  story.toggle();
  assert.equal(h.elements.get('story-caption').hidden, true);
  assert.equal(h.elements.get('animate').attributes['aria-pressed'], 'false');
});
