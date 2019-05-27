# Wave Samples SVG library

That's just a proof of concept that it is possible to generate a super lightweight SVG-based previews for WAV-files basically for a Web needs.

Currently it's a tiny Node.js tool which generates SVG previews. For example, running this

```bash
ffmpeg -i "example.wav" -f wav pipe: | node lib/index.js
```

will generate an `output.svg` file in a project root directory with a pretty precise shape of WAV file samples, and it's only **3.1 KB**. This tool uses a popular [SVGO project](https://github.com/svg/svgo) with default settings to optimize generated results, so there is no need to do it manually.

![Preview](https://raw.githubusercontent.com/alexey-detr/wave-samples-svg/master/output.svg?sanitize=true)

It isn't honest to compare this with raster formats, but roughly the same image in PNG takes about 10 KB and 30 KB in JPEG q90 (which also has a lack of an alpha channel).

So, having a smaller size we also can get advantages of a gzip-compression since SVG is a text format and have a freedom for resizing since it's a vector image.

It is also possible to generate a less precise previews and the size can be reduced to **1 KB** or even less until it's still meaningful for your needs.
