'use strict';
const $ = id => document.getElementById(id);
const audio = $('audio');
let tracks = [], selected = 0, loading = false, request = 0, scrubbing = false;
const time = seconds => `${Math.floor(Math.max(0, seconds || 0) / 60)}:${String(Math.floor(Math.max(0, seconds || 0) % 60)).padStart(2, '0')}`;
function save(key, value) { try { localStorage.setItem(`afterhours-${key}`, String(value)); } catch {} }
function stored(key) { try { return localStorage.getItem(`afterhours-${key}`); } catch { return null; } }
const savedVolume = Number(stored('volume') ?? .8);
audio.volume = Number.isFinite(savedVolume) ? Math.min(1, Math.max(0, savedVolume)) : .8;
audio.loop = stored('repeat') === 'true';
$('volume').value = audio.volume;
$('repeat').setAttribute('aria-pressed', String(audio.loop));
function sync() {
  const playing = !audio.paused && !audio.ended;
  document.body.classList.toggle('is-playing', playing);
  $('play-icon').textContent = playing ? 'Ⅱ' : '▶';
  $('play-label').textContent = loading ? 'Starting…' : playing ? 'Pause' : 'Play';
  $('play').setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${tracks[selected]?.title || 'song'}`);
  $('mute').setAttribute('aria-pressed', String(audio.muted));
  $('mute').setAttribute('aria-label', audio.muted ? 'Unmute' : 'Mute');
  $('mute').textContent = audio.muted ? '×' : '♪';
  document.querySelectorAll('.track').forEach((button, index) => {
    button.setAttribute('aria-current', String(index === selected));
    button.querySelector('.track-action').textContent = playing && index === selected ? 'Ⅱ' : '▶';
    button.setAttribute('aria-label', `${playing && index === selected ? 'Pause' : 'Play'} ${tracks[index].title}`);
  });
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
}
function progress() {
  const duration = Number.isFinite(audio.duration) ? audio.duration : tracks[selected]?.duration || 0;
  $('seek').max = duration;
  $('seek').disabled = !Number.isFinite(audio.duration);
  if (!scrubbing) $('seek').value = audio.currentTime;
  $('elapsed').textContent = time(scrubbing ? Number($('seek').value) : audio.currentTime);
  $('duration').textContent = time(duration);
  $('seek').setAttribute('aria-valuetext', `${$('elapsed').textContent} of ${time(duration)}`);
}
function selectTrack(index) {
  request++;
  audio.pause(); loading = false; selected = index; scrubbing = false;
  const track = tracks[index];
  audio.src = new URL(track.src, new URL('afterhours/', location.href)).href;
  audio.load();
  for (const key of ['title', 'artist', 'description', 'mood']) $(key).textContent = track[key] || '';
  $('source').textContent = track.collection || 'Original music';
  $('status').textContent = 'Ready when you are.';
  save('selected', track.id);
  if ('mediaSession' in navigator && 'MediaMetadata' in window) {
    navigator.mediaSession.metadata = new MediaMetadata({title: track.title, artist: track.artist, album: 'Afterhours'});
  }
  progress(); sync();
}
async function play() {
  if (!tracks.length || loading) return;
  const attempt = ++request;
  loading = true; $('status').textContent = 'Starting playback…'; sync();
  try {
    // Keep play() in the click gesture for Safari and mobile audio unlocking.
    await audio.play();
    if (attempt !== request) return;
    loading = false; $('status').textContent = 'Now playing. Take your time.'; sync();
  } catch (error) {
    if (attempt !== request) return;
    loading = false;
    $('status').textContent = error.name === 'NotAllowedError' ? 'Tap Play to enable audio.' : 'Couldn’t play this song. Check your connection and tap Play to retry.';
    sync();
  }
}
function pause() { request++; loading = false; audio.pause(); $('status').textContent = 'Paused. Stay a while.'; sync(); }
function toggle() { if (loading || !audio.paused) pause(); else play(); }
$('play').addEventListener('click', toggle);
$('restart').addEventListener('click', () => { audio.currentTime = 0; progress(); $('status').textContent = 'Back to the beginning.'; });
$('repeat').addEventListener('click', () => { audio.loop = !audio.loop; save('repeat', audio.loop); $('repeat').setAttribute('aria-pressed', String(audio.loop)); $('status').textContent = audio.loop ? 'Repeat on.' : 'Repeat off.'; });
$('mute').addEventListener('click', () => { audio.muted = !audio.muted; sync(); });
$('volume').addEventListener('input', event => { audio.volume = Number(event.target.value); audio.muted = false; save('volume', audio.volume); sync(); });
$('seek').addEventListener('input', () => { scrubbing = true; progress(); });
$('seek').addEventListener('change', () => { audio.currentTime = Number($('seek').value); scrubbing = false; progress(); });
for (const event of ['loadedmetadata', 'durationchange', 'timeupdate']) audio.addEventListener(event, progress);
for (const event of ['play', 'pause', 'volumechange']) audio.addEventListener(event, sync);
audio.addEventListener('playing', () => { $('status').textContent = 'Now playing. Take your time.'; });
audio.addEventListener('waiting', () => { if (!audio.paused) $('status').textContent = 'Buffering…'; });
audio.addEventListener('error', () => { request++; loading = false; $('status').textContent = 'This song couldn’t load. Check your connection and tap Play to retry.'; sync(); });
audio.addEventListener('ended', () => {
  if (!audio.loop && selected + 1 < tracks.length) { selectTrack(selected + 1); play(); }
  else { $('status').textContent = 'A moment of quiet. Play it again whenever you like.'; sync(); }
});
document.addEventListener('keydown', event => {
  if (event.code === 'Space' && !event.repeat && !/INPUT|BUTTON|TEXTAREA|SELECT|A/.test(event.target.tagName)) { event.preventDefault(); toggle(); }
});
if ('mediaSession' in navigator) {
  for (const [action, handler] of Object.entries({play, pause, seekbackward: () => { audio.currentTime = Math.max(0, audio.currentTime - 10); }, seekforward: () => { if (Number.isFinite(audio.duration)) audio.currentTime = Math.min(audio.duration, audio.currentTime + 10); }, seekto: detail => { if (Number.isFinite(detail.seekTime)) audio.currentTime = detail.seekTime; }})) {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch {}
  }
}
async function init() {
  try {
    const response = await fetch('afterhours/tracks.json');
    if (!response.ok) throw new Error('Collection unavailable');
    tracks = await response.json();
    if (!Array.isArray(tracks) || !tracks.length || tracks.some(track => !track.id || !track.title || !track.src)) throw new Error('Invalid collection');
    tracks.forEach((track, index) => {
      const button = document.createElement('button'); button.className = 'track';
      for (const [className, content] of [['track-number', String(index + 1).padStart(2, '0')], ['track-info', ''], ['track-length', time(track.duration)], ['track-action', '▶']]) {
        const span = document.createElement('span'); span.className = className; span.textContent = content;
        if (className === 'track-info') {
          for (const [name, value] of [['track-title', track.title], ['track-subtitle', `${track.artist || 'Original music'} · ${track.collection || 'Afterhours'}`]]) {
            const text = document.createElement('span'); text.className = name; text.textContent = value; span.append(text);
          }
        }
        if (className === 'track-action') span.setAttribute('aria-hidden', 'true');
        button.append(span);
      }
      button.addEventListener('click', () => { if (index === selected) toggle(); else { selectTrack(index); play(); } });
      $('tracks').append(button);
    });
    $('song-count').textContent = `${String(tracks.length).padStart(2, '0')} ${tracks.length === 1 ? 'SONG' : 'SONGS'}`;
    const previous = tracks.findIndex(track => track.id === stored('selected'));
    selectTrack(previous >= 0 ? previous : 0);
    $('play').disabled = false; $('restart').disabled = false;
    audio.hidden = true; audio.controls = false;
  } catch {
    $('play-label').textContent = 'Unavailable';
    $('status').textContent = 'The collection couldn’t load. Use the audio controls below, or reload to try again.';
  }
}
init();
