#version 300 es
precision highp float;

#include "@canvas-commons/core/shaders/common.glsl"

uniform float tiles;

void main() {
    vec2 uv = fract((sourceUV - 0.5) * tiles + 0.5);
    outColor = texture(sourceTexture, uv);
}
