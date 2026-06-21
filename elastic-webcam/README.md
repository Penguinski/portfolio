# Stretch Cam

Stretch Cam is a webcam-only browser experiment. Show an open hand, close it into a fist to grab the image beneath your palm, move the closed fist to pull the image like rubber, and open your hand to release it.

The app uses MediaPipe Hand Landmarker for fist tracking and WebGL for the elastic strip effect. It has no backend, database, package install, or build step.

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

The camera appears before hand tracking finishes loading. Tracking has an eight-second safety timeout; if it cannot initialize, the live video remains visible and a small error message appears below the stage.

## Gesture

1. Hold one open hand clearly in front of the camera.
2. Position the center of the palm over the image area to grab.
3. Close the hand into a fist and keep it closed.
4. Move the fist to stretch the captured image patch.
5. Open the hand to release it and trigger the elastic return.

Fist recognition uses the average distance between the palm center and the index, middle, ring, and pinky fingertips, normalized by palm width. Four consecutive closed frames activate a grab; four consecutive open frames release it. A tracked hand may disappear for up to eight frames without immediately releasing.

## Controls

- **Stretch** changes pull strength.
- **Width** changes the elastic strip size.
- **Snap Back** changes return speed.
- **Show Guide** displays a small palm indicator and the active grab line.
- **Take snapshot** saves the rendered frame as a PNG.

## Deploy

Upload the four files in this folder to any static HTTPS host, including GitHub Pages, Netlify, Vercel, Cloudflare Pages, or a normal web server. No install or build command is required.

Camera access requires **HTTPS**, except on `localhost` and `127.0.0.1`.

The MediaPipe JavaScript runtime, WebAssembly files, and hand model are loaded from public CDNs. Visitors need an internet connection when loading the experiment.

## Privacy

Webcam frames and hand landmarks are processed locally in the browser. Nothing is uploaded, stored, or sent to a project server.

## Performance

- Camera capture requests 960 × 540 and can fall back to 640 × 480.
- The internal render canvas is capped at 960 × 540.
- Hand detection runs once for each new webcam frame.
- WebGL rendering runs on `requestAnimationFrame`.
- The source frame is frozen only when a fist grab begins.

Chrome desktop is recommended, especially on macOS.

## Troubleshooting

- Use HTTPS when deployed online.
- Allow camera permission in the browser's site settings, then reload.
- Keep the entire hand visible and well lit.
- Face the palm toward the camera before closing the fist.
- Try the latest desktop Chrome if tracking is unavailable.
- Check that content blockers are not blocking jsDelivr or Google-hosted MediaPipe assets.
- Close other applications that may already be using the webcam.
