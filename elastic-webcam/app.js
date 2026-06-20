const MEDIAPIPE_VERSION = "0.10.22-rc.20250304";
const MEDIAPIPE_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const DEFAULT_CONFIG = Object.freeze({
  radius: 0.16,
  strength: 0.9,
  maxPull: 0.28,
  smoothing: 0.22,
  grabThreshold: 0.08,
  releaseEase: 0.12,
  showDebug: false,
  showElasticLine: true,
  targetMode: "both",
});

const config = { ...DEFAULT_CONFIG };

const elements = {
  video: document.querySelector("#webcam"),
  glCanvas: document.querySelector("#glCanvas"),
  overlayCanvas: document.querySelector("#overlayCanvas"),
  stage: document.querySelector("#stage"),
  welcomePanel: document.querySelector("#welcomePanel"),
  startButton: document.querySelector("#startButton"),
  resetButton: document.querySelector("#resetButton"),
  loader: document.querySelector("#loader"),
  statusText: document.querySelector("#statusText"),
  statusCluster: document.querySelector(".status-cluster"),
  message: document.querySelector("#message"),
  radius: document.querySelector("#radius"),
  radiusValue: document.querySelector("#radiusValue"),
  strength: document.querySelector("#strength"),
  strengthValue: document.querySelector("#strengthValue"),
  maxPull: document.querySelector("#maxPull"),
  maxPullValue: document.querySelector("#maxPullValue"),
  smoothing: document.querySelector("#smoothing"),
  smoothingValue: document.querySelector("#smoothingValue"),
  showDebug: document.querySelector("#showDebug"),
  showElasticLine: document.querySelector("#showElasticLine"),
  targetMode: document.querySelector("#targetMode"),
};

const state = {
  started: false,
  running: false,
  stream: null,
  handLandmarker: null,
  faceLandmarker: null,
  handResult: null,
  faceResult: null,
  lastVideoTime: -1,
  pinches: [],
  targets: [],
  activePinch: null,
  grab: null,
  activeAmount: 0,
  justReleased: false,
  glRenderer: null,
};

const FINGER_TIPS = [
  [4, "thumb"],
  [8, "index"],
  [12, "middle"],
  [16, "ring"],
  [20, "pinky"],
];

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

function setStatus(label) {
  if (elements.statusText.textContent === label) return;
  elements.statusText.textContent = label;
  elements.statusCluster.classList.toggle(
    "is-live",
    !["idle", "released"].includes(label),
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

function initUI() {
  const sliders = [
    ["radius", "radiusValue"],
    ["strength", "strengthValue"],
    ["maxPull", "maxPullValue"],
    ["smoothing", "smoothingValue"],
  ];

  sliders.forEach(([inputName, outputName]) => {
    elements[inputName].addEventListener("input", () => {
      config[inputName] = Number(elements[inputName].value);
      elements[outputName].value = config[inputName].toFixed(2);
    });
  });

  elements.showDebug.addEventListener("change", () => {
    config.showDebug = elements.showDebug.checked;
  });
  elements.showElasticLine.addEventListener("change", () => {
    config.showElasticLine = elements.showElasticLine.checked;
  });
  elements.targetMode.addEventListener("change", () => {
    config.targetMode = elements.targetMode.value;
  });

  elements.resetButton.addEventListener("click", resetControls);
  elements.startButton.addEventListener("click", startExperience);

  if (!isSecureCameraContext()) {
    showMessage("Camera access requires HTTPS or localhost.");
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    showMessage(
      "This browser does not support webcam access. Try the latest desktop version of Chrome.",
      "error",
    );
    elements.startButton.disabled = true;
  }

  try {
    state.glRenderer = initWebGL(elements.glCanvas);
  } catch (error) {
    console.error(error);
    showMessage("WebGL is required for this demo.", "error");
    elements.startButton.disabled = true;
  }
}

function resetControls() {
  Object.assign(config, DEFAULT_CONFIG);
  for (const key of ["radius", "strength", "maxPull", "smoothing"]) {
    elements[key].value = config[key];
    elements[`${key}Value`].value = config[key].toFixed(2);
  }
  elements.showDebug.checked = config.showDebug;
  elements.showElasticLine.checked = config.showElasticLine;
  elements.targetMode.value = config.targetMode;
}

async function startExperience() {
  if (state.started || !state.glRenderer) return;

  clearMessage();
  if (!isSecureCameraContext()) {
    showMessage("Camera access requires HTTPS or localhost.");
  }

  state.started = true;
  elements.startButton.disabled = true;
  elements.loader.hidden = false;
  setStatus("loading models");

  try {
    await initMediaPipe();
    await initCamera();
    resizeCanvases(true);
    elements.stage.classList.add("is-camera");
    elements.welcomePanel.classList.add("is-hidden");
    window.setTimeout(() => {
      elements.welcomePanel.hidden = true;
    }, 280);
    elements.loader.hidden = true;
    setStatus("camera ready");
    state.running = true;
    requestAnimationFrame(animationLoop);
  } catch (error) {
    console.error(error);
    elements.loader.hidden = true;
    elements.startButton.disabled = false;
    state.started = false;
    handleStartupError(error);
  }
}

async function initCamera() {
  const preferred = {
    audio: false,
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: "user",
    },
  };

  try {
    state.stream = await navigator.mediaDevices.getUserMedia(preferred);
  } catch (firstError) {
    if (["NotAllowedError", "SecurityError", "NotFoundError"].includes(firstError.name)) {
      throw firstError;
    }
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

async function initMediaPipe() {
  let visionTasks;
  try {
    visionTasks = await import(`${MEDIAPIPE_ROOT}/vision_bundle.mjs`);
  } catch (error) {
    const wrapped = new Error("MediaPipe could not be loaded. Check your internet connection and reload the page.");
    wrapped.cause = error;
    wrapped.code = "MEDIAPIPE_LOAD_FAILED";
    throw wrapped;
  }

  const { FilesetResolver, HandLandmarker, FaceLandmarker } = visionTasks;
  if (!FilesetResolver || !HandLandmarker || !FaceLandmarker) {
    const error = new Error("MediaPipe Tasks Vision is unavailable.");
    error.code = "MEDIAPIPE_LOAD_FAILED";
    throw error;
  }

  const fileset = await FilesetResolver.forVisionTasks(`${MEDIAPIPE_ROOT}/wasm`);

  const handOptions = {
    baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };
  const faceOptions = {
    baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  };

  try {
    [state.handLandmarker, state.faceLandmarker] = await Promise.all([
      HandLandmarker.createFromOptions(fileset, handOptions),
      FaceLandmarker.createFromOptions(fileset, faceOptions),
    ]);
  } catch (gpuError) {
    console.warn("GPU inference unavailable; retrying MediaPipe on CPU.", gpuError);
    handOptions.baseOptions.delegate = "CPU";
    faceOptions.baseOptions.delegate = "CPU";
    [state.handLandmarker, state.faceLandmarker] = await Promise.all([
      HandLandmarker.createFromOptions(fileset, handOptions),
      FaceLandmarker.createFromOptions(fileset, faceOptions),
    ]);
  }
}

function handleStartupError(error) {
  let message = "The camera could not be started. Reload the page and try again.";

  if (error.code === "MEDIAPIPE_LOAD_FAILED") {
    message = error.message;
  } else if (error.name === "NotAllowedError" || error.name === "SecurityError") {
    message =
      "Camera permission was denied. Allow camera access in your browser's site settings, then reload and try again.";
  } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
    message = "No webcam was found. Connect a camera and try again.";
  } else if (error.name === "NotReadableError" || error.name === "TrackStartError") {
    message =
      "The webcam is unavailable or already in use. Close other camera apps and try again.";
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
    if (elements.video.currentTime !== state.lastVideoTime) {
      state.lastVideoTime = elements.video.currentTime;
      try {
        state.handResult = state.handLandmarker.detectForVideo(elements.video, now);
        state.faceResult = state.faceLandmarker.detectForVideo(elements.video, now);
        processLandmarks();
      } catch (error) {
        console.error("Landmark detection failed", error);
      }
    }

    updateGrabLogic();
    state.glRenderer.render(elements.video, state.grab, state.activeAmount, config);
    renderOverlay();
  }

  requestAnimationFrame(animationLoop);
}

function processLandmarks() {
  const hands = state.handResult?.landmarks ?? [];
  const faces = state.faceResult?.faceLandmarks ?? [];
  state.targets.length = 0;

  for (let handIndex = 0; handIndex < hands.length; handIndex += 1) {
    const hand = hands[handIndex];
    const thumb = toDisplayPoint(hand[4]);
    const index = toDisplayPoint(hand[8]);
    const rawPoint = midpoint(thumb, index);
    const palmWidth = pointDistance(toDisplayPoint(hand[5]), toDisplayPoint(hand[17]));
    const pinchThreshold = Math.max(0.035, Math.min(0.075, palmWidth * 0.3));
    const isActive = pointDistance(thumb, index) < pinchThreshold;
    const previous = state.pinches[handIndex];
    const smoothed = previous
      ? lerpPoint(previous.point, rawPoint, config.smoothing)
      : rawPoint;

    state.pinches[handIndex] = {
      handIndex,
      point: smoothed,
      rawPoint,
      isActive,
    };
  }
  state.pinches.length = hands.length;

  if ((config.targetMode === "both" || config.targetMode === "mouth") && faces[0]) {
    const mouthIndices = [13, 14, 61, 291];
    const mouth = averagePoints(mouthIndices.map((index) => toDisplayPoint(faces[0][index])));
    state.targets.push({ type: "mouth", name: "mouth", point: mouth });
  }

  if (config.targetMode === "both" || config.targetMode === "fingers") {
    hands.forEach((hand, handIndex) => {
      FINGER_TIPS.forEach(([landmarkIndex, fingerName]) => {
        state.targets.push({
          type: "finger",
          name: fingerName,
          handIndex,
          landmarkIndex,
          point: toDisplayPoint(hand[landmarkIndex]),
        });
      });
    });
  }
}

function updateGrabLogic() {
  const handsPresent = (state.handResult?.landmarks?.length ?? 0) > 0;
  state.justReleased = false;

  if (state.grab) {
    const pinch = state.pinches[state.grab.pinchHandIndex];
    if (pinch?.isActive) {
      state.activePinch = pinch;
      state.grab.target = lerpPoint(state.grab.target, pinch.point, config.smoothing);
      state.activeAmount += (1 - state.activeAmount) * Math.max(0.08, config.smoothing);
      setStatus(state.grab.type === "mouth" ? "grab mouth" : "grab finger");
      return;
    }

    state.activePinch = null;
    state.activeAmount += (0 - state.activeAmount) * config.releaseEase;
    state.justReleased = true;
    setStatus("released");
    if (state.activeAmount < 0.008) {
      state.activeAmount = 0;
      state.grab = null;
    }
    return;
  }

  state.activeAmount = 0;
  const activePinches = state.pinches.filter((pinch) => pinch.isActive);
  state.activePinch = activePinches[0] ?? null;

  let bestMatch = null;
  for (const pinch of activePinches) {
    for (const target of state.targets) {
      // On the pinching hand, the thumb and index are the gesture itself, not targets.
      if (
        target.type === "finger" &&
        target.handIndex === pinch.handIndex &&
        (target.landmarkIndex === 4 || target.landmarkIndex === 8)
      ) {
        continue;
      }

      const distance = pointDistance(pinch.point, target.point);
      if (distance < config.grabThreshold && (!bestMatch || distance < bestMatch.distance)) {
        bestMatch = { pinch, target, distance };
      }
    }
  }

  if (bestMatch) {
    state.activePinch = bestMatch.pinch;
    state.grab = {
      type: bestMatch.target.type,
      name: bestMatch.target.name,
      pinchHandIndex: bestMatch.pinch.handIndex,
      origin: { ...bestMatch.target.point },
      target: { ...bestMatch.pinch.point },
    };
    state.activeAmount = 0.08;
    setStatus(bestMatch.target.type === "mouth" ? "grab mouth" : "grab finger");
  } else if (activePinches.length) {
    setStatus("pinch");
  } else if (!handsPresent) {
    setStatus("no hand");
  } else {
    setStatus("camera ready");
  }
}

function toDisplayPoint(landmark) {
  // MediaPipe returns the camera's native orientation. X is flipped to match the selfie view.
  return { x: 1 - landmark.x, y: 1 - landmark.y };
}

function midpoint(a, b) {
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
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
  return {
    x: a.x + (b.x - a.x) * amount,
    y: a.y + (b.y - a.y) * amount,
  };
}

function pointDistance(a, b) {
  const width = elements.glCanvas.width || 960;
  const height = elements.glCanvas.height || 540;
  const scale = Math.min(width, height);
  return Math.hypot((a.x - b.x) * width, (a.y - b.y) * height) / scale;
}

function resizeCanvases(force = false) {
  if (!elements.video.videoWidth || !elements.video.videoHeight) return;

  const aspect = elements.video.videoWidth / elements.video.videoHeight;
  if (force) elements.stage.style.aspectRatio = String(aspect);

  const displayWidth = Math.max(1, elements.stage.clientWidth);
  const displayHeight = Math.max(1, elements.stage.clientHeight);
  const maxWidth = 960;
  const maxHeight = 540;
  const scale = Math.min(1, maxWidth / displayWidth, maxHeight / displayHeight);
  const width = Math.round(displayWidth * scale);
  const height = Math.round(displayHeight * scale);

  if (force || elements.glCanvas.width !== width || elements.glCanvas.height !== height) {
    elements.glCanvas.width = width;
    elements.glCanvas.height = height;
    elements.overlayCanvas.width = width;
    elements.overlayCanvas.height = height;
    state.glRenderer.resize(width, height);
  }
}

function renderOverlay() {
  const canvas = elements.overlayCanvas;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);

  if (config.showElasticLine && state.grab && state.activeAmount > 0.01) {
    const origin = overlayPoint(state.grab.origin);
    const target = overlayPoint(state.grab.target);
    const controlX = (origin.x + target.x) * 0.5;
    const controlY = (origin.y + target.y) * 0.5 - Math.min(34, Math.abs(target.x - origin.x) * 0.08);
    context.save();
    context.globalAlpha = 0.35 + state.activeAmount * 0.45;
    context.strokeStyle = "#F7F3EA";
    context.lineWidth = Math.max(1.5, canvas.width / 520);
    context.setLineDash([7, 8]);
    context.beginPath();
    context.moveTo(origin.x, origin.y);
    context.quadraticCurveTo(controlX, controlY, target.x, target.y);
    context.stroke();
    context.setLineDash([]);
    drawPoint(context, origin, 5, "#9F9720", "#F7F3EA");
    drawPoint(context, target, 5, "#90B5DD", "#F7F3EA");
    context.restore();
  }

  if (!config.showDebug) return;

  const hands = state.handResult?.landmarks ?? [];
  context.save();
  context.lineWidth = 1;
  context.strokeStyle = "rgba(247, 243, 234, 0.45)";
  for (const hand of hands) {
    for (const [startIndex, endIndex] of HAND_CONNECTIONS) {
      const start = overlayPoint(toDisplayPoint(hand[startIndex]));
      const end = overlayPoint(toDisplayPoint(hand[endIndex]));
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
    }
    for (const landmark of hand) {
      drawPoint(context, overlayPoint(toDisplayPoint(landmark)), 2.5, "#F7F3EA");
    }
  }

  for (const target of state.targets) {
    const point = overlayPoint(target.point);
    context.beginPath();
    context.arc(point.x, point.y, target.type === "mouth" ? 10 : 7, 0, Math.PI * 2);
    context.strokeStyle = target.type === "mouth" ? "#B7AACB" : "#9F9720";
    context.lineWidth = 2;
    context.stroke();
  }

  if (state.activePinch) {
    drawPoint(context, overlayPoint(state.activePinch.point), 7, "#90B5DD", "#F7F3EA");
  }
  context.restore();
}

function overlayPoint(point) {
  return {
    x: point.x * elements.overlayCanvas.width,
    y: (1 - point.y) * elements.overlayCanvas.height,
  };
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

function initWebGL(canvas) {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    powerPreference: "high-performance",
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

    uniform sampler2D u_texture;
    uniform vec2 u_origin;
    uniform vec2 u_target;
    uniform float u_radius;
    uniform float u_strength;
    uniform float u_maxPull;
    uniform float u_activeAmount;
    uniform vec2 u_resolution;
    uniform float u_mirror;
    varying vec2 v_uv;

    vec2 reflectUV(vec2 value) {
      vec2 wrapped = mod(value, 2.0);
      wrapped = mix(wrapped, wrapped + 2.0, step(wrapped, vec2(0.0)));
      return 1.0 - abs(wrapped - 1.0);
    }

    void main() {
      float shortSide = min(u_resolution.x, u_resolution.y);
      vec2 aspectScale = u_resolution / shortSide;
      vec2 pullVector = u_target - u_origin;
      float pullLength = length(pullVector * aspectScale);
      if (pullLength > u_maxPull) {
        pullVector *= u_maxPull / max(pullLength, 0.0001);
      }

      float distanceFromOrigin = length((v_uv - u_origin) * aspectScale);
      float radius = max(u_radius, 0.0001);
      float falloff = exp(-(distanceFromOrigin * distanceFromOrigin) / (2.0 * radius * radius));
      vec2 sourceUV = v_uv - pullVector * falloff * u_strength * u_activeAmount;
      sourceUV = reflectUV(sourceUV);
      sourceUV.x = mix(sourceUV.x, 1.0 - sourceUV.x, u_mirror);
      gl_FragColor = texture2D(u_texture, sourceUV);
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
    "u_texture",
    "u_origin",
    "u_target",
    "u_radius",
    "u_strength",
    "u_maxPull",
    "u_activeAmount",
    "u_resolution",
    "u_mirror",
  ]) {
    uniforms[name] = gl.getUniformLocation(program, name);
  }

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  function render(video, grab, activeAmount, currentConfig) {
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const origin = grab?.origin ?? { x: 0.5, y: 0.5 };
    const target = grab?.target ?? origin;
    gl.uniform1i(uniforms.u_texture, 0);
    gl.uniform2f(uniforms.u_origin, origin.x, origin.y);
    gl.uniform2f(uniforms.u_target, target.x, target.y);
    gl.uniform1f(uniforms.u_radius, currentConfig.radius);
    gl.uniform1f(uniforms.u_strength, currentConfig.strength);
    gl.uniform1f(uniforms.u_maxPull, currentConfig.maxPull);
    gl.uniform1f(uniforms.u_activeAmount, activeAmount);
    gl.uniform2f(uniforms.u_resolution, canvas.width, canvas.height);
    gl.uniform1f(uniforms.u_mirror, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  return {
    resize(width, height) {
      gl.viewport(0, 0, width, height);
    },
    render,
  };
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
  state.faceLandmarker?.close();
});

initUI();
