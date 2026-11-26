// glkit.js — WebGL plumbing for Kestrel Valley: one shader program with
// per-vertex colour and simple two-light shading, plus a geometry builder
// that packs coloured boxes, prisms and discs into a single mesh.

const VERTEX_SHADER = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
uniform mat4 uMVP;
uniform mat4 uModel;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  vNormal = mat3(uModel) * aNormal;
  vColor = aColor;
  gl_Position = uMVP * vec4(aPos, 1.0);
}`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform vec3 uSunDir;
uniform vec3 uCamPos;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uEmissive;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vec3 n = normalize(vNormal);
  float sun = max(dot(n, uSunDir), 0.0);
  float sky = 0.5 + 0.5 * n.y;
  vec3 lit = vColor * (0.34 + 0.30 * sky + 0.62 * sun) + vColor * uEmissive;
  float dist = length(vWorld - uCamPos);
  float fog = smoothstep(uFogNear, uFogFar, dist);
  gl_FragColor = vec4(mix(lit, uFogColor, fog), 1.0);
}`;

export function createProgram(gl) {
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error('shader: ' + gl.getShaderInfoLog(shader));
    }
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error('link: ' + gl.getProgramInfoLog(program));
  }
  return {
    program,
    attrib: {
      pos: gl.getAttribLocation(program, 'aPos'),
      normal: gl.getAttribLocation(program, 'aNormal'),
      color: gl.getAttribLocation(program, 'aColor'),
    },
    uniform: {
      mvp: gl.getUniformLocation(program, 'uMVP'),
      model: gl.getUniformLocation(program, 'uModel'),
      sunDir: gl.getUniformLocation(program, 'uSunDir'),
      camPos: gl.getUniformLocation(program, 'uCamPos'),
      fogColor: gl.getUniformLocation(program, 'uFogColor'),
      fogNear: gl.getUniformLocation(program, 'uFogNear'),
      fogFar: gl.getUniformLocation(program, 'uFogFar'),
      emissive: gl.getUniformLocation(program, 'uEmissive'),
    },
  };
}

// A mesh is one interleaved buffer: position, normal, colour per vertex.
export function createMesh(gl, builder) {
  const data = new Float32Array(builder.data);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return { buffer, count: builder.data.length / 9 };
}

export function drawMesh(gl, prog, mesh, mvp, model, emissive = 0) {
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
  const stride = 36;
  gl.enableVertexAttribArray(prog.attrib.pos);
  gl.vertexAttribPointer(prog.attrib.pos, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(prog.attrib.normal);
  gl.vertexAttribPointer(prog.attrib.normal, 3, gl.FLOAT, false, stride, 12);
  gl.enableVertexAttribArray(prog.attrib.color);
  gl.vertexAttribPointer(prog.attrib.color, 3, gl.FLOAT, false, stride, 24);
  gl.uniformMatrix4fv(prog.uniform.mvp, false, mvp);
  gl.uniformMatrix4fv(prog.uniform.model, false, model);
  gl.uniform1f(prog.uniform.emissive, emissive);
  gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
}

// Geometry builder: collects triangles as flat-shaded coloured facets.
// Work in local space, then bake a matrix in with transform().
export class Builder {
  constructor() { this.data = []; }

  tri(a, b, c, color) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (const p of [a, b, c]) this.data.push(p[0], p[1], p[2], nx, ny, nz, color[0], color[1], color[2]);
    return this;
  }

  quad(a, b, c, d, color) {
    return this.tri(a, b, c, color).tri(a, c, d, color);
  }

  // Axis-aligned box centred at (x, y, z) with the given full sizes.
  box(x, y, z, sx, sy, sz, color) {
    const x0 = x - sx / 2, x1 = x + sx / 2;
    const y0 = y - sy / 2, y1 = y + sy / 2;
    const z0 = z - sz / 2, z1 = z + sz / 2;
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], color); // top
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color); // bottom
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color); // south
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color); // north
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color); // east
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color); // west
    return this;
  }

  // A tapered box: two rectangles (near at zNear, far at zFar) joined up.
  // Used for fuselage sections and wing shapes.
  frustum(cx, cy, zNear, zFar, wNear, hNear, wFar, hFar, color, yOffNear = 0, yOffFar = 0) {
    const n = [
      [cx - wNear / 2, cy + yOffNear - hNear / 2, zNear], [cx + wNear / 2, cy + yOffNear - hNear / 2, zNear],
      [cx + wNear / 2, cy + yOffNear + hNear / 2, zNear], [cx - wNear / 2, cy + yOffNear + hNear / 2, zNear],
    ];
    const f = [
      [cx - wFar / 2, cy + yOffFar - hFar / 2, zFar], [cx + wFar / 2, cy + yOffFar - hFar / 2, zFar],
      [cx + wFar / 2, cy + yOffFar + hFar / 2, zFar], [cx - wFar / 2, cy + yOffFar + hFar / 2, zFar],
    ];
    this.quad(n[3], n[2], f[2], f[3], color); // top
    this.quad(n[1], n[0], f[0], f[1], color); // bottom
    this.quad(n[0], n[3], f[3], f[0], color); // left
    this.quad(n[2], n[1], f[1], f[2], color); // right
    this.quad(f[0], f[3], f[2], f[1], color); // far cap
    this.quad(n[0], n[1], n[2], n[3], color); // near cap
    return this;
  }

  // Flat ring (annulus) in the XZ plane, for prop discs and markers.
  disc(cx, cy, cz, rInner, rOuter, color, segments = 24) {
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const p = (r, a) => [cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r];
      this.quad(p(rInner, a0), p(rOuter, a0), p(rOuter, a1), p(rInner, a1), color);
    }
    return this;
  }

  // Torus standing in the XY plane (a ring you fly through along Z).
  torus(cx, cy, cz, radius, tube, color, segments = 28, tubeSegments = 8) {
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      for (let j = 0; j < tubeSegments; j++) {
        const b0 = (j / tubeSegments) * Math.PI * 2;
        const b1 = ((j + 1) / tubeSegments) * Math.PI * 2;
        const p = (a, b) => {
          const rr = radius + Math.cos(b) * tube;
          return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, cz + Math.sin(b) * tube];
        };
        this.quad(p(a0, b0), p(a1, b0), p(a1, b1), p(a0, b1), color);
      }
    }
    return this;
  }

  // Low-segment sphere, squashed if sy is given — clouds and rocks.
  blob(cx, cy, cz, r, color, sy = 1, segments = 8) {
    const rings = 4;
    for (let i = 0; i < rings; i++) {
      const p0 = -Math.PI / 2 + (i / rings) * Math.PI;
      const p1 = -Math.PI / 2 + ((i + 1) / rings) * Math.PI;
      for (let j = 0; j < segments; j++) {
        const a0 = (j / segments) * Math.PI * 2;
        const a1 = ((j + 1) / segments) * Math.PI * 2;
        const p = (phi, a) => [
          cx + Math.cos(phi) * Math.cos(a) * r,
          cy + Math.sin(phi) * r * sy,
          cz + Math.cos(phi) * Math.sin(a) * r,
        ];
        this.quad(p(p0, a0), p(p0, a1), p(p1, a1), p(p1, a0), color);
      }
    }
    return this;
  }

  // Bake a 4x4 matrix into every vertex collected so far from index `from`.
  transform(m, from = 0) {
    const d = this.data;
    for (let i = from; i < d.length; i += 9) {
      const x = d[i], y = d[i + 1], z = d[i + 2];
      d[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
      d[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      d[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      const nx = d[i + 3], ny = d[i + 4], nz = d[i + 5];
      let tx = m[0] * nx + m[4] * ny + m[8] * nz;
      let ty = m[1] * nx + m[5] * ny + m[9] * nz;
      let tz = m[2] * nx + m[6] * ny + m[10] * nz;
      const l = Math.hypot(tx, ty, tz) || 1;
      d[i + 3] = tx / l; d[i + 4] = ty / l; d[i + 5] = tz / l;
    }
    return this;
  }

  mark() { return this.data.length; }
}
