"use client";

import { useEffect, useRef } from "react";

import "./Orb.css";

const INTRO_SECONDS = 1.1;
const FOCAL = 3.2;

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uRotation;
uniform vec2 uReach;
uniform float uNear;
uniform float uAwake;
uniform vec3 uBackground;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform float uScale;
uniform float uWobble;
uniform float uGlow;
uniform float uBleed;
uniform float uHighlight;
uniform float uSwirl;
uniform float uOrbit;
uniform vec2 uEcho;
uniform float uReveal;
uniform float uOpacity;
uniform float uTrail;
uniform vec2 uTilt;
out vec4 outColor;

vec3 hash33(vec3 p3) { p3 = fract(p3 * vec3(0.1031, 0.11369, 0.13787)); p3 += dot(p3, p3.yxz + 19.19); return -1.0 + 2.0 * fract(vec3(p3.x + p3.y, p3.x + p3.z, p3.y + p3.z) * p3.zyx); }
float snoise3(vec3 p) { const float K1 = 0.333333333; const float K2 = 0.166666667; vec3 i = floor(p + (p.x + p.y + p.z) * K1); vec3 d0 = p - (i - (i.x + i.y + i.z) * K2); vec3 e = step(vec3(0.0), d0 - d0.yzx); vec3 i1 = e * (1.0 - e.zxy); vec3 i2 = 1.0 - e.zxy * (1.0 - e); vec3 d1 = d0 - (i1 - K2); vec3 d2 = d0 - (i2 - K1); vec3 d3 = d0 - 0.5; vec4 h = max(0.6 - vec4(dot(d0, d0), dot(d1, d1), dot(d2, d2), dot(d3, d3)), 0.0); vec4 n = h * h * h * h * vec4(dot(d0, hash33(i)), dot(d1, hash33(i + i1)), dot(d2, hash33(i + i2)), dot(d3, hash33(i + 1.0))); return dot(vec4(31.316), n); }
float light1(float intensity, float attenuation, float dist) { return intensity / (1.0 + dist * attenuation); }
float light2(float intensity, float attenuation, float dist) { return intensity / (1.0 + dist * dist * attenuation); }

vec4 draw(vec2 uv) {
  float rawLen = length(uv); vec2 dir = rawLen > 0.0001 ? uv / rawLen : vec2(1.0, 0.0); float reachAmount = length(uReach); vec2 reachDir = reachAmount > 0.00001 ? uReach / reachAmount : vec2(1.0, 0.0); float facing = exp((dot(dir, reachDir) - 1.0) * 3.2); float len = max(rawLen - reachAmount * facing * smoothstep(0.25, 0.65, rawLen), 0.0); uv = dir * len; float ang = atan(dir.y, dir.x); float invLen = len > 0.0 ? 1.0 / len : 0.0; float near = facing * uNear; float bgLuminance = dot(uBackground, vec3(0.299, 0.587, 0.114));
  float n0 = snoise3(vec3(uv * 0.65, uTime * 0.5)) * 0.5 + 0.5; float r0 = mix(0.8 - 0.04 * uWobble, 0.8 + 0.04 * uWobble, n0); float d0 = distance(uv, (r0 * invLen) * uv); float v0 = light1(1.0, 10.0 / uGlow, d0); v0 *= smoothstep(r0 * 1.05, r0, len); float reach = max(uBleed, 0.04); float innerFade = smoothstep(r0 * (1.0 - 0.2 * reach), r0 * (1.0 - 0.05 * reach), len); v0 *= mix(innerFade, 1.0, bgLuminance * 0.7 * min(uBleed, 1.0)); float body = smoothstep(0.8 - 0.2 * reach, 0.8, len); float cl = cos(ang + uSwirl) * 0.5 + 0.5;
  vec2 pos = vec2(cos(uOrbit), sin(uOrbit)) * r0; float d = distance(uv, pos); vec2 head = vec2(cos(uOrbit), sin(uOrbit)); float lag = atan(head.x * dir.y - head.y * dir.x, dot(dir, head)); float trail = uTrail > 0.0 ? smoothstep(0.0, 0.35, lag) * exp(-max(lag, 0.0) * 2.6 / uTrail) : 0.0; float v1 = (light2(1.5, 5.0, d) + trail * 0.6) * uHighlight; v1 *= light1(1.0, 50.0, d0); float band = v0 * smoothstep(1.0, mix(0.6, 1.0, n0 * 0.5), len) * body; float heat = pow(clamp(band / 0.82, 0.0, 1.0), 3.0); float bloom = light2(1.0, 160.0 / uGlow, max(len - r0, 0.0)) * smoothstep(0.4, 0.0, len - r0) * step(r0, len);
  vec3 colBase = mix(uColor1, uColor2, cl); float fadeAmount = mix(1.0, 0.1, bgLuminance); float echoD = abs(len - r0 - uEcho.x); float echo = light1(1.0, 60.0, echoD) * smoothstep(0.12, 0.0, echoD) * uEcho.y; vec3 darkCol = mix(uColor3, colBase, v0); darkCol = (darkCol + v1) * smoothstep(1.0, mix(0.6, 1.0, n0 * 0.5), len) * body * (1.0 + uAwake + near * 0.35) + mix(colBase, vec3(1.0), 0.25) * heat * (0.28 + near * 0.3); darkCol = clamp(darkCol + colBase * (bloom * 0.1 + echo), 0.0, 1.0); vec3 lightCol = (colBase + v1) * mix(1.0, smoothstep(1.0, mix(0.6, 1.0, n0 * 0.5), len) * body, fadeAmount); lightCol = mix(uBackground, lightCol, clamp(v0 + echo, 0.0, 1.0)); lightCol = mix(lightCol, colBase, clamp(v0, 0.0, 1.0) * clamp(near * 0.4 + uAwake, 0.0, 0.6)); lightCol = clamp(mix(lightCol, vec3(1.0), clamp(v1 * 0.35, 0.0, 0.6)), 0.0, 1.0); vec3 finalCol = mix(darkCol, lightCol, bgLuminance); float alpha = max(max(finalCol.r, finalCol.g), finalCol.b); return vec4(finalCol / (alpha + 1e-5), alpha);
}

vec2 toPlane(vec2 p, out float hit) { float cx = cos(uTilt.x); float sx = sin(uTilt.x); float cy = cos(uTilt.y); float sy = sin(uTilt.y); vec3 ex = vec3(cy, 0.0, -sy); vec3 ey = vec3(sy * sx, cx, cy * sx); vec3 normal = vec3(sy * cx, -sx, cy * cx); vec3 origin = vec3(0.0, 0.0, ${FOCAL.toFixed(1)}); vec3 ray = vec3(p, -${FOCAL.toFixed(1)}); float denom = dot(normal, ray); float t = -dot(normal, origin) / (abs(denom) > 0.00001 ? denom : -0.00001); hit = t > 0.0 ? 1.0 : 0.0; vec3 q = origin + ray * t; return vec2(dot(q, ex), dot(q, ey)); }
void main() { vec2 uv = (gl_FragCoord.xy - uResolution * 0.5) / min(uResolution.x, uResolution.y) * 2.0; uv *= uScale; float hit = 1.0; if (abs(uTilt.x) + abs(uTilt.y) > 0.0001) uv = toPlane(uv, hit); float s = sin(uRotation); float c = cos(uRotation); uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y); vec4 col = draw(uv); float dither = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0; float alpha = clamp(col.a * hit * uReveal * uOpacity + dither, 0.0, 1.0); outColor = vec4(col.rgb * alpha * alpha, alpha); }`;

type OrbProps = {
  colors?: string[];
  backgroundColor?: string;
  size?: number;
  glow?: number;
  bleed?: number;
  wobble?: number;
  highlight?: number;
  trail?: number;
  speed?: number;
  hoverIntensity?: number;
  rotateOnHover?: boolean;
  followCursor?: boolean;
  clickPulse?: boolean;
  intro?: boolean;
  opacity?: number;
  paused?: boolean;
  dpr?: number;
  className?: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function parseColor(value: string): [number, number, number] {
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return [0, 0, 0];
  probe.fillStyle = value;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}

export default function Orb({ colors = ["#9c43fe", "#4cc2e9", "#101499"], backgroundColor = "#000000", size = 1, glow = 1, bleed = 1, wobble = 1, highlight = 1, trail = 1, speed = 1, hoverIntensity = 1, rotateOnHover = true, followCursor = true, clickPulse = true, intro = true, opacity = 1, paused = false, dpr, className = "" }: OrbProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    if (!container || !canvas || !gl) return;
    const compile = (type: number, source: string) => { const shader = gl.createShader(type); if (!shader) return null; gl.shaderSource(shader, source); gl.compileShader(shader); return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null; };
    const vertex = compile(gl.VERTEX_SHADER, VERTEX); const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT); const program = gl.createProgram();
    if (!vertex || !fragment || !program) return;
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.bindAttribLocation(program, 0, "aPosition"); gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    const buffer = gl.createBuffer(); const vao = gl.createVertexArray(); if (!buffer || !vao) return;
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const uniform = (name: string) => gl.getUniformLocation(program, name); const u = { resolution: uniform("uResolution"), time: uniform("uTime"), rotation: uniform("uRotation"), reach: uniform("uReach"), near: uniform("uNear"), awake: uniform("uAwake"), background: uniform("uBackground"), color1: uniform("uColor1"), color2: uniform("uColor2"), color3: uniform("uColor3"), scale: uniform("uScale"), wobble: uniform("uWobble"), glow: uniform("uGlow"), bleed: uniform("uBleed"), highlight: uniform("uHighlight"), swirl: uniform("uSwirl"), orbit: uniform("uOrbit"), echo: uniform("uEcho"), reveal: uniform("uReveal"), opacity: uniform("uOpacity"), trail: uniform("uTrail"), tilt: uniform("uTilt") };
    const [c1, c2, c3] = colors.slice(0, 3).map(parseColor); const bg = parseColor(backgroundColor); const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false; const state = { time: 0, rotation: 0, orbit: 0, reveal: intro && !reduce ? 0 : 1, pulse: 0, pointerX: 0, pointerY: 0, inside: false, last: 0 };
    const resize = () => { const ratio = Math.min(dpr ?? window.devicePixelRatio ?? 1, 2); canvas.width = Math.max(1, Math.round(container.clientWidth * ratio)); canvas.height = Math.max(1, Math.round(container.clientHeight * ratio)); gl.viewport(0, 0, canvas.width, canvas.height); }; const pointerMove = (event: PointerEvent) => { const rect = container.getBoundingClientRect(); state.pointerX = event.clientX - rect.left; state.pointerY = event.clientY - rect.top; state.inside = state.pointerX >= 0 && state.pointerY >= 0 && state.pointerX <= rect.width && state.pointerY <= rect.height; }; const pointerDown = () => { if (clickPulse && state.inside && !reduce) state.pulse = 0.18; }; const draw = (now: number) => { const dt = state.last ? clamp((now - state.last) / 1000, 0.001, 0.05) : 1 / 60; state.last = now; if (!paused) { state.time += dt * speed; state.orbit -= dt * speed; state.rotation += rotateOnHover && state.inside ? dt * 0.24 : 0; state.reveal = intro && !reduce ? Math.min(1, state.reveal + dt / INTRO_SECONDS) : 1; state.pulse *= Math.exp(-dt * 4); } const reachX = state.inside && followCursor ? ((state.pointerX / Math.max(1, container.clientWidth) - 0.5) * 0.18 * hoverIntensity) : 0; const reachY = state.inside && followCursor ? ((0.5 - state.pointerY / Math.max(1, container.clientHeight)) * 0.18 * hoverIntensity) : 0; gl.useProgram(program); gl.bindVertexArray(vao); gl.uniform2f(u.resolution, canvas.width, canvas.height); gl.uniform1f(u.time, state.time); gl.uniform1f(u.rotation, state.rotation); gl.uniform2f(u.reach, reachX, reachY); gl.uniform1f(u.near, state.inside ? hoverIntensity : 0); gl.uniform1f(u.awake, state.inside ? hoverIntensity * 0.2 : 0); gl.uniform3fv(u.background, bg); gl.uniform3fv(u.color1, c1); gl.uniform3fv(u.color2, c2); gl.uniform3fv(u.color3, c3); gl.uniform1f(u.scale, 1 / (clamp(size, 0.1, 3) * (1 + state.pulse))); gl.uniform1f(u.wobble, Math.max(0, wobble)); gl.uniform1f(u.glow, clamp(glow, 0.1, 5)); gl.uniform1f(u.bleed, clamp(bleed, 0, 4)); gl.uniform1f(u.highlight, Math.max(0, highlight)); gl.uniform1f(u.swirl, state.time * 0.8); gl.uniform1f(u.orbit, state.orbit); gl.uniform2f(u.echo, 0.5, 0.18); gl.uniform1f(u.reveal, state.reveal); gl.uniform1f(u.opacity, clamp(opacity, 0, 1)); gl.uniform1f(u.trail, Math.max(0, trail)); gl.uniform2f(u.tilt, 0, 0); gl.drawArrays(gl.TRIANGLES, 0, 3); requestAnimationFrame(draw); };
    const observer = new ResizeObserver(resize); observer.observe(container); resize(); const raf = requestAnimationFrame(draw); container.addEventListener("pointermove", pointerMove); container.addEventListener("pointerleave", () => { state.inside = false; }); container.addEventListener("pointerdown", pointerDown); return () => { cancelAnimationFrame(raf); observer.disconnect(); container.removeEventListener("pointermove", pointerMove); container.removeEventListener("pointerdown", pointerDown); gl.deleteProgram(program); gl.deleteBuffer(buffer); gl.deleteVertexArray(vao); };
  }, [backgroundColor, bleed, clickPulse, colors, dpr, followCursor, glow, highlight, hoverIntensity, intro, opacity, paused, rotateOnHover, size, speed, trail, wobble]);

  return <div ref={containerRef} className={`orb-container ${className}`.trim()}><canvas ref={canvasRef} className="orb-canvas" aria-hidden="true" /></div>;
}
