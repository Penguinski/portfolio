const MEDIAPIPE_VERSION = "0.10.22-rc.20250304";
const MEDIAPIPE_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const DEFAULT_CONFIG = Object.freeze({
  stretchWidth: 0.075,
  stretchStrength: 0.95,
  elasticReturn: 0.16,
  maskFeather: 0.025,
  maxStretch: 0.45,
  smoothing: 0.24,
  inputMode: "mouse",
  debugMask: false,
  showGrabLine: true,
});

const PRESETS = Object.freeze({
  soft: { stretchWidth: 0.095, stretchStrength: 0.72, elasticReturn: 0.075, maskFeather: 0.04, maxStretch: 0.35 },
  rubber: { stretchWidth: 0.075, stretchStrength: 0.95, elasticReturn: 0.16, maskFeather: 0.025, maxStretch: 0.45 },
  extreme: { stretchWidth: 0.12, stretchStrength: 1.3, elasticReturn: 0.09, maskFeather: 0.045, maxStretch: 0.75 },
  snap: { stretchWidth: 0.06, stretchStrength: 1.05, elasticReturn: 0.31, maskFeather: 0.018, maxStretch: 0.42 },
  gooey: { stretchWidth: 0.135, stretchStrength: 0.68, elasticReturn: 0.035, maskFeather: 0.055, maxStretch: 0.58 },
});

const config = { ...DEFAULT_CONFIG };
const MASK_FPS = 15;
const MASK_INTERVAL = 1000 / MASK_FPS;
const PERSON_THRESHOLD = 0.28;

const elements = {
  video: document.querySelector("#webcam"),
  glCanvas: document.querySelector("#glCanvas"),
  overlayCanvas: document.querySelector("#overlayCanvas"),
  stage: document.querySelector("#stage"),
  welcomePanel: document.querySelector("#welcomePanel"),
  startButton: document.querySelector("#startButton"),
  snapshotButton: document.querySelector("#snapshotButton"),
  resetButton: document.querySelector("#resetButton"),
  loader: document.querySelector("#loader"),
  statusText: document.querySelector("#statusText"),
  statusCluster: document.querySelector(".status-cluster"),
  message: document.querySelector("#message"),
  stretchWidth: document.querySelector("#stretchWidth"),
  stretchWidthValue: document.querySelector("#stretchWidthValue"),
  stretchStrength: document.querySelector("#stretchStrength"),
  stretchStrengthValue: document.querySelector("#stretchStrengthValue"),
  elasticReturn: document.querySelector("#elasticReturn"),
  elasticReturnValue: document.querySelector("#elasticReturnValue"),
  maskFeather: document.querySelector("#maskFeather"),
  maskFeatherValue: document.querySelector("#maskFeatherValue"),
  maxStretch: document.querySelector("#maxStretch"),
  maxStretchValue: document.querySelector("#maxStretchValue"),
  inputMode: document.querySelector("#inputMode"),
  debugMask: document.querySelector("#debugMask"),
  showGrabLine: document.querySelector("#showGrabLine"),
  presetButtons: [...document.querySelectorAll("[data-preset]")],
};

const state = {
  started: false,
  running: false,
  stream: null,
  poseLandmarker: null,
  handLandmarker: null,
  handAvailable: true,
  renderer: null,
  lastMaskTime: -Infinity,
  lastHandVideoTime: -1,
  maskPixels: null,
  maskWidth: 0,
  maskHeight: 0,
  hasMask: false,
  maskFailureCount: 0,
  grab: null,
  pointerId: null,
  pinch: { point: { x: 0.5, y: 0.5 }, active: false, previousActive: false },
};

function initUI() {
  syncControls();

  const sliders = ["stretchWidth", "stretchStrength", "elasticReturn", "maskFeather", "maxStretch"];
  for (const key of sliders) {
    elements[key].addEventListener("input", () => {
      config[key] = Number(elements[key].value);
      elements[`${key}Value`].value = formatControlValue(key, config[key]);
      clearActivePreset();
    });
  }

  elements.inputMode.addEventListener("change", () => {
    config.inputMode = elements.inputMode.value;
    if (state.grab && !inputModeAllows(state.grab.source)) releaseGrab(state.grab.source);
    if (!inputModeAllows("pinch")) {
      state.pinch.active = false;
      state.pinch.previousActive = false;
    }
  });
  elements.debugMask.addEventListener("change", () => {
    config.debugMask = elements.debugMask.checked;
  });
  elements.showGrabLine.addEventListener("change", () => {
    config.showGrabLine = elements.showGrabLine.checked;
  });

  for (const button of elements.presetButtons) {
    button.addEventListener("click", () => applyPreset(button.dataset.preset));
  }

  elements.resetButton.addEventListener("click", resetControls);
  elements.startButton.addEventListener("click", startExperience);
  elements.snapshotButton.addEventListener("click", takeSnapshot);

  elements.stage.addEventListener("pointerdown", handlePointerDown);
  elements.stage.addEventListener("pointermove", handlePointerMove);
  elements.stage.addEventListener("pointerup", handlePointerEnd);
  elements.stage.addEventListener("pointercancel", handlePointerEnd);
  elements.stage.addEventListener("lostpointercapture", handlePointerEnd);

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

function formatControlValue(key, value) {
  return key === "stretchWidth" || key === "maskFeather" ? value.toFixed(3) : value.toFixed(2);
}

function syncControls() {
  for (const key of ["stretchWidth", "stretchStrength", "elasticReturn", "maskFeather", "maxStretch"]) {
    elements[key].value = config[key];
    elements[`${key}Value`].value = formatControlValue(key, config[key]);
  }
  elements.inputMode.value = config.inputMode;
  elements.debugMask.checked = config.debugMask;
  elements.showGrabLine.checked = config.showGrabLine;
}

function resetControls() {
  Object.assign(config, DEFAULT_CONFIG);
  syncControls();
  setActivePreset("rubber");
}

function applyPreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;
  Object.assign(config, preset);
  syncControls();
  setActivePreset(name);
}

function clearActivePreset() {
  for (const button of elements.presetButtons) button.classList.remove("is-active");
}

function setActivePreset(name) {
  for (const button of elements.presetButtons) {
    button.classList.toggle("is-active", button.dataset.preset === name);
  }
}

function setStatus(label) {
  if (elements.statusText.textContent === label) return;
  elements.statusText.textContent = label;
  elements.statusCluster.classList.toggle("is-live", !["idle", "released"].includes(label));
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
  elements.loader.hidden = false;
  setStatus("loading models");

  try {
    await initMediaPipe();
    await initCamera();
    resizeCanvases(true);
    elements.stage.classList.add("is-camera");
    elements.welcomePanel.classList.add("is-hidden");
    window.setTimeout(() => { elements.welcomePanel.hidden = true; }, 280);
    elements.loader.hidden = true;
    elements.snapshotButton.disabled = false;
    state.running = true;
    setStatus("camera ready");
    requestAnimationFrame(animationLoop);

    if (!state.handAvailable) {
      showMessage("Hand pinch is unavailable, but mouse and touch dragging still work.");
      config.inputMode = "mouse";
      elements.inputMode.value = "mouse";
    }
  } catch (error) {
    console.error(error);
    elements.loader.hidden = true;
    elements.startButton.disabled = false;
    state.started = false;
    handleStartupError(error);
  }
}

async function initMediaPipe() {
  let tasks;
  try {
    tasks = await import(`${MEDIAPIPE_ROOT}/vision_bundle.mjs`);
  } catch (cause) {
    throw createAppError("MEDIAPIPE_LOAD_FAILED", "MediaPipe could not be loaded. Check your connection and reload.", cause);
  }

  const { FilesetResolver, PoseLandmarker, HandLandmarker } = tasks;
  if (!FilesetResolver || !PoseLandmarker || !HandLandmarker) {
    throw createAppError("MEDIAPIPE_LOAD_FAILED", "MediaPipe Tasks Vision is unavailable.");
  }

  const fileset = await FilesetResolver.forVisionTasks(`${MEDIAPIPE_ROOT}/wasm`);

  const poseOptions = {
    baseOptions: { modelAssetPath: POSE_MODEL_URL },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputSegmentationMasks: true,
  };

  try {
    state.poseLandmarker = await createTaskWithDelegateFallback(PoseLandmarker, fileset, poseOptions);
  } catch (cause) {
    throw createAppError("BODY_MASK_FAILED", "Body mask unavailable. Try Chrome or reload.", cause);
  }

  const handOptions = {
    baseOptions: { modelAssetPath: HAND_MODEL_URL },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };

  try {
    state.handLandmarker = await createTaskWithDelegateFallback(HandLandmarker, fileset, handOptions);
  } catch (error) {
    console.warn("Hand pinch model unavailable; continuing with mouse input.", error);
    state.handAvailable = false;
    state.handLandmarker = null;
  }
}

async function createTaskWithDelegateFallback(TaskClass, fileset, options) {
  try {
    return await TaskClass.createFromOptions(fileset, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: "GPU" },
    });
  } catch (gpuError) {
    console.warn("GPU inference unavailable; retrying on CPU.", gpuError);
    return TaskClass.createFromOptions(fileset, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: "CPU" },
    });
  }
}

async function initCamera() {
  const preferred = {
    audio: false,
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
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

function createAppError(code, message, cause = null) {
  const error = new Error(message);
  error.code = code;
  error.cause = cause;
  return error;
}

function handleStartupError(error) {
  let message = "The camera could not be started. Reload the page and try again.";
  if (error.code === "BODY_MASK_FAILED") {
    message = "Body mask unavailable. Try Chrome or reload.";
  } else if (error.code === "MEDIAPIPE_LOAD_FAILED") {
    message = error.message;
  } else if (error.name === "NotAllowedError" || error.name === "SecurityError") {
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
    if (now - state.lastMaskTime >= MASK_INTERVAL) updateBodyMask(now);
    updateHandTracking(now);
    updatePinchInteraction();
    updateGrabAnimation();
    state.renderer.render(elements.video, state.grab, config);
    renderOverlay();
  }
  requestAnimationFrame(animationLoop);
}

function updateBodyMask(now) {
  state.lastMaskTime = now;
  try {
    const result = state.poseLandmarker.detectForVideo(elements.video, now);
    const mask = result.segmentationMasks?.[0];
    if (!mask) {
      fadeExistingMask();
      return;
    }

    copySegmentationMask(mask);
    mask.close?.();
    state.maskFailureCount = 0;
    state.hasMask = true;
    state.renderer.updateBodyMask(state.maskPixels, state.maskWidth, state.maskHeight);
    if (!state.grab) setStatus("mask ready");
  } catch (error) {
    console.error("Body segmentation failed", error);
    state.maskFailureCount += 1;
    if (state.maskFailureCount === 3) {
      showMessage("Body mask unavailable. Try Chrome or reload.", "error");
      setStatus("mask unavailable");
    }
  }
}

function copySegmentationMask(mask) {
  const width = mask.width;
  const height = mask.height;
  const length = width * height;
  const sizeChanged = width !== state.maskWidth || height !== state.maskHeight || !state.maskPixels;
  if (sizeChanged) {
    state.maskPixels = new Uint8Array(length);
    state.maskWidth = width;
    state.maskHeight = height;
  }

  let source = null;
  let sourceScale = 255;
  try {
    source = mask.getAsFloat32Array();
  } catch {
    try {
      source = mask.getAsUint8Array();
      sourceScale = 1;
    } catch {
      const imageData = mask.getAsImageData();
      source = imageData.data;
      sourceScale = 1;
    }
  }

  const blendNew = sizeChanged ? 1 : 0.46;
  if (source.length === length * 4) {
    for (let index = 0; index < length; index += 1) {
      const next = source[index * 4] * sourceScale;
      state.maskPixels[index] = state.maskPixels[index] * (1 - blendNew) + next * blendNew;
    }
  } else {
    for (let index = 0; index < length; index += 1) {
      const next = clamp(source[index] * sourceScale, 0, 255);
      state.maskPixels[index] = state.maskPixels[index] * (1 - blendNew) + next * blendNew;
    }
  }
}

function fadeExistingMask() {
  if (!state.maskPixels) return;
  for (let index = 0; index < state.maskPixels.length; index += 1) {
    state.maskPixels[index] *= 0.72;
  }
  state.renderer.updateBodyMask(state.maskPixels, state.maskWidth, state.maskHeight);
}

function updateHandTracking(now) {
  if (!state.handLandmarker || !inputModeAllows("pinch")) {
    state.pinch.active = false;
    return;
  }
  if (elements.video.currentTime === state.lastHandVideoTime) return;
  state.lastHandVideoTime = elements.video.currentTime;

  try {
    const result = state.handLandmarker.detectForVideo(elements.video, now);
    const hands = result.landmarks ?? [];
    let bestPinch = null;

    for (const hand of hands) {
      const thumb = landmarkToDisplayPoint(hand[4]);
      const index = landmarkToDisplayPoint(hand[8]);
      const point = midpoint(thumb, index);
      const palmWidth = pointDistance(landmarkToDisplayPoint(hand[5]), landmarkToDisplayPoint(hand[17]));
      const threshold = clamp(palmWidth * 0.3, 0.035, 0.075);
      const distance = pointDistance(thumb, index);
      if (distance < threshold && (!bestPinch || distance < bestPinch.distance)) {
        bestPinch = { point, distance };
      }
    }

    if (bestPinch) {
      state.pinch.point = lerpPoint(state.pinch.point, bestPinch.point, config.smoothing);
      state.pinch.active = true;
    } else {
      state.pinch.active = false;
    }
  } catch (error) {
    console.error("Hand tracking failed", error);
    state.pinch.active = false;
  }
}

function updatePinchInteraction() {
  if (!inputModeAllows("pinch")) {
    state.pinch.previousActive = false;
    return;
  }

  if (state.pinch.active) {
    if (!state.pinch.previousActive && !state.grab) {
      tryBeginGrab(state.pinch.point, "pinch");
    } else if (state.grab?.source === "pinch" && state.grab.phase === "dragging") {
      state.grab.rawTarget.x = state.pinch.point.x;
      state.grab.rawTarget.y = state.pinch.point.y;
    }
  } else if (state.pinch.previousActive && state.grab?.source === "pinch") {
    releaseGrab("pinch");
  }
  state.pinch.previousActive = state.pinch.active;
}

function handlePointerDown(event) {
  if (!state.running || !inputModeAllows("pointer") || state.pointerId !== null) return;
  const point = pointerToDisplayPoint(event);
  if (!tryBeginGrab(point, "pointer")) return;
  state.pointerId = event.pointerId;
  elements.stage.setPointerCapture?.(event.pointerId);
  elements.stage.classList.add("is-grabbing");
  event.preventDefault();
}

function handlePointerMove(event) {
  if (event.pointerId !== state.pointerId || state.grab?.source !== "pointer") return;
  const point = pointerToDisplayPoint(event);
  state.grab.rawTarget.x = point.x;
  state.grab.rawTarget.y = point.y;
  event.preventDefault();
}

function handlePointerEnd(event) {
  if (event.pointerId !== state.pointerId) return;
  if (elements.stage.hasPointerCapture?.(event.pointerId)) elements.stage.releasePointerCapture(event.pointerId);
  state.pointerId = null;
  elements.stage.classList.remove("is-grabbing");
  releaseGrab("pointer");
}

function tryBeginGrab(point, source) {
  if (!state.hasMask || !state.maskPixels || state.grab) return false;
  const maskValue = samplePersonMask(point);
  if (maskValue < PERSON_THRESHOLD) {
    setStatus("outside body");
    return false;
  }

  state.renderer.captureGrabFrame(
    elements.video,
    state.maskPixels,
    state.maskWidth,
    state.maskHeight,
  );
  state.grab = {
    source,
    phase: "dragging",
    origin: { ...point },
    target: { ...point },
    rawTarget: { ...point },
    width: config.stretchWidth,
    activeAmount: 0.08,
  };
  setStatus(source === "pinch" ? "pinch grabbed" : "grabbed");
  return true;
}

function releaseGrab(source) {
  if (!state.grab || state.grab.source !== source || state.grab.phase === "returning") return;
  state.grab.phase = "returning";
  setStatus("released");
}

function updateGrabAnimation() {
  const grab = state.grab;
  if (!grab) return;

  if (grab.phase === "dragging") {
    grab.target = lerpPoint(grab.target, grab.rawTarget, config.smoothing);
    grab.activeAmount += (1 - grab.activeAmount) * Math.max(0.08, config.smoothing);
    return;
  }

  grab.target = lerpPoint(grab.target, grab.origin, config.elasticReturn);
  grab.activeAmount += (0 - grab.activeAmount) * config.elasticReturn;
  if (grab.activeAmount < 0.008 && pointDistance(grab.target, grab.origin) < 0.008) {
    state.grab = null;
    setStatus(state.hasMask ? "mask ready" : "camera ready");
  }
}

function samplePersonMask(displayPoint) {
  if (!state.maskPixels || !state.maskWidth || !state.maskHeight) return 0;
  const nativeX = clamp(1 - displayPoint.x, 0, 1);
  const nativeTopY = clamp(1 - displayPoint.y, 0, 1);
  const centerX = Math.round(nativeX * (state.maskWidth - 1));
  const centerY = Math.round(nativeTopY * (state.maskHeight - 1));
  let total = 0;
  let samples = 0;

  for (let offsetY = -2; offsetY <= 2; offsetY += 1) {
    const y = clamp(centerY + offsetY, 0, state.maskHeight - 1);
    for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
      const x = clamp(centerX + offsetX, 0, state.maskWidth - 1);
      total += state.maskPixels[y * state.maskWidth + x];
      samples += 1;
    }
  }
  return total / samples / 255;
}

function inputModeAllows(source) {
  if (source === "pointer") return config.inputMode === "mouse" || config.inputMode === "both";
  return config.inputMode === "pinch" || config.inputMode === "both";
}

function pointerToDisplayPoint(event) {
  const rect = elements.stage.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1),
  };
}

function landmarkToDisplayPoint(landmark) {
  return { x: 1 - landmark.x, y: 1 - landmark.y };
}

function midpoint(a, b) {
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
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

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
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

  const grab = state.grab;
  if (grab) {
    const origin = overlayPoint(grab.origin);
    const target = overlayPoint(grab.target);

    if (config.debugMask) {
      context.save();
      context.lineCap = "round";
      context.globalAlpha = 0.2 * grab.activeAmount;
      context.strokeStyle = "#90B5DD";
      context.lineWidth = grab.width * Math.min(canvas.width, canvas.height) * 2;
      context.beginPath();
      context.moveTo(origin.x, origin.y);
      context.lineTo(target.x, target.y);
      context.stroke();
      context.restore();
    }

    if (config.showGrabLine) {
      context.save();
      context.globalAlpha = 0.4 + grab.activeAmount * 0.5;
      context.strokeStyle = "#F7F3EA";
      context.lineWidth = Math.max(1.5, canvas.width / 520);
      context.setLineDash([7, 8]);
      context.beginPath();
      context.moveTo(origin.x, origin.y);
      context.lineTo(target.x, target.y);
      context.stroke();
      context.restore();
    }

    drawPoint(context, origin, 6, "#9F9720", "#F7F3EA");
    drawPoint(context, target, 6, "#90B5DD", "#F7F3EA");
  }

  if (config.debugMask && inputModeAllows("pinch")) {
    drawPoint(
      context,
      overlayPoint(state.pinch.point),
      state.pinch.active ? 7 : 4,
      state.pinch.active ? "#90B5DD" : "rgba(247,243,234,0.7)",
      "#263627",
    );
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
    link.download = `stretch-anything-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
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
    uniform sampler2D u_bodyMaskTexture;
    uniform sampler2D u_frozenMaskTexture;
    uniform vec2 u_origin;
    uniform vec2 u_target;
    uniform vec2 u_resolution;
    uniform float u_stretchWidth;
    uniform float u_stretchStrength;
    uniform float u_maskFeather;
    uniform float u_maxStretch;
    uniform float u_activeAmount;
    uniform float u_hasGrab;
    uniform float u_debugMask;
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

    vec2 maskUV(vec2 displayUV) {
      vec2 result = reflectedUV(displayUV);
      result.x = 1.0 - result.x;
      result.y = 1.0 - result.y;
      return result;
    }

    float currentBodyMaskAt(vec2 displayUV) {
      return texture2D(u_bodyMaskTexture, maskUV(displayUV)).r;
    }

    float frozenBodyMaskAt(vec2 displayUV) {
      return texture2D(u_frozenMaskTexture, maskUV(displayUV)).r;
    }

    void main() {
      vec4 videoColor = texture2D(u_videoTexture, cameraUV(v_uv));
      vec4 finalColor = videoColor;
      float currentBodyMask = currentBodyMaskAt(v_uv);

      if (u_hasGrab > 0.5 && u_activeAmount > 0.001) {
        float shortSide = min(u_resolution.x, u_resolution.y);
        vec2 aspectScale = u_resolution / shortSide;
        vec2 scaledAxis = (u_target - u_origin) * aspectScale;
        float rawLength = length(scaledAxis);
        vec2 direction = scaledAxis / max(rawLength, 0.0001);
        float stretchLength = min(rawLength * u_stretchStrength, u_maxStretch);
        vec2 stretchedAxis = direction * stretchLength * u_activeAmount;
        vec2 destinationEnd = u_origin + stretchedAxis / aspectScale;

        vec2 scaledDestinationAxis = (destinationEnd - u_origin) * aspectScale;
        vec2 scaledFromOrigin = (v_uv - u_origin) * aspectScale;
        float denominator = max(dot(scaledDestinationAxis, scaledDestinationAxis), 0.000001);
        float t = clamp(dot(scaledFromOrigin, scaledDestinationAxis) / denominator, 0.0, 1.0);
        vec2 closest = mix(u_origin, destinationEnd, t);
        vec2 lateral = v_uv - closest;
        float lateralDistance = length(lateral * aspectScale);

        float taperedWidth = u_stretchWidth * mix(1.12, 0.58, smoothstep(0.0, 1.0, t));
        float stripMask = 1.0 - smoothstep(
          taperedWidth,
          taperedWidth + max(u_maskFeather, 0.001),
          lateralDistance
        );

        float sourceTravel = min(stretchLength * 0.1, u_stretchWidth * 0.45);
        vec2 compressedSourceAxis = (direction * sourceTravel) / aspectScale;
        vec2 sourceUV = u_origin + lateral + compressedSourceAxis * t;
        float sourcePersonMask = frozenBodyMaskAt(sourceUV);
        float personAlpha = smoothstep(0.12, 0.68, sourcePersonMask);
        vec4 stretchedColor = texture2D(u_sourceTexture, cameraUV(sourceUV));
        float patchAlpha = stripMask * personAlpha * u_activeAmount;
        finalColor = mix(videoColor, stretchedColor, patchAlpha);
      }

      if (u_debugMask > 0.5) {
        vec3 maskTint = mix(vec3(0.564, 0.71, 0.867), vec3(0.718, 0.667, 0.796), currentBodyMask);
        finalColor.rgb = mix(finalColor.rgb, maskTint, currentBodyMask * 0.34);
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
    "u_videoTexture", "u_sourceTexture", "u_bodyMaskTexture", "u_frozenMaskTexture",
    "u_origin", "u_target", "u_resolution", "u_stretchWidth", "u_stretchStrength",
    "u_maskFeather", "u_maxStretch", "u_activeAmount", "u_hasGrab", "u_debugMask",
  ]) {
    uniforms[name] = gl.getUniformLocation(program, name);
  }

  const videoTexture = createTexture(gl, new Uint8Array([0, 0, 0, 255]), gl.RGBA);
  const sourceTexture = createTexture(gl, new Uint8Array([0, 0, 0, 255]), gl.RGBA);
  const bodyMaskTexture = createTexture(gl, new Uint8Array([0]), gl.LUMINANCE);
  const frozenMaskTexture = createTexture(gl, new Uint8Array([0]), gl.LUMINANCE);

  function updateBodyMask(pixels, width, height) {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.bindTexture(gl.TEXTURE_2D, bodyMaskTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width, height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, pixels);
  }

  function captureGrabFrame(video, maskPixels, maskWidth, maskHeight) {
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.bindTexture(gl.TEXTURE_2D, frozenMaskTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.LUMINANCE,
      maskWidth,
      maskHeight,
      0,
      gl.LUMINANCE,
      gl.UNSIGNED_BYTE,
      maskPixels,
    );
  }

  function render(video, grab, currentConfig) {
    gl.useProgram(program);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, videoTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, bodyMaskTexture);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, frozenMaskTexture);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const origin = grab?.origin ?? { x: 0.5, y: 0.5 };
    const target = grab?.target ?? origin;
    gl.uniform1i(uniforms.u_videoTexture, 0);
    gl.uniform1i(uniforms.u_sourceTexture, 1);
    gl.uniform1i(uniforms.u_bodyMaskTexture, 2);
    gl.uniform1i(uniforms.u_frozenMaskTexture, 3);
    gl.uniform2f(uniforms.u_origin, origin.x, origin.y);
    gl.uniform2f(uniforms.u_target, target.x, target.y);
    gl.uniform2f(uniforms.u_resolution, canvas.width, canvas.height);
    gl.uniform1f(uniforms.u_stretchWidth, grab?.width ?? currentConfig.stretchWidth);
    gl.uniform1f(uniforms.u_stretchStrength, currentConfig.stretchStrength);
    gl.uniform1f(uniforms.u_maskFeather, currentConfig.maskFeather);
    gl.uniform1f(uniforms.u_maxStretch, currentConfig.maxStretch);
    gl.uniform1f(uniforms.u_activeAmount, grab?.activeAmount ?? 0);
    gl.uniform1f(uniforms.u_hasGrab, grab ? 1 : 0);
    gl.uniform1f(uniforms.u_debugMask, currentConfig.debugMask ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  return {
    resize(width, height) { gl.viewport(0, 0, width, height); },
    updateBodyMask,
    captureGrabFrame,
    render,
  };
}

function createTexture(gl, initialPixels, format) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, format, 1, 1, 0, format, gl.UNSIGNED_BYTE, initialPixels);
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
  state.poseLandmarker?.close();
  state.handLandmarker?.close();
});

initUI();
