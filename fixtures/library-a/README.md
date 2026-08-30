# Basis generated library fixture

All audio files are one-second sine tones generated locally with FFmpeg. They
contain no copyrighted musical recording and are safe to redistribute with the
test suite.

- `Loose/one.mp3`: complete album, artist, genre, and track tags plus an LRC sidecar.
- `Odd Structure/two.flac`: tagged FLAC without an album artist.
- `Compilation/three.m4a`: AAC/M4A with a compilation album artist and disc two.
- `Café/four.wav`: a Unicode path with missing tags.
- `Corrupt/broken.mp3`: invalid audio used to prove per-file failure isolation.
