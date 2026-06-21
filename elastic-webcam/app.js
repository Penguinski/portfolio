const MEDIAPIPE_VERSION = "0.10.22-rc.20250304";
const MEDIAPIPE_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const DEFAULT_CONFIG = Object.freeze({
  stretch: 1.05,
  width: 0.1,
  snapBack: 0.16,
  showGuide: true,
  smoothing: 0.28,
  maxStretch: 0.68,
  feather: 0.028,
  closedThreshold: 1.25,
  openThreshold: 1.55,
  confirmationFrames: 4,
  lostFrameTolerance: 8,
});

const config = { ...DEFAULT_CONFIG };

const elements = {
  video: document.querySelector("#webcam"),
  glCanvas: document.querySelector("#glCanvas"),
  overlayCanvas: document.querySelector("#overlayCanvas"),
  stage: document.querySelector("#stage"),
  welcomePanel: document.querySelector("#welcomePanel"),
  startButton: document.querySelector("#startButton"),
  snapshotButton: document.querySelector("#snapshotButton"),
  resetButton: document.querySelector("#resetButton"),
  statusText: document.querySelector("#statusText"),
  statusCluster: document.querySelector(".status-cluster"),
  message: document.querySelector("#message"),
  stretch: document.querySelector("#stretch"),
  stretchValue: document.querySelector("#stretchValue"),
  width: document.querySelector("#width"),
  widthValue: document.querySelector("#widthValue"),
  snapBack: document.querySelector("#snapBack"),
  snapBackValue: document.querySelector("#snapBackValue"),
  showGuide: document.querySelector("#showGuide"),
};

const state = {
  started: false,
  running: false,
  stream: null,
  handLandmarker: null,
  trackingReady: false,
  trackingFailed: false,
  lastHandVideoTime: -1,
  renderer: null,
  handTracks: new Map(),
  guideTrack: null,
  grab: null,
};

function initUI() {
  syncControls();

  for (const key of ["stretch", "width", "snapBack"]) {
    elements[key].addEventListener("input", () => {
      config[key] = Number(elements[key].value);
      elements[`${key}Value`].value = config[key].toFixed(2);
    });
  }

  elements.showGuide.addEventListener("change", () => {
    config.showGuide = elements.showGuide.checked;
  });
  elements.resetButton.addEventListener("click", resetControls);
  elements.startButton.addEventListener("click", startExperience);
  elements.snapshotButton.addEventListener("click", takeSnapshot);

  if (!isSecureCameraContext()) showMessage("Camera access requires HTTPS or localhost.");

  if (!navigator.mediaDevices?.getUserMedia) {
    showMessage("This browser does not support webcam access. Try the latest desktop version of Chrome.", "error");
    elements.startButton.disabled = true;
  }

  try {
    state.renderer = createRenderer(elements.glCanvas);
  } catch (error) {
    console.error(error);
    showMessage("WebGL is required for this demo.", "error");
    elements.startButton.disabled = true;
  }
}

function syncControls() {
  for (const key of ["stretch", "width", "snapBack"]) {
    elements[key].value = config[key];
    elements[`${key}Value`].value = config[key].toFixed(2);
  }
  elements.showGuide.checked = config.showGuide;
}

function resetControls() {
  Object.assign(config, DEFAULT_CONFIG);
  syncControls();
}

function setStatus(label) {
  if (elements.statusText.textContent === label) return;
  elements.statusText.textContent = label;
  elements.statusCluster.classList.toggle(
    "is-live",
    !["idle", "released", "tracking lost"].includes(label),
  );
}

function showMessage(text, type = "warning") {
  elements.message.textContent = text;
  elements.message.hidden = false;
  elements.message.classList.toggle("is-error", type === "error");
}

function clearMessage() {
  elements.message.hidden = true;
  elements.message.textContent = "";
  elements.message.classList.remove("is-error");
}

function isSecureCameraContext() {
  return (
    location.protocol === "https:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1"
  );
}

async function startExperience() {
  if (state.started || !state.renderer) return;

  clearMessage();
  if (!isSecureCameraContext()) showMessage("Camera access requires HTTPS or localhost.");

  state.started = true;
  elements.startButton.disabled = true;
  setStatus("starting camera");

  try {
    await initCamera();
    resizeCanvases(true);
    elements.stage.classList.add("is-camera");
    elements.welcomePanel.classList.add("is-hidden");
    window.setTimeout(() => { elements.welcomePanel.hidden = true; }, 230);
    elements.snapshotButton.disabled = false;
    state.running = true;
    setStatus("loading tracking");
    requestAnimationFrame(animationLoop);
    initializeTrackingWithTimeout();
  } catch (error) {
    console.error(error);
    elements.startButton.disabled = false;
    state.started = false;
    handleCameraError(error);
  }
}

async function initCamera() {
  const preferred = {
    audio: false,
    video: { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: "user" },
  };

  try {
    state.stream = await navigator.mediaDevices.getUserMedia(preferred);
  } catch (firstError) {
    if (["NotAllowedError", "SecurityError", "NotFoundError"].includes(firstError.name)) throw firstError;
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
    });
  }

  elements.video.srcObject = state.stream;
  await new Promise((resolve, reject) => {
    elements.video.addEventListener("loadedmetadata", resolve, { once: true });
    elements.video.addEventListener("error", reject, { once: true });
  });
  await elements.video.play();
}

async function initializeTrackingWithTimeout() {
  let settled = false;
  const timeoutId = window.setTimeout(() => {
    if (settled) return;
    settled = true;
    state.trackingFailed = true;
    setStatus("tracking lost");
    showMessage("Tracking unavailable, reload.", "error");
  }, 8000);

  try {
    const handLandmarker = await createHandLandmarker();
    if (settled) {
      handLandmarker.close();
      return;
    }
    settled = true;
    window.clearTimeout(timeoutId);
    state.handLandmarker = handLandmarker;
    state.trackingReady = true;
    setStatus("show your hand");
  } catch (error) {
    console.error(error);
    if (settled) return;
    settled = true;
    window.clearTimeout(timeoutId);
    state.trackingFailed = true;
    setStatus("tracking lost");
    showMessage("Tracking unavailable, reload.", "error");
  }
}

async function createHandLandmarker() {
  const tasks = await import(`${MEDIAPIPE_ROOT}/vision_bundle.mjs`);
  const { FilesetResolver, HandLandmarker } = tasks;
  if (!FilesetResolver || !HandLandmarker) throw new Error("MediaPipe Hand Landmarker is unavailable");

  const fileset = await FilesetResolver.forVisionTasks(`${MEDIAPIPE_ROOT}/wasm`);
  const options = {
    baseOptions: { modelAssetPath: HAND_MODEL_URL },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.55,
    minHandPresenceConfidence: 0.55,
    minTrackingConfidence: 0.55,
  };

  try {
    return await HandLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: "GPU" },
    });
  } catch (gpuError) {
    console.warn("GPU tracking unavailable; retrying on CPU.", gpuError);
    return HandLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: "CPU" },
    });
  }
}

function handleCameraError(error) {
  let message = "The camera could not be started. Reload the page and try again.";
  if (error.name === "NotAllowedError" || error.name === "SecurityError") {
    message = "Camera permission was denied. Allow camera access in site settings, then reload.";
  } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
    message = "No webcam was found. Connect a camera and try again.";
  } else if (error.name === "NotReadableError" || error.name === "TrackStartError") {
    message = "The webcam is unavailable or already in use. Close other camera apps and try again.";
  } else if (!isSecureCameraContext()) {
    message = "Camera access requires HTTPS or localhost.";
  }
  showMessage(message, "error");
  setStatus("idle");
}

function animationLoop(now) {
  if (!state.running) return;

  resizeCanvases();
  if (elements.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    if (state.trackingReady && elements.video.currentTime !== state.lastHandVideoTime) {
      state.lastHandVideoTime = elements.video.currentTime;
      updateHandTracking(now);
    }
    updateGrabAnimation();
    state.renderer.render(elements.video, state.grab, config);
    renderOverlay();
  }
  requestAnimationFrame(animationLoop);
}

function updateHandTracking(now) {
  let result;
  try {
    result = state.handLandmarker.detectForVideo(elements.video, now);
  } catch (error) {
    console.error("Hand tracking failed", error);
    const grabbedTrack = state.grab ? state.handTracks.get(state.grab.handKey) : null;
    if (grabbedTrack) {
      grabbedTrack.seen = false;
      grabbedTrack.missingFrames += 1;
      if (grabbedTrack.missingFrames > config.lostFrameTolerance) releaseGrab("tracking lost");
    } else {
      setStatus("tracking lost");
    }
    return;
  }

  for (const track of state.handTracks.values()) {
    track.seen = false;
    track.justClosed = false;
    track.justOpened = false;
  }

  const hands = result.landmarks ?? [];
  const handednesses = result.handednesses ?? [];
  const usedKeys = new Set();

  for (let index = 0; index < hands.length; index += 1) {
    const hand = hands[index];
    const label = handednesses[index]?.[0]?.categoryName?.toLowerCase() || `hand-${index}`;
    let key = label;
    if (usedKeys.has(key)) key = `${label}-${index}`;
    usedKeys.add(key);

    const measurement = measureHand(hand);
    let track = state.handTracks.get(key);
    if (!track) {
      track = {
        key,
        center: { ...measurement.center },
        score: measurement.score,
        palmWidth: measurement.palmWidth,
        closedFrames: 0,
        openFrames: 0,
        isFist: false,
        justClosed: false,
        justOpened: false,
        missingFrames: 0,
        seen: true,
      };
      state.handTracks.set(key, track);
    }

    track.center = lerpPoint(track.center, measurement.center, 0.36);
    track.score = track.score * 0.55 + measurement.score * 0.45;
    track.palmWidth = track.palmWidth * 0.65 + measurement.palmWidth * 0.35;
    track.seen = true;
    track.missingFrames = 0;

    if (!track.isFist) {
      track.closedFrames = track.score < config.closedThreshold ? track.closedFrames + 1 : 0;
      track.openFrames = 0;
      if (track.closedFrames >= config.confirmationFrames) {
        track.isFist = true;
        track.justClosed = true;
        track.closedFrames = config.confirmationFrames;
      }
    } else {
      track.openFrames = track.score > config.openThreshold ? track.openFrames + 1 : 0;
      if (track.openFrames >= config.confirmationFrames) {
        track.isFist = false;
        track.justOpened = true;
        track.openFrames = config.confirmationFrames;
        track.closedFrames = 0;
      }
    }
  }

  for (const [key, track] of state.handTracks) {
    if (!track.seen) track.missingFrames += 1;
    if (track.missingFrames > 40 && state.grab?.handKey !== key) state.handTracks.delete(key);
  }

  const seenTracks = [...state.handTracks.values()].filter((track) => track.seen);
  state.guideTrack = chooseGuideTrack(seenTracks);

  if (state.grab?.phase === "dragging") {
    const grabbedTrack = state.handTracks.get(state.grab.handKey);
    if (grabbedTrack?.seen) {
      state.grab.rawTarget.x = grabbedTrack.center.x;
      state.grab.rawTarget.y = grabbedTrack.center.y;
      if (grabbedTrack.justOpened) releaseGrab("released");
      else setStatus("grabbing");
    } else if (!grabbedTrack || grabbedTrack.missingFrames > config.lostFrameTolerance) {
      releaseGrab("tracking lost");
    }
    return;
  }

  if (state.grab) return;

  const closingCandidates = seenTracks
    .filter((track) => track.justClosed)
    .sort((a, b) => a.score - b.score);

  if (closingCandidates.length) {
    beginGrab(closingCandidates[0]);
    return;
  }

  updateIdleStatus(seenTracks);
}

function measureHand(hand) {
  const palmIndices = [0, 5, 9, 13, 17];
  const fingertipIndices = [8, 12, 16, 20];
  const palmPoints = palmIndices.map((index) => landmarkToDisplayPoint(hand[index]));
  const center = averagePoints(palmPoints);
  const palmWidth = Math.max(
    pointDistance(landmarkToDisplayPoint(hand[5]), landmarkToDisplayPoint(hand[17])),
    0.001,
  );

  let fingertipDistance = 0;
  for (const index of fingertipIndices) {
    fingertipDistance += pointDistance(landmarkToDisplayPoint(hand[index]), center);
  }

  return {
    center,
    palmWidth,
    score: fingertipDistance / fingertipIndices.length / palmWidth,
  };
}

function chooseGuideTrack(seenTracks) {
  if (!seenTracks.length) return null;
  if (state.grab) {
    const grabbedTrack = state.handTracks.get(state.grab.handKey);
    if (grabbedTrack?.seen) return grabbedTrack;
  }
  return seenTracks.reduce((best, track) => {
    if (!best) return track;
    if (track.isFist !== best.isFist) return track.isFist ? track : best;
    return track.score < best.score ? track : best;
  }, null);
}

function updateIdleStatus(seenTracks = null) {
  const visible = seenTracks ?? [...state.handTracks.values()].filter((track) => track.seen);
  if (!visible.length) {
    setStatus("show your hand");
    return;
  }
  const fistCandidate = visible.some((track) => track.isFist || track.closedFrames > 0);
  setStatus(fistCandidate ? "fist detected" : "open hand");
}

function beginGrab(track) {
  state.renderer.captureSourceFrame(elements.video);
  state.grab = {
    handKey: track.key,
    phase: "dragging",
    origin: { ...track.center },
    target: { ...track.center },
    rawTarget: { ...track.center },
    width: config.width,
    activeAmount: 0,
  };
  setStatus("grabbing");
}

function releaseGrab(status) {
  if (!state.grab || state.grab.phase === "returning") return;
  state.grab.phase = "returning";
  setStatus(status);
}

function updateGrabAnimation() {
  const grab = state.grab;
  if (!grab) return;

  if (grab.phase === "dragging") {
    grab.target = lerpPoint(grab.target, grab.rawTarget, config.smoothing);
    grab.activeAmount += (1 - grab.activeAmount) * 0.18;
    return;
  }

  grab.target = lerpPoint(grab.target, grab.origin, config.snapBack);
  grab.activeAmount += (0 - grab.activeAmount) * config.snapBack;
  if (grab.activeAmount < 0.008 && pointDistance(grab.target, grab.origin) < 0.008) {
    state.grab = null;
    updateIdleStatus();
  }
}

function landmarkToDisplayPoint(landmark) {
  return { x: 1 - landmark.x, y: 1 - landmark.y };
}

function averagePoints(points) {
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  return { x: x / points.length, y: y / points.length };
}

function lerpPoint(a, b, amount) {
  return { x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount };
}

function pointDistance(a, b) {
  const width = elements.glCanvas.width || 960;
  const height = elements.glCanvas.height || 540;
  const shortSide = Math.min(width, height);
  return Math.hypot((a.x - b.x) * width, (a.y - b.y) * height) / shortSide;
}

function resizeCanvases(force = false) {
  if (!elements.video.videoWidth || !elements.video.videoHeight) return;
  const aspect = elements.video.videoWidth / elements.video.videoHeight;
  if (force) elements.stage.style.aspectRatio = String(aspect);

  const displayWidth = Math.max(1, elements.stage.clientWidth);
  const displayHeight = Math.max(1, elements.stage.clientHeight);
  const scale = Math.min(1, 960 / displayWidth, 540 / displayHeight);
  const width = Math.round(displayWidth * scale);
  const height = Math.round(displayHeight * scale);

  if (force || elements.glCanvas.width !== width || elements.glCanvas.height !== height) {
    elements.glCanvas.width = width;
    elements.glCanvas.height = height;
    elements.overlayCanvas.width = width;
    elements.overlayCanvas.height = height;
    state.renderer.resize(width, height);
  }
}

function renderOverlay() {
  const canvas = elements.overlayCanvas;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!config.showGuide) return;

  const guide = state.guideTrack;
  if (guide?.seen) {
    const center = overlayPoint(guide.center);
    const palmRadius = Math.max(7, Math.min(16, guide.palmWidth * Math.min(canvas.width, canvas.height) * 0.18));
    drawPoint(
      context,
      center,
      palmRadius,
      guide.isFist ? "rgba(159,151,32,0.72)" : "rgba(144,181,221,0.68)",
      "#F7F3EA",
    );
  }

  if (state.grab) {
    const origin = overlayPoint(state.grab.origin);
    const target = overlayPoint(state.grab.target);
    context.save();
    context.globalAlpha = 0.52 + state.grab.activeAmount * 0.35;
    context.strokeStyle = "#F7F3EA";
    context.lineWidth = Math.max(1.5, canvas.width / 540);
    context.setLineDash([7, 8]);
    context.beginPath();
    context.moveTo(origin.x, origin.y);
    context.lineTo(target.x, target.y);
    context.stroke();
    context.restore();
    drawPoint(context, origin, 5, "#9F9720", "#F7F3EA");
    drawPoint(context, target, 5, "#90B5DD", "#F7F3EA");
  }
}

function overlayPoint(point) {
  return { x: point.x * elements.overlayCanvas.width, y: (1 - point.y) * elements.overlayCanvas.height };
}

function drawPoint(context, point, radius, fill, stroke = null) {
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.fillStyle = fill;
  context.fill();
  if (stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = 1.5;
    context.stroke();
  }
}

function takeSnapshot() {
  if (!state.running) return;
  const output = document.createElement("canvas");
  output.width = elements.glCanvas.width;
  output.height = elements.glCanvas.height;
  const context = output.getContext("2d");
  context.drawImage(elements.glCanvas, 0, 0);
  context.drawImage(elements.overlayCanvas, 0, 0);
  output.toBlob((blob) => {
    if (!blob) return;
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `stretch-cam-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

function createRenderer(canvas) {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: true,
  });
  if (!gl) throw new Error("WebGL is unavailable");

  const vertexSource = `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() {
      v_uv = a_position * 0.5 + 0.5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fragmentSource = `
    precision highp float;

    uniform sampler2D u_videoTexture;
    uniform sampler2D u_sourceTexture;
    uniform vec2 u_origin;
    uniform vec2 u_target;
    uniform vec2 u_resolution;
    uniform float u_stretch;
    uniform float u_width;
    uniform float u_feather;
    uniform float u_maxStretch;
    uniform float u_activeAmount;
    uniform float u_hasGrab;
    varying vec2 v_uv;

    vec2 reflectedUV(vec2 value) {
      vec2 wrapped = mod(value, 2.0);
      wrapped = mix(wrapped, wrapped + 2.0, step(wrapped, vec2(0.0)));
      return 1.0 - abs(wrapped - 1.0);
    }

    vec2 cameraUV(vec2 displayUV) {
      vec2 result = reflectedUV(displayUV);
      result.x = 1.0 - result.x;
      return result;
    }

    void main() {
      vec4 videoColor = texture2D(u_videoTexture, cameraUV(v_uv));
      vec4 finalColor = videoColor;

      if (u_hasGrab > 0.5 && u_activeAmount > 0.001) {
        float shortSide = min(u_resolution.x, u_resolution.y);
        vec2 aspectScale = u_resolution / shortSide;
        vec2 scaledAxis = (u_target - u_origin) * aspectScale;
        float rawLength = length(scaledAxis);
        vec2 direction = scaledAxis / max(rawLength, 0.0001);
        float stretchLength = min(rawLength * u_stretch, u_maxStretch);
        vec2 destinationAxis = direction * stretchLength * u_activeAmount;
        vec2 destinationEnd = u_origin + destinationAxis / aspectScale;

        vec2 scaledDestinationAxis = (destinationEnd - u_origin) * aspectScale;
        vec2 scaledFromOrigin = (v_uv - u_origin) * aspectScale;
        float denominator = max(dot(scaledDestinationAxis, scaledDestinationAxis), 0.000001);
        float t = clamp(dot(scaledFromOrigin, scaledDestinationAxis) / denominator, 0.0, 1.0);
        vec2 closest = mix(u_origin, destinationEnd, t);
        vec2 lateral = v_uv - closest;
        float lateralDistance = length(lateral * aspectScale);

        float cartoonTaper = mix(1.16, 0.68, smoothstep(0.0, 1.0, t));
        float patchWidth = u_width * cartoonTaper;
        float capsule = 1.0 - smoothstep(
          patchWidth,
          patchWidth + max(u_feather, 0.001),
          lateralDistance
        );

        float sourceTravel = min(stretchLength * 0.085, u_width * 0.42);
        vec2 compressedSourceAxis = direction * sourceTravel / aspectScale;
        vec2 sourceUV = u_origin + lateral * 0.94 + compressedSourceAxis * t;
        vec4 stretchedColor = texture2D(u_sourceTexture, cameraUV(sourceUV));
        stretchedColor.rgb *= vec3(1.035, 0.995, 1.055);
        float patchAlpha = capsule * u_activeAmount;
        finalColor = mix(videoColor, stretchedColor, patchAlpha);
      }

      gl_FragColor = finalColor;
    }
  `;

  const program = createProgram(gl, vertexSource, fragmentSource);
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );

  const positionLocation = gl.getAttribLocation(program, "a_position");
  const uniforms = {};
  for (const name of [
    "u_videoTexture", "u_sourceTexture", "u_origin", "u_target", "u_resolution",
    "u_stretch", "u_width", "u_feather", "u_maxStretch", "u_activeAmount", "u_hasGrab",
  ]) {
    uniforms[name] = gl.getUniformLocation(program, name);
  }

  const videoTexture = createTexture(gl);
  const sourceTexture = createTexture(gl);

  function captureSourceFrame(video) {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
  }

  function render(video, grab, currentConfig) {
    gl.useProgram(program);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, videoTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const origin = grab?.origin ?? { x: 0.5, y: 0.5 };
    const target = grab?.target ?? origin;
    gl.uniform1i(uniforms.u_videoTexture, 0);
    gl.uniform1i(uniforms.u_sourceTexture, 1);
    gl.uniform2f(uniforms.u_origin, origin.x, origin.y);
    gl.uniform2f(uniforms.u_target, target.x, target.y);
    gl.uniform2f(uniforms.u_resolution, canvas.width, canvas.height);
    gl.uniform1f(uniforms.u_stretch, currentConfig.stretch);
    gl.uniform1f(uniforms.u_width, grab?.width ?? currentConfig.width);
    gl.uniform1f(uniforms.u_feather, currentConfig.feather);
    gl.uniform1f(uniforms.u_maxStretch, currentConfig.maxStretch);
    gl.uniform1f(uniforms.u_activeAmount, grab?.activeAmount ?? 0);
    gl.uniform1f(uniforms.u_hasGrab, grab ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  return {
    resize(width, height) { gl.viewport(0, 0, width, height); },
    captureSourceFrame,
    render,
  };
}

function createTexture(gl) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 255]),
  );
  return texture;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`WebGL program error: ${gl.getProgramInfoLog(program)}`);
  }
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  return program;
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`WebGL shader error: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

window.addEventListener("resize", () => resizeCanvases(true));
window.addEventListener("pagehide", () => {
  state.running = false;
  state.stream?.getTracks().forEach((track) => track.stop());
  state.handLandmarker?.close();
});

initUI();
