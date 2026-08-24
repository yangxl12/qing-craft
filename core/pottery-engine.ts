import { clayColor, glazeColor, PotteryWork } from "./model";
import { buildPotteryMesh } from "./pottery-mesh";
import {
  advancePotteryTurntable,
  calculatePotteryOrbitDelta,
  calculatePotteryCameraDistance,
  calculatePotteryFocusY,
  calculatePotteryZoomFactor,
  defaultPotteryPitch,
  normalizePotteryYaw,
  POTTERY_BASE_SCREEN_Y,
  POTTERY_MAX_PITCH,
  POTTERY_MIN_PITCH,
  POTTERY_VERTICAL_FOV
} from "./pottery-scene";

type GL = any;

interface LightingPreset {
  keyDirection: number[];
  fillDirection: number[];
  keyColor: number[];
  fillColor: number[];
}

const LIGHTING: Record<string, LightingPreset> = {
  workshop: {
    keyDirection: [-0.58, 0.8, 0.46],
    fillDirection: [0.58, 0.24, 0.78],
    keyColor: [1, 0.92, 0.79],
    fillColor: [0.43, 0.57, 0.69]
  },
  museum: {
    keyDirection: [-0.34, 0.91, 0.24],
    fillDirection: [0.5, 0.2, 0.84],
    keyColor: [1, 0.95, 0.86],
    fillColor: [0.32, 0.42, 0.5]
  },
  window: {
    keyDirection: [-0.76, 0.62, 0.2],
    fillDirection: [0.64, 0.28, 0.7],
    keyColor: [1, 0.98, 0.9],
    fillColor: [0.49, 0.63, 0.72]
  }
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hexRgb(hex: string): number[] {
  const clean = hex.replace("#", "");
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255
  ];
}

function normalize(x: number, y: number, z: number): number[] {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function perspective(fov: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (far + near) * nf,
    -1,
    0,
    0,
    2 * far * near * nf,
    0
  ]);
}

function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      out[column * 4 + row] =
        a[row] * b[column * 4] +
        a[4 + row] * b[column * 4 + 1] +
        a[8 + row] * b[column * 4 + 2] +
        a[12 + row] * b[column * 4 + 3];
    }
  }
  return out;
}

function lookAt(eye: number[], center: number[], up: number[]): Float32Array {
  const z = normalize(eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]);
  const x = normalize(
    up[1] * z[2] - up[2] * z[1],
    up[2] * z[0] - up[0] * z[2],
    up[0] * z[1] - up[1] * z[0]
  );
  const y = [
    z[1] * x[2] - z[2] * x[1],
    z[2] * x[0] - z[0] * x[2],
    z[0] * x[1] - z[1] * x[0]
  ];
  return new Float32Array([
    x[0],
    y[0],
    z[0],
    0,
    x[1],
    y[1],
    z[1],
    0,
    x[2],
    y[2],
    z[2],
    0,
    -x[0] * eye[0] - x[1] * eye[1] - x[2] * eye[2],
    -y[0] * eye[0] - y[1] * eye[1] - y[2] * eye[2],
    -z[0] * eye[0] - z[1] * eye[1] - z[2] * eye[2],
    1
  ]);
}

function rotateY(angle: number): Float32Array {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return new Float32Array([
    cosine,
    0,
    -sine,
    0,
    0,
    1,
    0,
    0,
    sine,
    0,
    cosine,
    0,
    0,
    0,
    0,
    1
  ]);
}

const VS = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute float aCavity;
uniform mat4 uViewProjection;
uniform mat4 uModel;
uniform float uHeight;
varying vec3 vNormal;
varying vec3 vPos;
varying float vY;
varying float vCavity;
void main(){
  vec4 world = uModel * vec4(aPosition, 1.0);
  vPos = world.xyz;
  vNormal = mat3(uModel) * aNormal;
  vY = clamp(aPosition.y / uHeight + 0.5, 0.0, 1.0);
  vCavity = aCavity;
  gl_Position = uViewProjection * world;
}
`;

const FS = `
precision mediump float;
varying vec3 vNormal;
varying vec3 vPos;
varying float vY;
varying float vCavity;
uniform vec3 uBase;
uniform vec3 uGlaze;
uniform vec3 uAccent;
uniform vec3 uCamera;
uniform vec3 uKeyDirection;
uniform vec3 uFillDirection;
uniform vec3 uKeyColor;
uniform vec3 uFillColor;
uniform float uGlazeMix;
uniform float uPattern;
uniform float uMethod;
void main(){
  vec3 normal = normalize(vNormal);
  vec3 viewDirection = normalize(uCamera - vPos);
  vec3 keyDirection = normalize(uKeyDirection);
  vec3 fillDirection = normalize(uFillDirection);
  float key = max(dot(normal, keyDirection), 0.0);
  float fill = max(dot(normal, fillDirection), 0.0);

  float angle = atan(vPos.z, vPos.x);
  float glazeMask = 1.0;
  if (uMethod == 1.0) glazeMask = smoothstep(0.48, 0.52, vY);
  else if (uMethod == 2.0) glazeMask = 0.78 + 0.14 * sin(vY * 31.0 + angle * 2.0);
  else if (uMethod == 3.0) glazeMask = smoothstep(-0.1, 0.22, sin(angle * 3.0 + vY * 13.0));
  float surfaceGlaze = clamp(uGlazeMix * glazeMask, 0.0, 1.0);

  vec3 material = mix(uBase, uGlaze, surfaceGlaze);
  float mark = 0.0;
  if (uPattern == 1.0) mark = smoothstep(0.88, 1.0, sin(vY * 72.0));
  if (uPattern == 2.0) mark = smoothstep(0.83, 1.0, sin(angle * 8.0 + vY * 18.0));
  if (uPattern == 3.0) mark = smoothstep(0.76, 1.0, cos(angle * 12.0) * cos((vY - 0.55) * 24.0));
  if (uPattern == 4.0) mark = smoothstep(0.82, 1.0, sin(angle * 4.0 - vY * 22.0));
  material = mix(material, uAccent, mark * 0.82);

  // Very low-amplitude wheel rings keep the clay tactile without looking noisy.
  float throwingRing = sin(vY * 156.0 + sin(angle * 3.0) * 0.8);
  material *= 1.0 + throwingRing * mix(0.006, 0.0025, surfaceGlaze);

  vec3 halfVector = normalize(keyDirection + viewDirection);
  float specularPower = mix(18.0, 72.0, surfaceGlaze);
  float specular = pow(max(dot(normal, halfVector), 0.0), specularPower);
  specular *= mix(0.025, 0.28, surfaceGlaze);
  float facing = max(dot(normal, viewDirection), 0.0);
  float fresnel = pow(1.0 - facing, 3.0) * mix(0.018, 0.065, surfaceGlaze);

  vec3 linearMaterial = pow(max(material, vec3(0.0)), vec3(2.2));
  vec3 diffuseLight = vec3(0.25, 0.26, 0.26) + uKeyColor * key * 0.68 + uFillColor * fill * 0.2;
  float baseOcclusion = mix(0.84, 1.0, smoothstep(0.0, 0.16, vY));
  float cavityOcclusion = mix(1.0, 0.6, vCavity);
  vec3 linearColor = linearMaterial * diffuseLight * baseOcclusion * cavityOcclusion;
  linearColor += (uKeyColor * specular + uFillColor * fresnel) * mix(1.0, 0.58, vCavity);
  gl_FragColor = vec4(pow(clamp(linearColor, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}
`;

export class PotteryEngine {
  private canvas: any;
  private gl: GL;
  private program: any;
  private vbo: any;
  private nbo: any;
  private cbo: any;
  private ibo: any;
  private count = 0;
  private work: PotteryWork;
  private viewYaw = 0.18;
  private turntableAngle = 0;
  private pitch = 0.12;
  private zoomFactor = 1;
  private fitDistance = 0;
  private aspect = 1;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private meshRadius = 0.6;
  private meshHeight = 1.2;
  private frame = 0;
  private lastFrameTime = 0;
  private running = true;
  private autoRotate = true;
  private lighting = "workshop";

  constructor(canvas: any, work: PotteryWork) {
    this.canvas = canvas;
    this.work = work;
    const gl = canvas.getContext("webgl", {
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true
    });
    if (!gl) throw new Error("WEBGL_UNAVAILABLE");
    this.gl = gl;
    this.program = this.makeProgram(VS, FS);
    this.vbo = gl.createBuffer();
    this.nbo = gl.createBuffer();
    this.cbo = gl.createBuffer();
    this.ibo = gl.createBuffer();
    this.rebuild();
    this.pitch = defaultPotteryPitch(this.meshRadius, this.meshHeight);
    this.resetCameraFit();
    this.loop();
  }

  private makeProgram(vsSource: string, fsSource: string): any {
    const gl = this.gl;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader) || "shader";
        gl.deleteShader(shader);
        throw new Error(message);
      }
      return shader;
    };
    const vertexShader = compile(gl.VERTEX_SHADER, vsSource);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "link");
    }
    return program;
  }

  resize(width: number, height: number, dpr: number) {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    this.canvas.width = Math.max(1, Math.floor(safeWidth * dpr));
    this.canvas.height = Math.max(1, Math.floor(safeHeight * dpr));
    this.viewportWidth = safeWidth;
    this.viewportHeight = safeHeight;
    this.aspect = safeWidth / safeHeight;
    this.resetCameraFit();
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.render();
  }

  update(work: PotteryWork) {
    this.work = work;
    this.rebuild();
    this.ensureCameraFit();
    this.render();
  }

  setAutoRotate(value: boolean) {
    this.autoRotate = value;
  }

  setLighting(value: string) {
    this.lighting = LIGHTING[value] ? value : "workshop";
    this.render();
  }

  orbit(dx: number, dy: number) {
    const delta = calculatePotteryOrbitDelta(
      dx,
      dy,
      this.viewportWidth,
      this.viewportHeight
    );
    this.viewYaw = normalizePotteryYaw(this.viewYaw + delta.yaw);
    const nextPitch = clamp(this.pitch + delta.pitch, POTTERY_MIN_PITCH, POTTERY_MAX_PITCH);
    if (nextPitch !== this.pitch) {
      this.pitch = nextPitch;
      this.resetCameraFit();
    }
    this.render();
  }

  dolly(scale: number) {
    this.zoomFactor = calculatePotteryZoomFactor(this.zoomFactor, scale);
    this.render();
  }

  resetCamera() {
    this.viewYaw = 0.18;
    this.pitch = defaultPotteryPitch(this.meshRadius, this.meshHeight);
    this.zoomFactor = 1;
    this.resetCameraFit();
    this.render();
  }

  /** Maps a CSS-pixel y coordinate back to the nearest profile sample. */
  profileIndexAtCanvasY(canvasY: number): number {
    const sampleCount = this.work.outerRadius.length;
    if (sampleCount <= 1) return 0;
    const distance = this.fitDistance * this.zoomFactor;
    const focusY = this.calculateFocusY(distance);
    const screenY = clamp(canvasY / this.viewportHeight, 0, 1);
    const ndcY = 1 - screenY * 2;
    const projectionScale = 1 / Math.tan(POTTERY_VERTICAL_FOV / 2);
    const denominator = projectionScale * Math.cos(this.pitch) + ndcY * Math.sin(this.pitch);
    const relativeY = Math.abs(denominator) < 1e-5 ? 0 : (ndcY * distance) / denominator;
    const modelY = focusY + relativeY;
    const profilePosition = clamp(modelY / this.meshHeight + 0.5, 0, 1);
    return Math.round(profilePosition * (sampleCount - 1));
  }

  /** Conservative silhouette hit test used to separate shaping from camera orbit. */
  hitTest(canvasX: number, canvasY: number): boolean {
    if (!Number.isFinite(canvasX) || !Number.isFinite(canvasY)) return false;
    const distance = this.fitDistance * this.zoomFactor;
    const top = this.projectModelY(this.meshHeight / 2, distance);
    const bottom = this.projectModelY(-this.meshHeight / 2, distance);
    const tangent = Math.tan(POTTERY_VERTICAL_FOV / 2);
    const verticalAllowance =
      (this.meshRadius * Math.sin(this.pitch)) / Math.max(distance * tangent, 0.01) *
        (this.viewportHeight / 2) +
      Math.max(12, this.viewportHeight * 0.018);
    const minY = Math.min(top, bottom) - verticalAllowance;
    const maxY = Math.max(top, bottom) + verticalAllowance;
    if (canvasY < minY || canvasY > maxY) return false;

    const profileIndex = this.profileIndexAtCanvasY(canvasY);
    const profileY = (profileIndex / Math.max(1, this.work.outerRadius.length - 1) - 0.5) * this.meshHeight;
    const focusY = this.calculateFocusY(distance);
    const relativeY = profileY - focusY;
    const radius = this.work.outerRadius[profileIndex] || this.meshRadius;
    const closestDepth = Math.max(
      0.08,
      distance - relativeY * Math.sin(this.pitch) - radius * Math.cos(this.pitch)
    );
    const halfWidth =
      (radius / (closestDepth * tangent * this.aspect)) * (this.viewportWidth / 2);
    const horizontalAllowance = Math.max(14, this.viewportWidth * 0.035);
    return Math.abs(canvasX - this.viewportWidth / 2) <= halfWidth + horizontalAllowance;
  }

  destroy() {
    this.running = false;
    if (this.frame && this.canvas.cancelAnimationFrame) {
      this.canvas.cancelAnimationFrame(this.frame);
    }
    const gl = this.gl;
    gl.deleteBuffer(this.vbo);
    gl.deleteBuffer(this.nbo);
    gl.deleteBuffer(this.cbo);
    gl.deleteBuffer(this.ibo);
    gl.deleteProgram(this.program);
  }

  private rebuild() {
    const settings = wx.getStorageSync("palm-kiln-settings") || {};
    const radialSegments = settings.quality === "low" ? 48 : settings.quality === "high" ? 88 : 64;
    const mesh = buildPotteryMesh(
      this.work.outerRadius,
      this.work.innerRadius,
      this.work.height,
      radialSegments
    );
    this.meshRadius = mesh.radius;
    this.meshHeight = mesh.height;

    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cbo);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.cavity, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.DYNAMIC_DRAW);
    this.count = mesh.indices.length;
  }

  private resetCameraFit() {
    this.fitDistance = calculatePotteryCameraDistance(
      this.meshRadius,
      this.meshHeight,
      this.aspect,
      this.pitch
    );
  }

  private ensureCameraFit() {
    if (!this.fitDistance) {
      this.resetCameraFit();
      return;
    }
    // Keep manipulation visually stable; only pull back when the generous
    // safety area would otherwise be crossed.
    const hardFit = calculatePotteryCameraDistance(
      this.meshRadius,
      this.meshHeight,
      this.aspect,
      this.pitch,
      0.64,
      0.86
    );
    this.fitDistance = Math.max(this.fitDistance, hardFit);
  }

  private projectModelY(modelY: number, distance: number): number {
    const focusY = this.calculateFocusY(distance);
    const relativeY = modelY - focusY;
    const depth = Math.max(0.08, distance - relativeY * Math.sin(this.pitch));
    const ndcY =
      (relativeY * Math.cos(this.pitch)) /
      (depth * Math.tan(POTTERY_VERTICAL_FOV / 2));
    return ((1 - ndcY) / 2) * this.viewportHeight;
  }

  private calculateFocusY(distance: number): number {
    return calculatePotteryFocusY(
      this.meshHeight,
      distance,
      this.pitch,
      POTTERY_BASE_SCREEN_Y,
      this.work.outerRadius[0] || 0
    );
  }

  render() {
    const gl = this.gl;
    const program = this.program;
    const width = this.canvas.width || 1;
    const height = this.canvas.height || 1;

    gl.viewport(0, 0, width, height);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.frontFace(gl.CCW);
    gl.cullFace(gl.BACK);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);

    const distance = this.fitDistance * this.zoomFactor;
    const focusY = this.calculateFocusY(distance);
    const horizontalDistance = Math.cos(this.pitch) * distance;
    const eye = [
      Math.sin(this.viewYaw) * horizontalDistance,
      focusY + Math.sin(this.pitch) * distance,
      Math.cos(this.viewYaw) * horizontalDistance
    ];
    const model = rotateY(this.turntableAngle);
    const view = lookAt(eye, [0, focusY, 0], [0, 1, 0]);
    const projection = perspective(POTTERY_VERTICAL_FOV, width / height, 0.08, 40);
    const viewProjection = multiply(projection, view);

    const attribute = (name: string, buffer: any, size: number) => {
      const location = gl.getAttribLocation(program, name);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    };
    attribute("aPosition", this.vbo, 3);
    attribute("aNormal", this.nbo, 3);
    attribute("aCavity", this.cbo, 1);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);

    gl.uniformMatrix4fv(gl.getUniformLocation(program, "uViewProjection"), false, viewProjection);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "uModel"), false, model);
    gl.uniform1f(gl.getUniformLocation(program, "uHeight"), this.meshHeight);

    const set3 = (name: string, value: number[]) =>
      gl.uniform3fv(gl.getUniformLocation(program, name), new Float32Array(value));
    set3("uBase", hexRgb(clayColor(this.work)));
    set3("uGlaze", hexRgb(glazeColor(this.work)));
    set3("uAccent", hexRgb(this.work.paintColor));
    set3("uCamera", eye);
    const lighting = LIGHTING[this.lighting];
    set3("uKeyDirection", lighting.keyDirection);
    set3("uFillDirection", lighting.fillDirection);
    set3("uKeyColor", lighting.keyColor);
    set3("uFillColor", lighting.fillColor);

    const glazeMix = this.work.stageIndex >= 2 ? (this.work.stageIndex >= 3 ? 1 : 0.72) : 0;
    gl.uniform1f(gl.getUniformLocation(program, "uGlazeMix"), glazeMix);
    gl.uniform1f(
      gl.getUniformLocation(program, "uPattern"),
      this.work.paintPattern || this.decorationPattern()
    );
    const methods: Record<string, number> = { full: 0, half: 1, brush: 2, splash: 3 };
    gl.uniform1f(
      gl.getUniformLocation(program, "uMethod"),
      methods[this.work.glazeMethod] ?? 0
    );
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
  }

  private decorationPattern(): number {
    if (!this.work.decorations.length) return 0;
    const type = this.work.decorations[this.work.decorations.length - 1].type;
    return type === "carve" ? 1 : type === "impress" ? 2 : type === "stamp" ? 3 : 4;
  }

  private loop(timestamp?: number) {
    if (!this.running) return;
    const now = Number.isFinite(timestamp) ? (timestamp as number) : Date.now();
    const elapsedSeconds = this.lastFrameTime
      ? clamp((now - this.lastFrameTime) / 1000, 0, 0.05)
      : 0;
    this.lastFrameTime = now;
    if (this.autoRotate && elapsedSeconds > 0) {
      this.turntableAngle = advancePotteryTurntable(
        this.turntableAngle,
        elapsedSeconds * 1000
      );
      this.render();
    }
    this.frame = this.canvas.requestAnimationFrame((nextTimestamp: number) =>
      this.loop(nextTimestamp)
    );
  }
}
