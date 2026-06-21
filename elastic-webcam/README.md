# Elastic Type

Elastic Type is a webcam-controlled typography experiment. One or two hands act as moving force fields that pull, compress, stretch, and wobble a large word rendered in WebGL.

The webcam image stays hidden. MediaPipe Hand Landmarker supplies palm position, hand openness, velocity, and handedness; the browser never uploads or stores the camera stream.

The project uses plain HTML, CSS, and JavaScript. It has no backend, framework, package installation, or build step.

## Run locally

From inside the `elastic-webcam` folder, run:

```sh
python3 -m http.server 5173
```

On Windows, this command may be available instead:

```sh
python -m http.server 5173
```

Open [http://localhost:5173](http://localhost:5173) in Chrome and press **Start camera**.

Camera permission is requested only after that action. The introductory panel disappears when the camera starts, while the small status at the top reports tracking progress.

## Interaction

- Move an open hand near the word to pull and swell it locally.
- Close a hand into a fist to compress the nearby typography.
- Move two hands apart to stretch along the axis between them.
- Bring two hands together to compress the word.
- Sweep a hand quickly to create elastic waves and colored echoes.
- Stop moving or leave the frame to let the word return to its original shape.

Use the preset buttons or enter a custom word of up to 12 characters. The controls adjust distortion strength, force radius, elastic return, wobble, and the optional hand guides.

**Snapshot** saves the final WebGL composition as a PNG.

## Deploy

Upload these four files to any static HTTPS host:

- `index.html`
- `style.css`
- `app.js`
- `README.md`

GitHub Pages, Netlify, Vercel, Cloudflare Pages, and ordinary HTTPS web hosting all work. No build command is required.

Camera access requires **HTTPS**, except on `localhost` and `127.0.0.1`.

The MediaPipe JavaScript runtime, WebAssembly files, and hand model are loaded from public CDNs, so visitors need an internet connection when opening the experiment.

## Privacy

Webcam frames and hand landmarks are processed locally in the browser. Nothing is uploaded, recorded, or sent to a project server.

## Performance

- The internal canvas is capped at 960 × 540.
- Hand detection runs once for each new webcam frame.
- Rendering and elastic recovery run on `requestAnimationFrame`.
- Hand coordinates, velocity, openness, two-hand stretch, and wobble energy are smoothed over time.
- The text is drawn once to an offscreen canvas and uploaded as a WebGL texture only when the word or canvas size changes.

Chrome desktop is recommended, especially on macOS.

## Troubleshooting

- Use HTTPS when deployed online.
- Allow camera permission in the browser's site settings, then reload.
- Keep hands visible and reasonably well lit.
- Try the latest desktop Chrome if tracking is unavailable.
- Check that content blockers are not blocking jsDelivr or Google-hosted MediaPipe assets.
- Close other applications that may already be using the webcam.
