# Basis generated library fixture

All audio files are one-second sine tones generated locally with FFmpeg. They
contain no copyrighted musical recording and are safe to redistribute with the
test suite.

- `Loose/one.mp3`: complete album, artist, genre, and track tags plus an LRC sidecar.
- `Odd Structure/two.flac`: tagged FLAC without an album artist.
- `Compilation/three.m4a`: AAC/M4A with a compilation album artist and disc two.
- `Codecs/five-alac.m4a`: ALAC/M4A codec-coverage sample.
- `Codecs/six-vorbis.ogg`: Ogg Vorbis codec-coverage sample.
- `Codecs/seven-opus.opus`: Ogg Opus codec-coverage sample.
- `Café/four.wav`: a Unicode path with missing tags.
- `Corrupt/broken.mp3`: invalid audio used to prove per-file failure isolation.
