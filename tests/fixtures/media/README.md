# Local browser fixture

`blue-vp8.webm` is a two-second blue rectangle, 320×180, 12 fps, VP8 video with no audio. It contains no downloaded content, personal data, or third-party footage. It is a decoding/seek fixture, not a result from MEL's video-generation provider.

Generated locally for the test with the free FFmpeg tool:

```sh
ffmpeg -f lavfi -i color=c=blue:s=320x180:r=12 -t 2 -c:v libvpx -an blue-vp8.webm
```

The browser verification reads this committed fixture and requires no FFmpeg installation or external media service.
