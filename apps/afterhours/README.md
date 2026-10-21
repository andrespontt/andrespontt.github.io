# Afterhours

Open `/apps/afterhours.html` on GitHub Pages, or run
`node tools/serve-afterhours.cjs` and open the printed local URL. This preview
supports byte ranges, which are needed to seek in the long recordings before
they finish downloading.

The first song, **Midnight Window**, is the original soft-bell D-minor theme
from Apartment's title screen (`updateScore` in `../apartment/game.js`). It
contains 63 uninterrupted repetitions of the 19.2-second composition and a
natural tail: **20:13**. Its original pitches and instrumental balance remain.
The intro score, circus waltz, rain, and dialogue are not part of the recording.
The earlier short WAV is retained for existing direct links; the player uses
the full-length MP3.

Four more original instrumentals form a journey from night to morning:

| Song | Length | Visual story |
| --- | --- | --- |
| Last Train Home | 5:10 | Neon city to quiet countryside |
| Paper Satellites | 5:26 | A folded wish finds its constellation |
| The Blue Between | 5:06 | A little boat follows a lighthouse |
| First Light | 5:06 | A rooftop listener watches the city wake |

The new songs use low-register melodies, rounded keys, warm pads and softened
percussion, with instrumental breaks across their longer lo-fi arrangements.
They have no bright octave lifts. Everything is local: no streaming account,
third-party audio requests, or runtime synthesis is required.

Three additional pieces take inspiration from the unobtrusive intent of Satie's
furniture music, with original compositions rather than arrangements of his work:

| Song | Length | Quiet scene |
| --- | --- | --- |
| Room for Thought | 6:08 | A book, a lamp, and afternoon light |
| The Quiet Margin | 6:24 | A patient garden and an empty bench |
| Nothing to Finish | 7:08 | An open window and a moving curtain |

These use slow triple meter (45–50 bpm), a narrow low/middle register, rounded
piano-like tones, gradual fades and restrained dynamics. There are no drums,
lead melodies, octave lifts or crescendos. Their optional visual stories use
slow daylight and slight leaf/curtain movement, without beat pulses.

## Animate

The player opens with still artwork. **Animate** turns the cover into a small
Canvas film with four original story captions (not lyrics or spoken narration).
Scenes, musical pulses and chapters use the audio clock. Pause freezes the film;
seeking, restarting, repeating and advancing to another track update it. Turning
Animate off returns to a still cover without affecting audio.

The renderer caps resolution and frame rate, stops its animation loop in hidden
tabs, and honors reduced motion with chapter stills. Canvas descriptions and
visible captions expose the story without rapid screen-reader announcements.

## Regenerate and verify

From the repository root:

```sh
npm install --no-save --package-lock=false --ignore-scripts lamejs@1.2.1
node tools/render-afterhours.cjs
node --test apps/afterhours/collection.test.mjs
```

Alternatively pass a path to an already installed `lamejs/lame.all.js` to the
renderer. Lamejs is only a development encoder (MIT), never a browser dependency.
Append `--background-only` to regenerate just the three furniture-music pieces.
The renderer checks for clipping and writes 96 kbps mono MP3s. The tests walk
every MP3 frame to verify real recording lengths, and exercise story timing,
seeking, pause, track changes, hidden tabs and reduced motion.

## Add another song

1. Put the audio file in `audio/` (MP3, M4A, OGG, or WAV).
2. Append an entry to `tracks.json`:

```json
{
  "id": "another-song",
  "title": "Another Song",
  "artist": "Andres Pontt",
  "collection": "Original music",
  "description": "A short description of the song.",
  "mood": "Warm / Reflective",
  "duration": 120,
  "src": "audio/another-song.mp3"
}
```

`duration` is in seconds and provides the library label before audio metadata
loads. Playback uses the file's actual duration. Tracks play in catalog order;
repeat loops the current song. For a visual story, add `visual` (`window`,
`train`, `space`, `sea`, `dawn`, `room`, `garden`, or `curtain`), `bpm`, `coverLabel`, `coverNote`, and a `story`
array of `{ "at": 0, "title": "Chapter title", "text": "Story caption" }` entries.
Chapter times are seconds, ascending, starting at zero. Without a story the
Animate button is disabled.
Volume, repeat, and last selected song are saved locally. Playback starts only
when the listener presses Play; Space toggles playback outside form controls.
