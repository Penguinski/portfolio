# Elastic Webcam

Elastic Webcam is a small browser experiment that makes a live webcam image feel like rubber. Pinch with your thumb and index finger near your mouth or a fingertip, keep the pinch closed, and move your hand to pull that part of the image.

The project is intentionally simple: plain HTML, CSS, and JavaScript with no backend and no build step. MediaPipe Tasks Vision detects hands and a face, while a WebGL shader deforms the video locally in real time.

## Run locally

From inside the `elastic-webcam` folder, run:

```sh
python3 -m http.server 5173
```

Then open [http://localhost:5173](http://localhost:5173) in Chrome.

On Windows, if `python3` is not available, try:

```sh
python -m http.server 5173
```

Click **Start camera**, grant camera access, and wait for the models to load.

## Deploy

Upload the four files in this folder to any static host, such as GitHub Pages, Netlify, Vercel, Cloudflare Pages, or a normal HTTPS web server. No install or build command is needed.

Camera access requires an **HTTPS** page, except when running on `localhost` or `127.0.0.1`.

The MediaPipe JavaScript package, WebAssembly runtime, and model files are loaded from public CDNs, so visitors need an internet connection when opening the experiment.

## Privacy

The webcam stream is processed locally in the visitor's browser. Frames are not uploaded, stored, or sent to a server. There is no backend, analytics integration, or database in this project.

## Recommended browser

Chrome desktop is recommended, especially on macOS. Other recent browsers with WebGL, ES modules, WebAssembly, and `getUserMedia()` support may also work.

## Troubleshooting

- Make sure the deployed page uses HTTPS.
- Allow camera permission in the browser's site settings, then reload the page.
- Try the latest desktop version of Chrome.
- Close Zoom, Teams, Photo Booth, or other applications that may be using the webcam.
- Check that content blockers or a restrictive network are not blocking jsDelivr or Google-hosted MediaPipe model files.
- If performance is slow, lower the Radius or close other graphics-heavy tabs.
