const MEDIAPIPE_VERSION = "0.10.22-rc.20250304";
const MEDIAPIPE_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const DEFAULT_CONFIG = Object.freeze({
  distortion: 1,
  radius: 0.22,
  elasticReturn: 0.1,
  wobble: 0.85,
  showGuides: true,
  smoothing: 0.3,
});

const RANDOM_WORDS = [
  "WOBBLE", "JELLY", "ELASTIC", "GUMMY", "WAVE", "SOFT", "TYPE", "BOUNCE", "MELT", "SQUISH",
];

const config = { ...DEFAULT_CONFIG };

const elements = {
  video: document.querySelector("#webcam"),
  glCanvas: document.querySelector("#glCanvas"),
  guideCanvas: document.querySelector("#guideCanvas"),
  stage: document.querySelector("#stage"),
  welcomePanel: document.querySelector("#welcomePanel"),
  startButton: document.querySelector("#startButton"),
  snapshotButton: document.querySelector("#snapshotButton"),
  randomButton: document.querySelector("#randomButton"),
  customWord: document.querySelector("#customWord"),
  statusText: document.querySelector("#statusText"),
  statusCluster: document.querySelector(".status-cluster"),
  message: document.querySelector("#message"),
  distortion: document.querySelector("#distortion"),
  distortionValue: document.querySelector("#distortionValue"),
  radius: document.querySelector("#radius"),
  radiusValue: document.querySelector("#radiusValue"),
  elasticReturn: document.querySelector("#elasticReturn"),
  elasticReturnValue: document.querySelector("#elasticReturnValue"),
  wobble: document.querySelector("#wobble"),
  wobbleValue: document.querySelector("#wobbleValue"),
  showGuides: document.querySelector("#showGuides"),
  wordButtons: [...document.querySelectorAll("[data-word]")],
};

const state = {
  word: "STRETCH",
  cameraStarted: false,
  stream: null,
  handLandmarker: null,
  trackingReady: false,
  trackingFailed: false,
  lastHandVideoTime: -1,
  renderer: null,
  handTracks: new Map(),
  renderHands: [],
  pairAmount: 0,
  pairAxis: { x: 1, y: 0 },
  previousPairDistance: null,
  wobbleEnergy: 0,
};

function initUI() {
  syncControls();

  for (const key of ["distortion", "radius", "elasticReturn", "wobble"]) {
    elements[key].addEventListener("input", () => {
      config[key] = Number(elements[key].value);
      elements[`${key}Value`].value = config[key].toFixed(2);
    });
  }

  elements.showGuides.addEventListener("change", () => {
    config.showGuides = elements.showGuides.checked;
  });

  for (const button of elements.wordButtons) {
    button.addEventListener("click", () => setWord(button.dataset.word, button));
  }

  elements.randomButton.addEventListener("click", () => {
    const choices = RANDOM_WORDS.filter((word) => word !== state.word);
    const word = choices[Math.floor(Math.random() * choices.length)];
    setWord(word);
  });

  elements.customWord.addEventListener("input", () => {
    const cleaned = cleanWord(elements.customWord.value);
    if (elements.customWord.value !== cleaned) elements.customWord.value = cleaned;
    if (cleaned.trim()) setWord(cleaned.trim());
  });

  elements.startButton.addEventListener("click", startExperience);
  elements.snapshotButton.addEventListener("click", takeSnapshot);

  if (!isSecureCameraContext()) showMessage("Camera access requires HTTPS or localhost.");

  if (!navigator.mediaDevices?.getUserMedia) {
    showMessage("This browser does not support webcam access. Try the latest desktop version of Chrome.", "error");
    elements.startButton.disabled = true;
  }

  try {
    state.renderer = createRenderer(elements.glCanvas);
    resizeCanvases(true);
    state.renderer.setWord(state.word);
    requestAnimationFrame(animationLoop);
  } catch (error) {
    console.error(error);
    showMessage("WebGL is required for this demo.", "error");
    elements.startButton.disabled = true;
  }
}

function syncControls() {
  for (const key of ["distortion", "radius", "elasticReturn", "wobble"]) {
    elements[key].value = config[key];
    elements[`${key}Value`].value = config[key].toFixed(2);
  }
  elements.showGuides.checked = config.showGuides;
}

function cleanWord(value) {
  return value.toUpperCase().replace(/[^A-Z0-9 À-ÖØ-Ý!?&]/g, "").slice(0, 12);
}

function setWord(word, activeButton = null) {
  state.word = cleanWord(word) || "STRETCH";
  state.renderer.setWord(state.word);
  for (const button of elements.wordButtons) {
    button.classList.toggle("is-active", button === activeButton || button.dataset.word === state.word);
  }
}

function setStatus(label) {
  if (elements.statusText.textContent === label) return;
  elements.statusText.textContent = label;
  elements.statusCluster.classList.toggle(
    "is-live",
    !["idle", "tracking unavailable"].includes(label),
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
  if (state.cameraStarted || !state.renderer) return;

  clearMessage();
  if (!isSecureCameraContext()) showMessage("Camera access requires HTTPS or localhost.");
  elements.startButton.disabled = true;
  setStatus("starting camera");

  try {
    await initCamera();
    state.cameraStarted = true;
    elements.snapshotButton.disabled = false;
    elements.welcomePanel.classList.add("is-hidden");
    window.setTimeout(() => { elements.welcomePanel.hidden = true; }, 230);
    setStatus("loading tracking");
    initializeTrackingWithTimeout();
  } catch (error) {
    console.error(error);
    elements.startButton.disabled = false;
    handleCameraError(error);
  }
}

async function initCamera() {
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: "user" },
    });
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
    setStatus("tracking unavailable");
    showMessage("Hand tracking unavailable. Reload and try again.", "error");
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
    setStatus("show your hands");
  } catch (error) {
    console.error(error);
    if (settled) return;
    settled = true;
    window.clearTimeout(timeoutId);
    state.trackingFailed = true;
    setStatus("tracking unavailable");
    showMessage("Hand tracking unavailable. Reload and try again.", "error");
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
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
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
  resizeCanvases();

  if (
    state.cameraStarted &&
    state.trackingReady &&
    elements.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    elements.video.currentTime !== state.lastHandVideoTime
  ) {
    state.lastHandVideoTime = elements.video.currentTime;
    updateHandTracking(now);
  }

  updateElasticDynamics();
  state.renderer.render(state.renderHands, state.pairAmount, state.pairAxis, state.wobbleEnergy, config, now);
  renderGuides();
  requestAnimationFrame(animationLoop);
}

function updateHandTracking(now) {
  let result;
  try {
    result = state.handLandmarker.detectForVideo(elements.video, now);
  } catch (error) {
    console.error("Hand tracking failed", error);
    setStatus("tracking unavailable");
    return;
  }

  for (const track of state.handTracks.values()) track.seen = false;
  const hands = result.landmarks ?? [];
  const handednesses = result.handednesses ?? [];
  const usedKeys = new Set();

  for (let index = 0; index < hands.length; index += 1) {
    const label = handednesses[index]?.[0]?.categoryName?.toLowerCase() || `hand-${index}`;
    let key = label;
    if (usedKeys.has(key)) key = `${label}-${index}`;
    usedKeys.add(key);

    const measurement = measureHand(hands[index]);
    let track = state.handTracks.get(key);
    if (!track) {
      track = {
        key,
        handedness: label,
        center: { ...measurement.center },
        rawCenter: { ...measurement.center },
        velocity: { x: 0, y: 0 },
        openness: measurement.openness,
        palmWidth: measurement.palmWidth,
        seen: true,
        missingFrames: 0,
      };
      state.handTracks.set(key, track);
    }

    const rawVelocity = {
      x: measurement.center.x - track.rawCenter.x,
      y: measurement.center.y - track.rawCenter.y,
    };
    track.rawCenter = { ...measurement.center };
    track.center = lerpPoint(track.center, measurement.center, config.smoothing);
    track.velocity = lerpPoint(track.velocity, rawVelocity, 0.42);
    track.openness += (measurement.openness - track.openness) * 0.35;
    track.palmWidth += (measurement.palmWidth - track.palmWidth) * 0.3;
    track.seen = true;
    track.missingFrames = 0;

    const speed = vectorLength(track.velocity);
    state.wobbleEnergy = Math.max(state.wobbleEnergy, Math.min(1.5, speed * 28));
  }

  for (const [key, track] of state.handTracks) {
    if (!track.seen) {
      track.missingFrames += 1;
      track.velocity.x *= 0.6;
      track.velocity.y *= 0.6;
    }
    if (track.missingFrames > 8) state.handTracks.delete(key);
  }

  state.renderHands = [...state.handTracks.values()]
    .filter((track) => track.seen)
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(0, 2);

  updatePairGesture();
  if (!state.renderHands.length) setStatus("show your hands");
  else setStatus(state.renderHands.length === 2 ? "two hands" : "one hand");
}

function measureHand(hand) {
  const palmPoints = [0, 5, 9, 13, 17].map((index) => landmarkToDisplayPoint(hand[index]));
  const center = averagePoints(palmPoints);
  const palmWidth = Math.max(
    pointDistance(landmarkToDisplayPoint(hand[5]), landmarkToDisplayPoint(hand[17])),
    0.001,
  );
  let fingertipDistance = 0;
  for (const index of [8, 12, 16, 20]) {
    fingertipDistance += pointDistance(landmarkToDisplayPoint(hand[index]), center);
  }
  const opennessScore = fingertipDistance / 4 / palmWidth;
  return {
    center,
    palmWidth,
    openness: smoothstep(1.12, 2.15, opennessScore),
  };
}

function updatePairGesture() {
  if (state.renderHands.length < 2) {
    state.previousPairDistance = null;
    return;
  }

  const first = state.renderHands[0].center;
  const second = state.renderHands[1].center;
  const distance = pointDistance(first, second);
  const physicalAxis = pointVectorPhysical(first, second);
  const axisLength = Math.max(Math.hypot(physicalAxis.x, physicalAxis.y), 0.0001);
  state.pairAxis.x += (physicalAxis.x / axisLength - state.pairAxis.x) * 0.28;
  state.pairAxis.y += (physicalAxis.y / axisLength - state.pairAxis.y) * 0.28;

  if (state.previousPairDistance !== null) {
    const separationChange = distance - state.previousPairDistance;
    state.pairAmount = clamp(state.pairAmount + separationChange * 2.2, -0.36, 0.58);
    state.wobbleEnergy = Math.max(state.wobbleEnergy, Math.min(1.5, Math.abs(separationChange) * 24));
  }
  state.previousPairDistance = distance;
}

function updateElasticDynamics() {
  const returnAmount = config.elasticReturn;
  state.pairAmount += (0 - state.pairAmount) * returnAmount * 0.075;
  state.wobbleEnergy += (0 - state.wobbleEnergy) * returnAmount * 0.11;

  for (const track of state.renderHands) {
    track.velocity.x *= 0.94;
    track.velocity.y *= 0.94;
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

function vectorLength(vector) {
  const width = elements.glCanvas.width || 960;
  const height = elements.glCanvas.height || 504;
  const shortSide = Math.min(width, height);
  return Math.hypot(vector.x * width, vector.y * height) / shortSide;
}

function pointDistance(a, b) {
  return vectorLength({ x: a.x - b.x, y: a.y - b.y });
}

function pointVectorPhysical(a, b) {
  const width = elements.glCanvas.width || 960;
  const height = elements.glCanvas.height || 504;
  const shortSide = Math.min(width, height);
  return { x: (b.x - a.x) * width / shortSide, y: (b.y - a.y) * height / shortSide };
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function resizeCanvases(force = false) {
  if (!state.renderer) return;
  const displayWidth = Math.max(1, elements.stage.clientWidth);
  const displayHeight = Math.max(1, elements.stage.clientHeight);
  const scale = Math.min(1, 960 / displayWidth, 540 / displayHeight);
  const width = Math.round(displayWidth * scale);
  const height = Math.round(displayHeight * scale);

  if (force || elements.glCanvas.width !== width || elements.glCanvas.height !== height) {
    elements.glCanvas.width = width;
    elements.glCanvas.height = height;
    elements.guideCanvas.width = width;
    elements.guideCanvas.height = height;
    state.renderer.resize(width, height);
  }
}

function renderGuides() {
  const canvas = elements.guideCanvas;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!config.showGuides || !state.renderHands.length) return;

  for (const hand of state.renderHands) {
    const point = overlayPoint(hand.center);
    const influenceRadius = config.radius * Math.min(canvas.width, canvas.height);
    const color = hand.openness > 0.5 ? "144, 181, 221" : "183, 170, 203";

    context.save();
    context.beginPath();
    context.arc(point.x, point.y, influenceRadius, 0, Math.PI * 2);
    context.strokeStyle = `rgba(${color}, 0.28)`;
    context.lineWidth = 1.5;
    context.setLineDash([5, 8]);
    context.stroke();
    context.restore();

    context.beginPath();
    context.arc(point.x, point.y, 7, 0, Math.PI * 2);
    context.fillStyle = `rgba(${color}, 0.82)`;
    context.fill();
    context.strokeStyle = "#F7F3EA";
    context.lineWidth = 1.5;
    context.stroke();

    const velocityEnd = {
      x: point.x + hand.velocity.x * canvas.width * 10,
      y: point.y - hand.velocity.y * canvas.height * 10,
    };
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(velocityEnd.x, velocityEnd.y);
    context.strokeStyle = `rgba(${color}, 0.55)`;
    context.lineWidth = 2;
    context.stroke();
  }

  if (state.renderHands.length === 2) {
    const first = overlayPoint(state.renderHands[0].center);
    const second = overlayPoint(state.renderHands[1].center);
    context.beginPath();
    context.moveTo(first.x, first.y);
    context.lineTo(second.x, second.y);
    context.strokeStyle = "rgba(159, 151, 32, 0.36)";
    context.lineWidth = 1.5;
    context.stroke();
  }
}

function overlayPoint(point) {
  return { x: point.x * elements.guideCanvas.width, y: (1 - point.y) * elements.guideCanvas.height };
}

function takeSnapshot() {
  const output = document.createElement("canvas");
  output.width = elements.glCanvas.width;
  output.height = elements.glCanvas.height;
  const context = output.getContext("2d");
  context.drawImage(elements.glCanvas, 0, 0);
  if (config.showGuides) context.drawImage(elements.guideCanvas, 0, 0);
  output.toBlob((blob) => {
    if (!blob) return;
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `elastic-type-${state.word.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}.png`;
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

  const textCanvas = document.createElement("canvas");
  const textContext = textCanvas.getContext("2d");
  let currentWord = "STRETCH";

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

    uniform sampler2D u_textTexture;
    uniform vec2 u_resolution;
    uniform vec4 u_hand1;
    uniform vec4 u_hand2;
    uniform vec2 u_velocity1;
    uniform vec2 u_velocity2;
    uniform float u_hand1Active;
    uniform float u_hand2Active;
    uniform float u_distortion;
    uniform float u_radius;
    uniform float u_wobble;
    uniform float u_energy;
    uniform float u_pairAmount;
    uniform vec2 u_pairAxis;
    uniform float u_time;
    varying vec2 v_uv;

    vec2 applyHandField(
      vec2 uv,
      vec4 hand,
      vec2 velocity,
      float active,
      vec2 aspectScale
    ) {
      vec2 delta = (uv - hand.xy) * aspectScale;
      float distanceToHand = length(delta);
      float radius = max(u_radius, 0.001);
      float falloff = exp(-(distanceToHand * distanceToHand) / (2.0 * radius * radius));
      float handMode = mix(-1.0, 1.0, hand.z);

      vec2 radialDisplacement = (delta / aspectScale) * falloff * handMode * u_distortion * 0.24;
      vec2 motionDisplacement = velocity * falloff * u_distortion * (2.0 + hand.w * 1.5);
      vec2 perpendicular = vec2(-delta.y, delta.x) / max(distanceToHand, 0.001);
      vec2 waveDisplacement = (perpendicular / aspectScale)
        * sin(u_time * 0.012 + distanceToHand * 34.0)
        * falloff * u_wobble * u_energy * 0.014;

      return uv + (radialDisplacement - motionDisplacement + waveDisplacement) * active;
    }

    void main() {
      float shortSide = min(u_resolution.x, u_resolution.y);
      vec2 aspectScale = u_resolution / shortSide;
      vec2 center = vec2(0.5);
      vec2 relative = (v_uv - center) * aspectScale;
      vec2 pairAxis = normalize(u_pairAxis + vec2(0.00001, 0.0));
      vec2 perpendicular = vec2(-pairAxis.y, pairAxis.x);
      float along = dot(relative, pairAxis);
      float across = dot(relative, perpendicular);
      float axisScale = max(0.55, 1.0 + u_pairAmount);
      float crossScale = max(0.72, 1.0 - u_pairAmount * 0.24);
      vec2 pairedRelative = pairAxis * (along / axisScale) + perpendicular * (across / crossScale);
      vec2 sourceUV = center + pairedRelative / aspectScale;

      sourceUV = applyHandField(sourceUV, u_hand1, u_velocity1, u_hand1Active, aspectScale);
      sourceUV = applyHandField(sourceUV, u_hand2, u_velocity2, u_hand2Active, aspectScale);

      float mainAlpha = texture2D(u_textTexture, sourceUV).a;
      vec2 combinedVelocity = (u_velocity1 * u_hand1Active + u_velocity2 * u_hand2Active);
      float lavenderEcho = texture2D(
        u_textTexture,
        sourceUV + combinedVelocity * (2.2 + u_wobble) + vec2(u_pairAmount * 0.012, 0.0)
      ).a;
      float blueEcho = texture2D(
        u_textTexture,
        sourceUV - combinedVelocity * (1.6 + u_wobble)
      ).a;

      vec3 paper = vec3(0.969, 0.953, 0.918);
      vec3 ink = vec3(0.149, 0.212, 0.153);
      vec3 lavender = vec3(0.718, 0.667, 0.796);
      vec3 blue = vec3(0.565, 0.710, 0.867);
      float echoStrength = clamp(u_energy * u_wobble * 0.55, 0.0, 0.7);
      vec3 color = paper;
      color = mix(color, lavender, max(lavenderEcho - mainAlpha, 0.0) * echoStrength);
      color = mix(color, blue, max(blueEcho - mainAlpha, 0.0) * echoStrength * 0.8);
      color = mix(color, ink, mainAlpha);
      gl_FragColor = vec4(color, 1.0);
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
    "u_textTexture", "u_resolution", "u_hand1", "u_hand2", "u_velocity1", "u_velocity2",
    "u_hand1Active", "u_hand2Active", "u_distortion", "u_radius", "u_wobble", "u_energy",
    "u_pairAmount", "u_pairAxis", "u_time",
  ]) {
    uniforms[name] = gl.getUniformLocation(program, name);
  }

  const textTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, textTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  function drawTextTexture() {
    if (!textCanvas.width || !textCanvas.height) return;
    textContext.clearRect(0, 0, textCanvas.width, textCanvas.height);
    textContext.fillStyle = "#263627";
    textContext.textAlign = "center";
    textContext.textBaseline = "middle";

    let fontSize = Math.min(
      textCanvas.height * 0.43,
      textCanvas.width / Math.max(3.2, currentWord.length * 0.61),
    );
    textContext.font = `900 ${fontSize}px Arial Black, Helvetica Neue, Arial, sans-serif`;
    while (textContext.measureText(currentWord).width > textCanvas.width * 0.84 && fontSize > 28) {
      fontSize -= 3;
      textContext.font = `900 ${fontSize}px Arial Black, Helvetica Neue, Arial, sans-serif`;
    }
    textContext.fillText(currentWord, textCanvas.width * 0.5, textCanvas.height * 0.5);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.bindTexture(gl.TEXTURE_2D, textTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
  }

  function resize(width, height) {
    gl.viewport(0, 0, width, height);
    textCanvas.width = width;
    textCanvas.height = height;
    drawTextTexture();
  }

  function setWord(word) {
    currentWord = word;
    drawTextTexture();
  }

  function render(hands, pairAmount, pairAxis, energy, currentConfig, now) {
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textTexture);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const first = hands[0] ?? null;
    const second = hands[1] ?? null;
    const hand1 = first ?? { center: { x: 0.5, y: 0.5 }, openness: 0.5, velocity: { x: 0, y: 0 } };
    const hand2 = second ?? { center: { x: 0.5, y: 0.5 }, openness: 0.5, velocity: { x: 0, y: 0 } };

    gl.uniform1i(uniforms.u_textTexture, 0);
    gl.uniform2f(uniforms.u_resolution, canvas.width, canvas.height);
    gl.uniform4f(
      uniforms.u_hand1,
      hand1.center.x,
      hand1.center.y,
      hand1.openness,
      vectorLength(hand1.velocity),
    );
    gl.uniform4f(
      uniforms.u_hand2,
      hand2.center.x,
      hand2.center.y,
      hand2.openness,
      vectorLength(hand2.velocity),
    );
    gl.uniform2f(uniforms.u_velocity1, hand1.velocity.x, hand1.velocity.y);
    gl.uniform2f(uniforms.u_velocity2, hand2.velocity.x, hand2.velocity.y);
    gl.uniform1f(uniforms.u_hand1Active, first ? 1 : 0);
    gl.uniform1f(uniforms.u_hand2Active, second ? 1 : 0);
    gl.uniform1f(uniforms.u_distortion, currentConfig.distortion);
    gl.uniform1f(uniforms.u_radius, currentConfig.radius);
    gl.uniform1f(uniforms.u_wobble, currentConfig.wobble);
    gl.uniform1f(uniforms.u_energy, energy);
    gl.uniform1f(uniforms.u_pairAmount, pairAmount);
    gl.uniform2f(uniforms.u_pairAxis, pairAxis.x, pairAxis.y);
    gl.uniform1f(uniforms.u_time, now);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  return { resize, setWord, render };
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
  state.stream?.getTracks().forEach((track) => track.stop());
  state.handLandmarker?.close();
});

initUI();
