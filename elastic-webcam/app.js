const MEDIAPIPE_VERSION = "0.10.22-rc.20250304";
const MEDIAPIPE_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;
const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;
const LETTER_CATEGORY = 0x0001;
const BODY_CATEGORY = 0x0002;

const config = {
  letterSize: 82,
  gravity: 0.55,
  bounce: 0.72,
  contactForce: 1.15,
  showGuides: false,
  freezeVideo: false,
  poseSmoothing: 0.38,
};

const elements = {
  video: document.querySelector("#webcam"),
  canvas: document.querySelector("#playgroundCanvas"),
  stage: document.querySelector("#stage"),
  welcomePanel: document.querySelector("#welcomePanel"),
  startButton: document.querySelector("#startButton"),
  spawnButton: document.querySelector("#spawnButton"),
  clearButton: document.querySelector("#clearButton"),
  snapshotButton: document.querySelector("#snapshotButton"),
  typeInput: document.querySelector("#typeInput"),
  statusText: document.querySelector("#statusText"),
  statusCluster: document.querySelector(".status-cluster"),
  message: document.querySelector("#message"),
  letterSize: document.querySelector("#letterSize"),
  letterSizeValue: document.querySelector("#letterSizeValue"),
  gravity: document.querySelector("#gravity"),
  gravityValue: document.querySelector("#gravityValue"),
  bounce: document.querySelector("#bounce"),
  bounceValue: document.querySelector("#bounceValue"),
  contactForce: document.querySelector("#contactForce"),
  contactForceValue: document.querySelector("#contactForceValue"),
  showGuides: document.querySelector("#showGuides"),
  freezeVideo: document.querySelector("#freezeVideo"),
  presetButtons: [...document.querySelectorAll("[data-word]")],
};

const context = elements.canvas.getContext("2d");
const freezeCanvas = document.createElement("canvas");
freezeCanvas.width = CANVAS_WIDTH;
freezeCanvas.height = CANVAS_HEIGHT;
const freezeContext = freezeCanvas.getContext("2d");

const state = {
  cameraStarted: false,
  stream: null,
  poseLandmarker: null,
  trackingReady: false,
  trackingFailed: false,
  lastPoseVideoTime: -1,
  missingPoseFrames: 0,
  hadBody: false,
  smoothedPose: null,
  engine: null,
  world: null,
  physicsReady: false,
  walls: [],
  letters: [],
  letterByBodyId: new Map(),
  bodyColliders: [],
  colliderMap: new Map(),
  currentText: "TOUCH",
  hasFrozenFrame: false,
  lastFrameTime: performance.now(),
};

function initUI() {
  elements.canvas.width = CANVAS_WIDTH;
  elements.canvas.height = CANVAS_HEIGHT;
  elements.typeInput.value = state.currentText;
  syncControls();

  elements.startButton.addEventListener("click", startExperience);
  elements.spawnButton.addEventListener("click", () => spawnLetters(elements.typeInput.value));
  elements.clearButton.addEventListener("click", clearLetters);
  elements.snapshotButton.addEventListener("click", takeSnapshot);
  elements.typeInput.addEventListener("input", () => {
    const cleaned = cleanText(elements.typeInput.value);
    if (cleaned !== elements.typeInput.value) elements.typeInput.value = cleaned;
  });
  elements.typeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") spawnLetters(elements.typeInput.value);
  });

  for (const button of elements.presetButtons) {
    button.addEventListener("click", () => {
      elements.typeInput.value = button.dataset.word;
      spawnLetters(button.dataset.word);
    });
  }

  elements.letterSize.addEventListener("input", () => {
    config.letterSize = Number(elements.letterSize.value);
    elements.letterSizeValue.value = String(config.letterSize);
  });
  elements.letterSize.addEventListener("change", () => spawnLetters(state.currentText));
  elements.gravity.addEventListener("input", () => {
    config.gravity = Number(elements.gravity.value);
    elements.gravityValue.value = config.gravity.toFixed(2);
    if (state.engine) state.engine.gravity.y = config.gravity;
  });
  elements.bounce.addEventListener("input", () => {
    config.bounce = Number(elements.bounce.value);
    elements.bounceValue.value = config.bounce.toFixed(2);
    for (const letter of state.letters) letter.body.restitution = config.bounce;
  });
  elements.contactForce.addEventListener("input", () => {
    config.contactForce = Number(elements.contactForce.value);
    elements.contactForceValue.value = config.contactForce.toFixed(2);
  });
  elements.showGuides.addEventListener("change", () => {
    config.showGuides = elements.showGuides.checked;
  });
  elements.freezeVideo.addEventListener("change", () => {
    config.freezeVideo = elements.freezeVideo.checked;
    if (config.freezeVideo && state.cameraStarted) captureFrozenVideo();
  });

  if (!isSecureCameraContext()) showMessage("Camera access requires HTTPS or localhost.");
  if (!navigator.mediaDevices?.getUserMedia) {
    showMessage("This browser does not support webcam access. Try the latest desktop version of Chrome.", "error");
    elements.startButton.disabled = true;
  }

  initPhysics();
  spawnLetters(state.currentText);
  requestAnimationFrame(animationLoop);
}

function syncControls() {
  elements.letterSize.value = config.letterSize;
  elements.letterSizeValue.value = String(config.letterSize);
  elements.gravity.value = config.gravity;
  elements.gravityValue.value = config.gravity.toFixed(2);
  elements.bounce.value = config.bounce;
  elements.bounceValue.value = config.bounce.toFixed(2);
  elements.contactForce.value = config.contactForce;
  elements.contactForceValue.value = config.contactForce.toFixed(2);
  elements.showGuides.checked = config.showGuides;
  elements.freezeVideo.checked = config.freezeVideo;
}

function cleanText(value) {
  return value.toUpperCase().replace(/[^A-Z0-9 À-ÖØ-Ý!?&]/g, "").slice(0, 24);
}

function initPhysics() {
  if (!window.Matter) {
    showMessage("Physics unavailable. Reload the page.", "error");
    return;
  }

  const { Engine, Events } = window.Matter;
  state.engine = Engine.create({ enableSleeping: true });
  state.world = state.engine.world;
  state.engine.gravity.y = config.gravity;
  state.engine.gravity.scale = 0.001;
  state.physicsReady = true;
  createWalls();
  createBodyColliders();

  Events.on(state.engine, "collisionStart", handleMatterContacts);
  Events.on(state.engine, "collisionActive", handleMatterContacts);
}

function createWalls() {
  const { Bodies, Composite } = window.Matter;
  for (const wall of state.walls) Composite.remove(state.world, wall);
  const thickness = 90;
  state.walls = [
    Bodies.rectangle(CANVAS_WIDTH / 2, CANVAS_HEIGHT + thickness / 2 - 4, CANVAS_WIDTH + thickness * 2, thickness, { isStatic: true, label: "wall" }),
    Bodies.rectangle(CANVAS_WIDTH / 2, -thickness / 2 + 4, CANVAS_WIDTH + thickness * 2, thickness, { isStatic: true, label: "wall" }),
    Bodies.rectangle(-thickness / 2 + 4, CANVAS_HEIGHT / 2, thickness, CANVAS_HEIGHT + thickness * 2, { isStatic: true, label: "wall" }),
    Bodies.rectangle(CANVAS_WIDTH + thickness / 2 - 4, CANVAS_HEIGHT / 2, thickness, CANVAS_HEIGHT + thickness * 2, { isStatic: true, label: "wall" }),
  ];
  Composite.add(state.world, state.walls);
}

function createBodyColliders() {
  createCollider("head", "head", 58);
  createCollider("left-hand", "hand", 34);
  createCollider("right-hand", "hand", 34);
  for (const side of ["left", "right"]) {
    for (let index = 0; index < 5; index += 1) createCollider(`${side}-forearm-${index}`, "forearm", 21);
    for (let index = 0; index < 4; index += 1) createCollider(`${side}-upperarm-${index}`, "upperarm", 23);
  }
}

function createCollider(key, kind, radius) {
  const { Bodies, Composite } = window.Matter;
  const body = Bodies.circle(-250, -250, radius, {
    isStatic: true,
    label: `bodyCollider:${kind}`,
    collisionFilter: { category: BODY_CATEGORY, mask: LETTER_CATEGORY },
  });
  const collider = {
    key,
    kind,
    body,
    radius,
    active: false,
    velocity: { x: 0, y: 0 },
  };
  state.bodyColliders.push(collider);
  state.colliderMap.set(key, collider);
  Composite.add(state.world, body);
}

function handleMatterContacts(event) {
  for (const pair of event.pairs) {
    pulseContactPair(pair.bodyA, pair.bodyB);
    pulseContactPair(pair.bodyB, pair.bodyA);
  }
}

function pulseContactPair(letterBody, otherBody) {
  if (letterBody.label !== "letter" || !otherBody.label.startsWith("bodyCollider:")) return;
  const letter = state.letterByBodyId.get(letterBody.id);
  if (letter) {
    letter.contactPulse = 1;
    letter.lastContactTime = performance.now();
  }
}

async function startExperience() {
  if (state.cameraStarted) return;
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
    setStatus("tracking lost");
    showMessage("Body tracking unavailable. The camera and letter physics will keep running.", "error");
  }, 8000);

  try {
    const poseLandmarker = await createPoseLandmarker();
    if (settled) {
      poseLandmarker.close();
      return;
    }
    settled = true;
    window.clearTimeout(timeoutId);
    state.poseLandmarker = poseLandmarker;
    state.trackingReady = true;
    setStatus("show yourself");
  } catch (error) {
    console.error(error);
    if (settled) return;
    settled = true;
    window.clearTimeout(timeoutId);
    state.trackingFailed = true;
    setStatus("tracking lost");
    showMessage("Body tracking unavailable. The camera and letter physics will keep running.", "error");
  }
}

async function createPoseLandmarker() {
  const tasks = await import(`${MEDIAPIPE_ROOT}/vision_bundle.mjs`);
  const { FilesetResolver, PoseLandmarker } = tasks;
  if (!FilesetResolver || !PoseLandmarker) throw new Error("MediaPipe Pose Landmarker is unavailable");
  const fileset = await FilesetResolver.forVisionTasks(`${MEDIAPIPE_ROOT}/wasm`);
  const options = {
    baseOptions: { modelAssetPath: POSE_MODEL_URL },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputSegmentationMasks: false,
  };

  try {
    return await PoseLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: "GPU" },
    });
  } catch (gpuError) {
    console.warn("GPU tracking unavailable; retrying on CPU.", gpuError);
    return PoseLandmarker.createFromOptions(fileset, {
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
  const delta = Math.min(33.33, Math.max(8, now - state.lastFrameTime));
  state.lastFrameTime = now;

  if (
    state.cameraStarted &&
    state.trackingReady &&
    elements.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    elements.video.currentTime !== state.lastPoseVideoTime
  ) {
    state.lastPoseVideoTime = elements.video.currentTime;
    updatePoseTracking(now);
  }

  if (state.physicsReady) {
    applyManualBodyForces();
    window.Matter.Engine.update(state.engine, delta);
  }
  decayColliderVelocity();
  renderPlayground(delta);
  requestAnimationFrame(animationLoop);
}

function updatePoseTracking(now) {
  let result;
  try {
    result = state.poseLandmarker.detectForVideo(elements.video, now);
  } catch (error) {
    console.error("Pose tracking failed", error);
    handleMissingPose();
    return;
  }

  const landmarks = result.landmarks?.[0];
  if (!landmarks) {
    handleMissingPose();
    return;
  }

  const mapped = landmarks.map((landmark) => mapPoseLandmark(landmark));
  if (!state.smoothedPose) {
    state.smoothedPose = mapped;
  } else {
    for (let index = 0; index < mapped.length; index += 1) {
      const next = mapped[index];
      const previous = state.smoothedPose[index];
      if (next.valid && previous?.valid) {
        state.smoothedPose[index] = {
          x: previous.x + (next.x - previous.x) * config.poseSmoothing,
          y: previous.y + (next.y - previous.y) * config.poseSmoothing,
          valid: true,
        };
      } else {
        state.smoothedPose[index] = next;
      }
    }
  }

  state.missingPoseFrames = 0;
  state.hadBody = true;
  updateBodyColliders(state.smoothedPose);
  setStatus("tracking body");
}

function handleMissingPose() {
  state.missingPoseFrames += 1;
  if (state.missingPoseFrames <= 8) return;
  deactivateAllColliders();
  setStatus(state.hadBody ? "tracking lost" : "show yourself");
}

function mapPoseLandmark(landmark) {
  const transform = getVideoCoverTransform();
  const nativeX = transform.offsetX + landmark.x * transform.drawWidth;
  const y = transform.offsetY + landmark.y * transform.drawHeight;
  return {
    x: CANVAS_WIDTH - nativeX,
    y,
    valid: (landmark.visibility ?? 1) > 0.3,
  };
}

function updateBodyColliders(pose) {
  const leftShoulder = pose[11];
  const rightShoulder = pose[12];
  const leftElbow = pose[13];
  const rightElbow = pose[14];
  const leftWrist = pose[15];
  const rightWrist = pose[16];
  const shoulderWidth = pointsValid(leftShoulder, rightShoulder)
    ? distance(leftShoulder, rightShoulder)
    : 260;

  const headPoints = [pose[0], pose[2], pose[5], pose[7], pose[8]].filter((point) => point?.valid);
  if (headPoints.length >= 3) {
    const headCenter = averagePoints(headPoints);
    const earWidth = pointsValid(pose[7], pose[8]) ? distance(pose[7], pose[8]) : shoulderWidth * 0.34;
    updateCollider("head", headCenter, clamp(earWidth * 0.58, 36, 72));
  } else {
    deactivateCollider("head");
  }

  updateHandCollider("left-hand", leftWrist, shoulderWidth);
  updateHandCollider("right-hand", rightWrist, shoulderWidth);
  updateSegmentGroup("left-forearm", leftElbow, leftWrist, 5, clamp(shoulderWidth * 0.062, 16, 27));
  updateSegmentGroup("right-forearm", rightElbow, rightWrist, 5, clamp(shoulderWidth * 0.062, 16, 27));
  updateSegmentGroup("left-upperarm", leftShoulder, leftElbow, 4, clamp(shoulderWidth * 0.07, 18, 30));
  updateSegmentGroup("right-upperarm", rightShoulder, rightElbow, 4, clamp(shoulderWidth * 0.07, 18, 30));
}

function updateHandCollider(key, wrist, shoulderWidth) {
  if (wrist?.valid) updateCollider(key, wrist, clamp(shoulderWidth * 0.1, 25, 46));
  else deactivateCollider(key);
}

function updateSegmentGroup(prefix, start, end, count, radius) {
  if (!pointsValid(start, end)) {
    for (let index = 0; index < count; index += 1) deactivateCollider(`${prefix}-${index}`);
    return;
  }
  for (let index = 0; index < count; index += 1) {
    const t = count === 1 ? 0.5 : index / (count - 1);
    updateCollider(`${prefix}-${index}`, {
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
    }, radius);
  }
}

function updateCollider(key, target, radius) {
  const collider = state.colliderMap.get(key);
  if (!collider) return;
  const previous = collider.body.position;
  collider.velocity.x = target.x - previous.x;
  collider.velocity.y = target.y - previous.y;
  collider.active = true;

  if (Math.abs(radius - collider.radius) > 1) {
    const scale = radius / collider.radius;
    window.Matter.Body.scale(collider.body, scale, scale);
    collider.radius = radius;
  }
  window.Matter.Body.setPosition(collider.body, target);
}

function deactivateCollider(key) {
  const collider = state.colliderMap.get(key);
  if (!collider || !collider.active) return;
  collider.active = false;
  collider.velocity.x = 0;
  collider.velocity.y = 0;
  window.Matter.Body.setPosition(collider.body, { x: -250, y: -250 });
}

function deactivateAllColliders() {
  for (const collider of state.bodyColliders) deactivateCollider(collider.key);
}

function applyManualBodyForces() {
  const { Body } = window.Matter;
  for (const collider of state.bodyColliders) {
    if (!collider.active) continue;
    const speed = Math.hypot(collider.velocity.x, collider.velocity.y);

    for (const letter of state.letters) {
      const offsetX = letter.body.position.x - collider.body.position.x;
      const offsetY = letter.body.position.y - collider.body.position.y;
      const centerDistance = Math.max(Math.hypot(offsetX, offsetY), 0.001);
      const interactionDistance = collider.radius + letter.collisionRadius + 24;
      if (centerDistance >= interactionDistance) continue;

      const proximity = 1 - centerDistance / interactionDistance;
      const outwardX = offsetX / centerDistance;
      const outwardY = offsetY / centerDistance;
      const outwardForce = 0.00022 * config.contactForce * proximity;
      let forceX = outwardX * outwardForce;
      let forceY = outwardY * outwardForce;

      if (speed > 0.2) {
        const movementForce = Math.min(0.007, speed * 0.00015 * config.contactForce * proximity);
        forceX += collider.velocity.x / speed * movementForce;
        forceY += collider.velocity.y / speed * movementForce;
      }

      Body.applyForce(letter.body, letter.body.position, { x: forceX, y: forceY });
      letter.contactPulse = Math.max(letter.contactPulse, clamp(proximity * 1.3, 0, 1));
      letter.lastContactTime = performance.now();
    }
  }
}

function decayColliderVelocity() {
  for (const collider of state.bodyColliders) {
    collider.velocity.x *= 0.68;
    collider.velocity.y *= 0.68;
  }
}

function spawnLetters(value) {
  if (!state.physicsReady) return;
  const text = cleanText(value).trim() || "BODY";
  state.currentText = text;
  elements.typeInput.value = text;
  clearLetters();

  context.save();
  context.font = `900 ${config.letterSize}px Arial Black, Helvetica Neue, Arial, sans-serif`;
  const lines = buildTextLines(text, context, CANVAS_WIDTH * 0.78, config.letterSize);
  context.restore();

  const lineHeight = config.letterSize * 1.04;
  const startY = Math.max(72, 112 - (lines.length - 1) * lineHeight * 0.35);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    let x = (CANVAS_WIDTH - line.width) / 2;
    const y = startY + lineIndex * lineHeight;

    for (const item of line.items) {
      if (item.character === " ") {
        x += item.width;
        continue;
      }
      createLetter(item.character, x + item.width / 2, y, item.width, config.letterSize);
      x += item.width;
    }
  }
}

function buildTextLines(text, drawingContext, maxWidth, fontSize) {
  const lines = [];
  let current = { items: [], width: 0 };
  for (const character of Array.from(text)) {
    const width = character === " "
      ? fontSize * 0.34
      : Math.max(fontSize * 0.36, drawingContext.measureText(character).width + fontSize * 0.06);
    if (current.items.length && current.width + width > maxWidth) {
      lines.push(current);
      current = { items: [], width: 0 };
    }
    current.items.push({ character, width });
    current.width += width;
  }
  if (current.items.length) lines.push(current);
  return lines.slice(0, 4);
}

function createLetter(character, x, y, visualWidth, fontSize) {
  const { Bodies, Body, Composite } = window.Matter;
  const bodyWidth = Math.max(fontSize * 0.34, visualWidth * 0.84);
  const bodyHeight = fontSize * 0.78;
  const body = Bodies.rectangle(x, y, bodyWidth, bodyHeight, {
    label: "letter",
    restitution: config.bounce,
    friction: 0.18,
    frictionStatic: 0.2,
    frictionAir: 0.012,
    density: 0.0016,
    chamfer: { radius: Math.min(8, bodyHeight * 0.1) },
    collisionFilter: { category: LETTER_CATEGORY, mask: LETTER_CATEGORY | BODY_CATEGORY },
  });
  Body.setAngle(body, (Math.random() - 0.5) * 0.12);
  const letter = {
    character,
    body,
    fontSize,
    contactPulse: 0,
    lastContactTime: 0,
    collisionRadius: Math.hypot(bodyWidth, bodyHeight) * 0.45,
  };
  state.letters.push(letter);
  state.letterByBodyId.set(body.id, letter);
  Composite.add(state.world, body);
}

function clearLetters() {
  if (!state.physicsReady) return;
  const { Composite } = window.Matter;
  for (const letter of state.letters) Composite.remove(state.world, letter.body);
  state.letters.length = 0;
  state.letterByBodyId.clear();
}

function renderPlayground(delta) {
  drawBackgroundVideo(context);
  context.fillStyle = "rgba(247, 243, 234, 0.07)";
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const pulseDecay = Math.pow(0.88, delta / 16.667);
  for (const letter of state.letters) {
    letter.contactPulse *= pulseDecay;
    drawLetter(letter);
  }

  if (config.showGuides) drawBodyGuides();
}

function drawBackgroundVideo(drawingContext) {
  if (!state.cameraStarted || elements.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    const gradient = drawingContext.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    gradient.addColorStop(0, "#B7AACB");
    gradient.addColorStop(1, "#90B5DD");
    drawingContext.fillStyle = gradient;
    drawingContext.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    return;
  }

  if (config.freezeVideo && state.hasFrozenFrame) {
    drawingContext.drawImage(freezeCanvas, 0, 0);
    return;
  }

  const transform = getVideoCoverTransform();
  drawingContext.save();
  drawingContext.translate(CANVAS_WIDTH, 0);
  drawingContext.scale(-1, 1);
  drawingContext.drawImage(
    elements.video,
    transform.offsetX,
    transform.offsetY,
    transform.drawWidth,
    transform.drawHeight,
  );
  drawingContext.restore();
}

function captureFrozenVideo() {
  if (!state.cameraStarted || elements.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
  const transform = getVideoCoverTransform();
  freezeContext.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  freezeContext.save();
  freezeContext.translate(CANVAS_WIDTH, 0);
  freezeContext.scale(-1, 1);
  freezeContext.drawImage(
    elements.video,
    transform.offsetX,
    transform.offsetY,
    transform.drawWidth,
    transform.drawHeight,
  );
  freezeContext.restore();
  state.hasFrozenFrame = true;
}

function getVideoCoverTransform() {
  const videoWidth = elements.video.videoWidth || CANVAS_WIDTH;
  const videoHeight = elements.video.videoHeight || CANVAS_HEIGHT;
  const scale = Math.max(CANVAS_WIDTH / videoWidth, CANVAS_HEIGHT / videoHeight);
  const drawWidth = videoWidth * scale;
  const drawHeight = videoHeight * scale;
  return {
    drawWidth,
    drawHeight,
    offsetX: (CANVAS_WIDTH - drawWidth) / 2,
    offsetY: (CANVAS_HEIGHT - drawHeight) / 2,
  };
}

function drawLetter(letter) {
  const pulse = clamp(letter.contactPulse, 0, 1);
  const body = letter.body;
  const scale = 1 + pulse * 0.08;
  const color = mixColor([17, 17, 17], [247, 243, 234], pulse);

  context.save();
  context.translate(body.position.x, body.position.y);
  context.rotate(body.angle);
  context.scale(scale, scale);
  context.font = `900 ${letter.fontSize}px Arial Black, Helvetica Neue, Arial, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = color;
  context.shadowColor = `rgba(247, 243, 234, ${pulse * 0.92})`;
  context.shadowBlur = pulse * 22;
  context.fillText(letter.character, 0, letter.fontSize * 0.035);
  context.restore();
}

function drawBodyGuides() {
  for (const collider of state.bodyColliders) {
    if (!collider.active) continue;
    const color = collider.kind === "head"
      ? "183, 170, 203"
      : collider.kind === "hand"
        ? "159, 151, 32"
        : "144, 181, 221";
    context.beginPath();
    context.arc(collider.body.position.x, collider.body.position.y, collider.radius, 0, Math.PI * 2);
    context.fillStyle = `rgba(${color}, 0.11)`;
    context.fill();
    context.strokeStyle = `rgba(${color}, 0.62)`;
    context.lineWidth = 1.5;
    context.stroke();
  }
}

function mixColor(from, to, amount) {
  const red = Math.round(from[0] + (to[0] - from[0]) * amount);
  const green = Math.round(from[1] + (to[1] - from[1]) * amount);
  const blue = Math.round(from[2] + (to[2] - from[2]) * amount);
  return `rgb(${red}, ${green}, ${blue})`;
}

function pointsValid(...points) {
  return points.every((point) => point?.valid);
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

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function setStatus(label) {
  if (elements.statusText.textContent === label) return;
  elements.statusText.textContent = label;
  elements.statusCluster.classList.toggle(
    "is-live",
    !["idle", "tracking lost"].includes(label),
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

function takeSnapshot() {
  elements.canvas.toBlob((blob) => {
    if (!blob) return;
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `body-type-playground-${Date.now()}.png`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

window.addEventListener("pagehide", () => {
  state.stream?.getTracks().forEach((track) => track.stop());
  state.poseLandmarker?.close();
});

initUI();
