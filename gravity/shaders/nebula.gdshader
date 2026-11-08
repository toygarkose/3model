// Slowly drifting deep-space nebula background.
shader_type canvas_item;

uniform vec4 color_base : source_color = vec4(0.012, 0.012, 0.045, 1.0);
uniform vec4 color_a : source_color = vec4(0.16, 0.05, 0.30, 1.0);
uniform vec4 color_b : source_color = vec4(0.02, 0.16, 0.30, 1.0);
uniform vec2 parallax = vec2(0.0);
uniform float aspect = 0.5625;

float hash(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

float vnoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float a = hash(i);
	float b = hash(i + vec2(1.0, 0.0));
	float c = hash(i + vec2(0.0, 1.0));
	float d = hash(i + vec2(1.0, 1.0));
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
	float v = 0.0;
	float amp = 0.5;
	for (int i = 0; i < 4; i++) {
		v += amp * vnoise(p);
		p = p * 2.07 + vec2(3.1, 1.7);
		amp *= 0.5;
	}
	return v;
}

void fragment() {
	vec2 uv = UV;
	vec2 p = vec2(uv.x * aspect, uv.y) * 2.6 + parallax + vec2(TIME * 0.006, TIME * 0.003);
	float n1 = fbm(p);
	float n2 = fbm(p * 1.6 + vec2(5.2, 1.3) + vec2(n1 * 1.5));
	vec3 col = color_base.rgb;
	col = mix(col, color_a.rgb, smoothstep(0.42, 0.85, n1) * 0.85);
	col = mix(col, color_b.rgb, smoothstep(0.50, 0.90, n2) * 0.75);
	float vig = smoothstep(1.15, 0.25, length((uv - 0.5) * vec2(1.0, 1.2)) * 1.5);
	col *= mix(0.45, 1.0, vig);
	COLOR = vec4(col, 1.0);
}
