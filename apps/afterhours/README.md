# Afterhours

Open `/apps/afterhours.html` through a local server or GitHub Pages.

The first song, **Midnight Window**, is the original soft-bell D-minor theme
from Apartment's title screen (`updateScore` in `../apartment/game.js`). It
contains four repetitions of the 19.2-second composition and a natural tail.
The intro score, circus waltz, rain, and dialogue are not part of the recording.
Regenerate the WAV with `node tools/render-afterhours.cjs` from the repo root.

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
repeat loops the current song. The artwork is the Apartment collection cover.
Volume, repeat, and last selected song are saved locally. Playback starts only
when the listener presses Play; Space toggles playback outside form controls.
