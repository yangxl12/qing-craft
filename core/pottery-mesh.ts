import { DEFAULT_POTTERY_WALL, MIN_POTTERY_WALL } from "./pottery-dimensions";

export type PotteryMeshPart = "outer" | "inner" | "rim" | "bottom" | "floor";

export interface PotteryMeshRange {
  indexOffset: number;
  indexCount: number;
}

export interface PotteryMesh {
  positions: Float32Array;
  normals: Float32Array;
  cavity: Float32Array;
  indices: Uint16Array;
  radius: number;
  height: number;
  innerStartRing: number;
  topologyKey: string;
  ranges: Record<PotteryMeshPart, PotteryMeshRange>;
}

const MIN_CAVITY_RADIUS = 0.035;

interface CachedPotteryTopology {
  cavity: Float32Array;
  indices: Uint16Array;
  ranges: Record<PotteryMeshPart, PotteryMeshRange>;
}

const topologyCache = new Map<string, CachedPotteryTopology>();

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalize(x: number, y: number, z: number): [number, number, number] {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

/**
 * Builds one physically coherent pottery shell: an outward-facing body, an
 * inward-facing cavity, a continuous lip, a solid underside and a cavity
 * floor. Vertices are duplicated at hard edges so each surface keeps the
 * correct lighting normal without introducing visible gaps.
 */
export function buildPotteryMesh(
  outerRadius: number[],
  innerRadius: number[],
  height: number,
  radialSegments: number
): PotteryMesh {
  if (outerRadius.length < 2) throw new Error("POTTERY_PROFILE_TOO_SHORT");

  const ringCount = outerRadius.length;
  const safeHeight = Number.isFinite(height) ? Math.max(0.01, height) : 1.2;
  const segments = clamp(Math.round(radialSegments), 12, 128);
  const outer = outerRadius.map((radius) =>
    Number.isFinite(radius) ? Math.max(0.08, radius) : 0.5
  );
  const maxRadius = Math.max(...outer);

  const minimumFloorHeight = Math.min(safeHeight * 0.16, 0.065);
  const minimumFloorRing = clamp(
    Math.ceil((minimumFloorHeight / safeHeight) * (ringCount - 1)),
    2,
    ringCount - 2
  );
  const storedInnerStart = innerRadius.findIndex(
    (radius, index) =>
      index > 0 &&
      Number.isFinite(radius) &&
      radius > MIN_CAVITY_RADIUS &&
      radius < outer[index] - MIN_POTTERY_WALL * 0.5
  );
  const innerStartRing = clamp(
    Math.max(storedInnerStart < 0 ? minimumFloorRing : storedInnerStart, minimumFloorRing),
    1,
    ringCount - 2
  );

  const inner = outer.map((radius, index) => {
    if (index < innerStartRing) return 0;
    const stored = innerRadius[index];
    const fallback = radius - DEFAULT_POTTERY_WALL;
    const candidate = Number.isFinite(stored) && stored > MIN_CAVITY_RADIUS ? stored : fallback;
    return clamp(
      candidate,
      MIN_CAVITY_RADIUS,
      Math.max(MIN_CAVITY_RADIUS, radius - MIN_POTTERY_WALL)
    );
  });

  const topologyKey = `${ringCount}:${segments}:${innerStartRing}`;
  const cachedTopology = topologyCache.get(topologyKey);

  const positions: number[] = [];
  const normals: number[] = [];
  const cavity: number[] = [];
  const indices: number[] = [];
  const ranges = cachedTopology
    ? cachedTopology.ranges
    : ({} as Record<PotteryMeshPart, PotteryMeshRange>);
  const top = ringCount - 1;
  // The lip must span the complete wall thickness. Capping this radial value
  // at DEFAULT_POTTERY_WALL left a visible gap between the rounded lip and
  // both wall surfaces after the user selected a thick wall. Keep the vertical
  // crown restrained, but always bridge the full radial half-width.
  const rimHalfWidth = Math.max(
    MIN_POTTERY_WALL / 2,
    (outer[top] - inner[top]) / 2
  );
  const rimHeight = Math.min(rimHalfWidth, DEFAULT_POTTERY_WALL, safeHeight * 0.18);
  const sideHeight = safeHeight - rimHeight;
  const yAt = (ring: number) => -safeHeight / 2 + (ring / (ringCount - 1)) * sideHeight;

  const appendVertex = (
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    cavityAmount: number
  ): number => {
    const index = positions.length / 3;
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    if (!cachedTopology) cavity.push(cavityAmount);
    return index;
  };

  const appendRing = (
    radius: number,
    y: number,
    normalAt: (cosine: number, sine: number) => [number, number, number],
    cavityAmount = 0
  ): number => {
    const base = positions.length / 3;
    for (let segment = 0; segment <= segments; segment++) {
      const angle = (segment / segments) * Math.PI * 2;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const normal = normalAt(cosine, sine);
      appendVertex(
        radius * cosine,
        y,
        radius * sine,
        normal[0],
        normal[1],
        normal[2],
        cavityAmount
      );
    }
    return base;
  };

  const profileSlope = (profile: number[], ring: number, first: number, last: number) => {
    const previous = Math.max(first, ring - 1);
    const next = Math.min(last, ring + 1);
    const deltaY = yAt(next) - yAt(previous);
    return deltaY ? (profile[next] - profile[previous]) / deltaY : 0;
  };

  const startPart = () => indices.length;
  const finishPart = (part: PotteryMeshPart, start: number) => {
    if (!cachedTopology) {
      ranges[part] = { indexOffset: start, indexCount: indices.length - start };
    }
  };

  let start = startPart();
  const outerBases: number[] = [];
  for (let ring = 0; ring < ringCount; ring++) {
    const slope = profileSlope(outer, ring, 0, ringCount - 1);
    outerBases.push(
      appendRing(outer[ring], yAt(ring), (cosine, sine) =>
        normalize(cosine, -slope, sine)
      )
    );
  }
  if (!cachedTopology) {
    for (let ring = 0; ring < ringCount - 1; ring++) {
      const lower = outerBases[ring];
      const upper = outerBases[ring + 1];
      for (let segment = 0; segment < segments; segment++) {
        const lowerCurrent = lower + segment;
        const lowerNext = lowerCurrent + 1;
        const upperCurrent = upper + segment;
        const upperNext = upperCurrent + 1;
        // Counter-clockwise when viewed from outside.
        indices.push(lowerCurrent, upperCurrent, lowerNext, lowerNext, upperCurrent, upperNext);
      }
    }
  }
  finishPart("outer", start);

  start = startPart();
  const innerBases: number[] = [];
  for (let ring = innerStartRing; ring < ringCount; ring++) {
    const slope = profileSlope(inner, ring, innerStartRing, ringCount - 1);
    innerBases.push(
      appendRing(
        inner[ring],
        yAt(ring),
        (cosine, sine) => normalize(-cosine, slope, -sine),
        1
      )
    );
  }
  if (!cachedTopology) {
    for (let localRing = 0; localRing < innerBases.length - 1; localRing++) {
      const lower = innerBases[localRing];
      const upper = innerBases[localRing + 1];
      for (let segment = 0; segment < segments; segment++) {
        const lowerCurrent = lower + segment;
        const lowerNext = lowerCurrent + 1;
        const upperCurrent = upper + segment;
        const upperNext = upperCurrent + 1;
        // Reversed winding: the visible face points into the cavity.
        indices.push(lowerCurrent, lowerNext, upperCurrent, lowerNext, upperNext, upperCurrent);
      }
    }
  }
  finishPart("inner", start);

  start = startPart();
  const rimCenterRadius = (outer[top] + inner[top]) / 2;
  const rimBands = 4;
  const rimBases: number[] = [];
  for (let band = 0; band <= rimBands; band++) {
    const phase = (band / rimBands) * Math.PI;
    const radialNormal = Math.cos(phase);
    const upNormal = Math.sin(phase);
    const ellipseNormal = normalize(
      radialNormal / Math.max(rimHalfWidth, 1e-6),
      upNormal / Math.max(rimHeight, 1e-6),
      0
    );
    rimBases.push(
      appendRing(
        rimCenterRadius + rimHalfWidth * radialNormal,
        yAt(top) + rimHeight * upNormal,
        (cosine, sine) => [
          ellipseNormal[0] * cosine,
          ellipseNormal[1],
          ellipseNormal[0] * sine
        ],
        (band / rimBands) * 0.35
      )
    );
  }
  if (!cachedTopology) {
    for (let band = 0; band < rimBands; band++) {
      const outerBand = rimBases[band];
      const innerBand = rimBases[band + 1];
      for (let segment = 0; segment < segments; segment++) {
        const outerCurrent = outerBand + segment;
        const outerNext = outerCurrent + 1;
        const innerCurrent = innerBand + segment;
        const innerNext = innerCurrent + 1;
        indices.push(
          outerCurrent,
          innerCurrent,
          outerNext,
          outerNext,
          innerCurrent,
          innerNext
        );
      }
    }
  }
  finishPart("rim", start);

  start = startPart();
  const bottomY = yAt(0);
  const bottomCenter = appendVertex(0, bottomY, 0, 0, -1, 0, 0);
  const bottomRing = appendRing(outer[0], bottomY, () => [0, -1, 0]);
  if (!cachedTopology) {
    for (let segment = 0; segment < segments; segment++) {
      indices.push(bottomCenter, bottomRing + segment, bottomRing + segment + 1);
    }
  }
  finishPart("bottom", start);

  start = startPart();
  const floorY = yAt(innerStartRing);
  const floorCenter = appendVertex(0, floorY, 0, 0, 1, 0, 1);
  const floorRing = appendRing(inner[innerStartRing], floorY, () => [0, 1, 0], 1);
  if (!cachedTopology) {
    for (let segment = 0; segment < segments; segment++) {
      indices.push(floorCenter, floorRing + segment + 1, floorRing + segment);
    }
  }
  finishPart("floor", start);

  const vertexCount = positions.length / 3;
  if (vertexCount > 65535) throw new Error("POTTERY_MESH_TOO_LARGE");
  const staticTopology =
    cachedTopology || {
      cavity: new Float32Array(cavity),
      indices: new Uint16Array(indices),
      ranges
    };
  if (!cachedTopology) topologyCache.set(topologyKey, staticTopology);

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    cavity: staticTopology.cavity,
    indices: staticTopology.indices,
    radius: maxRadius,
    height: safeHeight,
    innerStartRing,
    topologyKey,
    ranges: staticTopology.ranges
  };
}
