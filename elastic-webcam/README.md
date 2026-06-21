# Stretch Anything

Stretch Anything is a browser-based elastic body experiment. Start the webcam, click or pinch any visible point on your body, and drag it like rubber or taffy.

MediaPipe Pose Landmarker creates a soft person segmentation mask, MediaPipe Hand Landmarker recognizes the optional pinch gesture, and a WebGL shader draws a stretched patch from the grabbed body point toward the input position. Pixels outside the person mask are not included in the patch.

The project uses plain HTML, CSS, and JavaScript. It has no backend, database, package install, or build step.

## Run locally

From inside the `elastic-webcam` folder, run:

```sh
python3 -m http.server 5173
```

On Windows, this command may be available instead:

```sh
python -m http.server 5173
```

Open [http://localhost:5173](http://localhost:5173) in Chrome, click **Start camera**, and grant camera access.

Wait for the status to say **mask ready**. Mouse/touch is the default and most stable input mode. Hand pinch can be enabled from the controls.

## Interaction

- **Mouse / touch:** press a visible body area, drag, then release.
- **Hand pinch:** bring thumb and index finger together over a visible body area, move while keeping the pinch closed, then open the pinch.
- Use the presets or sliders to change the width, pull strength, return speed, feather, and maximum stretch.
- Enable **Debug Mask** to inspect the detected silhouette and stretch capsule.
- Click **Take snapshot** to save the current result as a PNG.

## Deploy

Upload the four files in this folder to any static HTTPS host, including GitHub Pages, Netlify, Vercel, Cloudflare Pages, or a normal web server. No install or build command is required.

Camera access requires **HTTPS**, except on `localhost` and `127.0.0.1`.

The MediaPipe JavaScript runtime, WebAssembly files, and model assets are loaded from public CDNs. Visitors therefore need an internet connection when loading the experiment.

## Privacy

Webcam frames, hand landmarks, and the body mask are processed locally in the browser. Nothing is uploaded, stored, or sent to a project server. The app has no backend or analytics integration.

## Performance

- The render canvas is capped at 960 × 540.
- Body segmentation is updated at approximately 15 fps.
- WebGL rendering continues on `requestAnimationFrame`.
- The video frame and person mask used by a stretch are frozen when the grab begins.

Chrome desktop is recommended, especially on macOS.

## Troubleshooting

- Use HTTPS when the app is deployed online.
- Allow camera permission in the browser's site settings, then reload.
- If you see **Body mask unavailable. Try Chrome or reload.**, try the latest desktop Chrome and check that content blockers are not blocking jsDelivr or Google-hosted MediaPipe model files.
- If pinch input is unstable, switch to **Mouse / touch**.
- Close Zoom, Teams, Photo Booth, or other applications that may already be using the webcam.
- Reduce the canvas window size or close graphics-heavy tabs if performance is slow.
