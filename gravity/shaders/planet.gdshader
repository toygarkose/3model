// Procedural rotating planet with lighting and atmosphere glow.
// Drawn on a square ColorRect; the planet disc has radius 1 / rect_scale in UV space.
shader_type canvas_item;

uniform vec4 color_deep : source_color = vec4(0.05, 0.15, 0.40, 1.0);
uniform vec4 color_mid : source_color = vec4(0.12, 0.45, 0.30, 1.0);
uniform vec4 color_high : source_color = vec4(0.85, 0.80, 0.65, 1.0);
uniform vec4 atmo_color : source_color = vec4(0.40, 0.70, 1.00, 1.0);
uniform float rect_scale = 1.6;
uniform float noise_scale = 2.5;
uniform float rotation_speed = 0.05;
uniform float banded = 0.0;
uniform float clouds = 0.5;
uniform float atmo_strength = 1.0;
uniform float seed = 1.0;
uniform vec3 light_dir = vec3(-0.55, -0.45, 0.70);

float hash(vec3 p) {
	p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.23) + vec3(seed * 0.137));
	p *= 17.0;
	return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float vnoise(vec3 x) {
	vec3 i = floor(x);
	vec3 f = fract(x);
	f = f * f * (3.0 - 2.0 * f);
	float a = hash(i + vec3(0.0, 0.0, 0.0));
	float b = hash(i + vec3(1.0, 0.0, 0.0));
	float c = hash(i + vec3(0.0, 1.0, 0.0));
	float d = hash(i + vec3(1.0, 1.0, 0.0));
	float e = hash(i + vec3(0.0, 0.0, 1.0));
	float g = hash(i + vec3(1.0, 0.0, 1.0));
	float h = hash(i + vec3(0.0, 1.0, 1.0));
	float k = hash(i + vec3(1.0, 1.0, 1.0));
	return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y),
			   mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}

float fbm(vec3 p) {
	float v = 0.0;
	float amp = 0.5;
	for (int i = 0; i < 5; i++) {
		v += amp * vnoise(p);
		p = p * 2.03 + vec3(1.7, 9.2, 3.1);
		amp *= 0.5;
	}
	return v;
}

void fragment() {
	vec2 p = (UV * 2.0 - 1.0) * rect_scale;
	float d = length(p);
	vec3 L = normalize(light_dir);

	// Atmosphere glow outside the disc, brighter on the lit side.
	vec2 pd = p / max(d, 0.0001);
	float lit_side = clamp(dot(vec3(pd, 0.25), L) * 0.6 + 0.55, 0.12, 1.0);
	float glow = exp(-max(d - 1.0, 0.0) * 7.0) * atmo_strength * lit_side;
	vec4 outside = vec4(atmo_color.rgb, clamp(glow * 0.75, 0.0, 1.0));

	vec3 surf = vec3(0.0);
	if (d < 1.0) {
		vec3 n = vec3(p.x, p.y, sqrt(max(1.0 - d * d, 0.0)));
		float ang = TIME * rotation_speed;
		float ca = cos(ang);
		float sa = sin(ang);
		vec3 q = vec3(n.x * ca + n.z * sa, n.y, -n.x * sa + n.z * ca);
		float hgt = fbm(q * noise_scale);

		if (banded > 0.5) {
			float warp = fbm(q * noise_scale * 1.4 + vec3(3.0, 1.0, 2.0)) - 0.5;
			float bands = 0.5 + 0.5 * sin((q.y * 7.0 + warp * 3.0) * 2.2);
			surf = mix(color_deep.rgb, color_mid.rgb, bands);
			surf = mix(surf, color_high.rgb, smoothstep(0.58, 0.78, hgt) * 0.7);
		} else {
			surf = mix(color_deep.rgb, color_mid.rgb, smoothstep(0.44, 0.52, hgt));
			surf = mix(surf, color_high.rgb, smoothstep(0.60, 0.74, hgt));
			float cl = fbm(q * noise_scale * 1.7 + vec3(TIME * 0.015, 0.0, 4.0));
			surf = mix(surf, vec3(0.95, 0.97, 1.0), smoothstep(0.55, 0.75, cl) * clouds);
		}

		float ndl = dot(n, L);
		float shade = 0.05 + 0.95 * smoothstep(-0.2, 0.9, ndl);
		surf *= shade;
		// Specular glint and atmospheric rim.
		vec3 hv = normalize(L + vec3(0.0, 0.0, 1.0));
		surf += vec3(0.25) * pow(max(dot(n, hv), 0.0), 40.0) * (1.0 - banded) * 0.6;
		float rim = pow(1.0 - n.z, 2.5);
		surf += atmo_color.rgb * rim * atmo_strength * (0.25 + 0.75 * clamp(ndl + 0.3, 0.0, 1.0));
	}

	float edge = clamp((1.0 - d) / max(fwidth(d), 0.0001), 0.0, 1.0);
	COLOR = mix(outside, vec4(surf, 1.0), edge);
}
