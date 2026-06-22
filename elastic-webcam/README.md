# Body Type Playground

Body Type Playground is a webcam-based physical typography experiment. The live mirrored camera fills the stage while individual letters fall, bounce, collide, and react to the user's head, hands, and arms.

MediaPipe Pose Landmarker tracks the body. Matter.js runs the 2D letter physics. The visible canvas is rendered manually so letters remain typographic rather than looking like debug rectangles.

When a body collider reaches a letter, the letter receives an extra movement force, pulses toward white, grows slightly, glows, and then fades back to black.

The project uses plain HTML, CSS, and JavaScript. It has no framework, backend, package installation, or build step.

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

The live camera appears as soon as permission is granted. Pose tracking loads separately; if tracking is unavailable, the camera and letter physics continue running.

## Use

1. Start the camera and stand where your upper body is visible.
2. Enter up to 24 characters or choose a preset.
3. Press **Spawn letters**.
4. Move your head, hands, and arms through the letters.
5. Use **Clear** to remove the current letters or **Snapshot** to save the visible canvas as a PNG.

The controls change letter size, gravity, bounce, and the extra force applied by moving body colliders. **Show body guides** reveals the normally invisible collider circles. **Freeze video background** holds the current camera frame while tracking and physics continue.

## Tracking and physics

- The head collider is estimated from the nose, eyes, and ears.
- Hand colliders use the left and right wrist landmarks.
- Forearms and upper arms use short chains of circular colliders between joints.
- Body colliders are persistent static Matter.js bodies repositioned from smoothed pose landmarks.
- Moving colliders apply additional velocity-based force to nearby letters for a clear physical response.
- Letter-to-letter and boundary collisions are handled by Matter.js.
- Tracking loss never pauses the physics simulation.

## Deploy

Upload these files to any static HTTPS host:

- `index.html`
- `style.css`
- `app.js`
- `README.md`

GitHub Pages, Netlify, Vercel, Cloudflare Pages, and ordinary HTTPS hosting all work. No build command is required.

Camera access requires **HTTPS**, except on `localhost` and `127.0.0.1`.

Matter.js, the MediaPipe runtime, WebAssembly files, and pose model load from public CDNs. Visitors need an internet connection when opening the experiment.

## Privacy

Webcam frames and pose landmarks are processed locally in the browser. Nothing is uploaded, recorded, or sent to a project server.

## Performance

- The canvas uses a fixed internal resolution of 960 × 540 and scales responsively with CSS.
- Matter.js updates on `requestAnimationFrame` at up to 60 fps.
- Pose detection runs once for every new webcam frame.
- Collider bodies are created once and repositioned; they are not recreated every frame.
- The app tracks one pose with the lightweight MediaPipe pose model.

Chrome desktop is recommended, especially on macOS.

## Troubleshooting

- Use HTTPS when deployed online.
- Allow camera permission in browser site settings, then reload.
- Keep your head, shoulders, elbows, and wrists visible and well lit.
- Try the latest desktop Chrome if body tracking is unavailable.
- Check that content blockers are not blocking jsDelivr or Google-hosted MediaPipe assets.
- Close other applications that may already be using the webcam.
