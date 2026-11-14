# Images, Audio, and Video Formats for AI

## Introduction

An image, audio recording, or video file is encoded data—not a model input
format by itself. An application must decode a file, interpret its
dimensions, color or timing, apply any required preprocessing, and send a
representation the selected model accepts.

![Media files move from a container or image encoding through decoding and preprocessing before a model receives tensors, patches, or media tokens.](media-to-model-flow.svg)

![Video understanding combines selected frames, audio segments, timestamps, and a task prompt before model inference.](video-understanding-flow.svg)

## Raster and vector images

**Raster images** store a grid of pixels. Each pixel has color samples,
often represented by red, green, and blue channels (RGB), and may include
an alpha channel for transparency. Resolution is the number of pixels; a
larger image can carry detail but use more memory and model context.

**Vector graphics** describe shapes and paths mathematically, often with
text and style rules. They can scale cleanly for diagrams and icons, but
they must be rendered to pixels for many computer-vision models.

| Format | Kind and typical properties | Useful fit and caveat |
|---|---|---|
| PNG | Raster; lossless compression; transparency supported | Screenshots, diagrams, and sharp edges; can be large for photographs |
| JPEG / JPG | Raster; lossy photographic compression | Photos; repeated re-encoding can add artifacts and it does not support alpha |
| WebP | Raster; lossy and lossless options, transparency and animation supported | Web delivery; confirm target tool and model accept it |
| AVIF | Raster image format based on AV1 image coding | Efficient web images in supported pipelines; decoding support varies |
| GIF | Palette-based raster; animation supported | Simple short animations; limited color compared with modern formats |
| SVG | XML-based vector description | Logos, icons, and diagrams; sanitize untrusted SVG before serving or rendering |

PNG was developed by the PNG Development Group and is now specified by
standards organizations including W3C. JPEG is specified through the
Joint Photographic Experts Group standards process (including ISO/IEC and
ITU-T publications). SVG is maintained by the W3C SVG Working Group.
Google introduced WebP as a web image format. AVIF builds on the AV1 image
coding work from the Alliance for Open Media. These names describe
standards or organizations rather than one individual inventor.

## What an image model receives

A vision pipeline commonly decodes an image into pixel values, applies
orientation and color handling, resizes or crops it, and converts it into
numeric tensors. Some vision transformer systems split an image into
**patches**. Multimodal systems may encode patches or crops into
representations that are combined with text tokens. Exact pipelines vary
by model.

The model may resize a large image, sample several crops, or impose a
resolution limit. A small chart can become unreadable if the application
resizes it too aggressively. Strip unnecessary metadata and enforce upload
limits, but preserve task-relevant resolution.

### A small image-inspection example

Using Pillow in a Python environment, inspect dimensions and color mode
before deciding on preprocessing:

```python
# inspect_image.py: print an image's format, size, and color mode, then convert it to RGB
from PIL import Image

with Image.open("diagram.png") as image:
    print(image.format, image.size, image.mode)
    rgb_image = image.convert("RGB")
```

This reads and converts pixels; it does not call an AI model. The Pillow
decoder must support the input format, and uploaded data should be validated
and size-limited before decoding. Pillow has a built-in guard: as of
Pillow 13, `Image.MAX_IMAGE_PIXELS` defaults to 89,478,485 pixels, above
which opening an image warns, and above twice that it raises
`DecompressionBombError`. Set a lower limit that fits your product.

Provider limits are specific and change, so read them for your provider.
As an example, Anthropic's vision documentation (November 2026) lists
JPEG, PNG, GIF, and WebP as supported, uses only the first frame of an
animation, accepts up to 8000 x 8000 pixels and 10 MB per image
(base64-encoded) on its API, downscales images beyond a per-model long
edge such as 1,568 pixels, and estimates cost as
\(\lceil w/28 \rceil \times \lceil h/28 \rceil\) visual tokens, so a
1000 x 1000 image costs about 1,296 tokens
([Claude vision](https://platform.claude.com/docs/en/build-with-claude/vision)).
Resizing an image to the size the model will use anyway saves upload
time and gives predictable cost. Base64 encoding in a JSON request adds a
third to the file size.

### Checking what an upload really is

A TaskFlow attachment endpoint should decide the type from the file's
first bytes (its signature), not from the filename or the client's
`Content-Type` header:

```ts
// src/uploads/sniff-media.ts: identify an upload by its first bytes, not by its name or MIME header
import { readFileSync } from "node:fs";

type Kind = "png" | "jpeg" | "gif" | "webp" | "wav" | "mp4" | "pdf" | "unknown";

export function sniff(buf: Buffer): Kind {
  const ascii = (start: number, end: number) => buf.subarray(start, end).toString("latin1");
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return "gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "wav";
  if (ascii(4, 8) === "ftyp") return "mp4"; // ISO base media: MP4, MOV, and similar
  if (ascii(0, 5) === "%PDF-") return "pdf";
  return "unknown";
}

// PNG stores width and height in its first chunk, so the size can be checked before decoding
export function pngSize(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const MAX_PIXELS = 25_000_000; // reject before decoding: a small file can expand to gigabytes

for (const name of process.argv.slice(2)) {
  const buf = readFileSync(name);
  const kind = sniff(buf);
  let note = "";
  if (kind === "png") {
    const { width, height } = pngSize(buf);
    note = `${width}x${height}${width * height > MAX_PIXELS ? " too large" : ""}`;
  }
  console.log([name, kind, note].filter(Boolean).join(" "));
}
```

Output from running it with Node.js 24 on four test files, where
`photo.png` is a JPEG file renamed with a `.png` extension:

```text
diagram.png png 640x360
photo.jpg jpeg
icon.webp webp
photo.png jpeg
```

Signature checks catch renamed and mislabeled files cheaply. They do not
prove that the rest of the file is valid, so still decode with limits,
preferably in a background job, and re-encode images you keep.

## Video: container, codec, frames, and timestamps

A **container** such as MP4 or WebM packages streams and metadata. A
**codec** such as H.264, VP9, AV1, or H.265 compresses video frames; audio
may use codecs such as AAC or Opus. A filename extension alone does not
guarantee that the content uses a particular codec.

Video models may consume a video file, sampled frames, audio, or a mixture.
For frame sampling, the application chooses times or a rate; sparse
sampling can miss short events, while dense sampling costs more. Retain
timestamps so an answer can link to the relevant moment. Audio may be
transcribed separately or processed by an audio-capable model.

```bash
# Inspect a local file's streams and codecs when FFmpeg is installed.
ffprobe -hide_banner -show_streams -show_format ./meeting.mp4
```

Review the command output before passing media to an external provider.
FFmpeg tools are optional; model providers may accept different containers,
codecs, durations, and sizes.

## Audio representation

Digital audio is a sequence of samples. **Sample rate** describes samples
per second; **bit depth** describes the precision of each sample;
**channels** describe separate streams such as left and right stereo.
Compression may be lossless (for example FLAC) or lossy (for example MP3,
AAC, or Opus). A container such as WAV can store uncompressed PCM, while
other containers can carry compressed streams.

Speech models may require a particular encoding, sample rate, channel
layout, and duration. Resampling and channel mixing must be deliberate;
they can change speech quality. Uncompressed size is simple arithmetic:
16-bit mono PCM at 16 kHz is 32,000 bytes per second, about 1.9 MB per
minute, which is why recordings are usually sent compressed or streamed.
Realtime speech APIs often expect raw PCM at a fixed rate; see
[speech and multimodal AI](speech-and-multimodal-ai.md). Preserve timestamps and speaker segments
when the application needs a transcript users can verify.

## Web delivery versus model input

The best browser asset is not necessarily the best model input. WebP or
AVIF may reduce download size, while a provider endpoint may accept only a
different set of formats. A browser can display SVG while a vision model
expects raster pixels. Keep the delivery format and inference preprocessing
as separate decisions.

## Security and privacy

Validate actual file content, not only its extension or client-supplied
MIME type. Bound size, pixel dimensions, duration, and decompression work.
Treat metadata, embedded text, subtitles, and OCR output as untrusted.
Images and recordings can contain faces, locations, voices, or other
sensitive data; minimize processing and apply the product's consent,
retention, and access policies.

## Further learning

- [W3C PNG specification](https://www.w3.org/TR/png/)
- [W3C SVG Working Group](https://www.w3.org/groups/wg/svg/)
- [Google WebP documentation](https://developers.google.com/speed/webp)
- [Alliance for Open Media AV1](https://aomedia.org/av1-features/)
- [MDN: Image file type and format guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Image_types)
- [MDN: Web video codec guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Video_codecs)
