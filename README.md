# Wave Samples SVG library

That's just a proof of concept that it is possible to create a super lightweight SVG-based previews for WAV-files basically for a Web needs.

Currently it's a tiny Node.js tool which generates SVG previews. For example, running this

```bash
cat 471733__juanfg__fight.wav | node lib/index.js
```


The `output.svg` file will be generated in a project root directory with a pretty precise shape of WAV file samples, and it's only **12 KB**.

![Preview](https://raw.githubusercontent.com/alexey-detr/wave-samples-svg/master/output.svg?sanitize=true)

It isn't honest to compare this with raster formats, but roughly PNG takes nearly the same size and JPEG (which also has a lack of an alpha channel) takes twice more than SVG version.

So, having at least the same size we also can get advantages of a gzip-compression since SVG is a text format and have a freedom for resizing since it's a vector image.

It is also possible to generate a less precise previews and the size can be reduced to **3 KB** or even less until it's still meaningful for your needs.
