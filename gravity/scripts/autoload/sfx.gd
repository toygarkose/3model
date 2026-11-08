## Procedural sound effects. Every sound is synthesized in code at startup,
## so the game needs no audio files (and no paid assets).
## Registered as the "Sfx" autoload. Usage: Sfx.play("launch")
extends Node

const RATE := 22050
const POOL_SIZE := 8

var _streams := {}
var _players: Array[AudioStreamPlayer] = []
var _next := 0
var _ambient: AudioStreamPlayer
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_rng.seed = 1337
	for i in POOL_SIZE:
		var p := AudioStreamPlayer.new()
		add_child(p)
		_players.append(p)
	_streams["launch"] = _to_wav(_synth_launch())
	_streams["win"] = _to_wav(_synth_win())
	_streams["crash"] = _to_wav(_synth_crash())
	_streams["lost"] = _to_wav(_synth_lost())
	_streams["click"] = _to_wav(_synth_click())
	_streams["star"] = _to_wav(_synth_star())

	_ambient = AudioStreamPlayer.new()
	_ambient.stream = _to_wav(_synth_ambient(), true)
	_ambient.volume_db = -16.0
	add_child(_ambient)
	GameState.settings_changed.connect(_apply_settings)
	_apply_settings()


func play(sound: String, volume_db := 0.0, pitch := 1.0) -> void:
	if not GameState.sound_enabled or not _streams.has(sound):
		return
	var p := _players[_next]
	_next = (_next + 1) % _players.size()
	p.stream = _streams[sound]
	p.volume_db = volume_db
	p.pitch_scale = pitch
	p.play()


func _apply_settings() -> void:
	if GameState.sound_enabled:
		if not _ambient.playing:
			_ambient.play()
	else:
		_ambient.stop()
		for p in _players:
			p.stop()


# --- Synthesis ---------------------------------------------------------------

func _buffer(duration: float) -> PackedFloat32Array:
	var buf := PackedFloat32Array()
	buf.resize(int(duration * RATE))
	return buf


func _synth_launch() -> PackedFloat32Array:
	var buf := _buffer(0.55)
	var lp := 0.0
	var phase := 0.0
	var n := buf.size()
	for i in n:
		var t := float(i) / RATE
		var k := lerpf(0.45, 0.04, float(i) / n)
		lp += (_rng.randf_range(-1.0, 1.0) - lp) * k
		var freq := 140.0 + 320.0 * (1.0 - exp(-t * 9.0))
		phase += TAU * freq / RATE
		var env := minf(t / 0.012, 1.0) * exp(-t * 5.5)
		buf[i] = (lp * 0.9 + sin(phase) * 0.35 * exp(-t * 6.0)) * env
	return buf


func _synth_win() -> PackedFloat32Array:
	var buf := _buffer(1.7)
	var notes := [523.25, 659.25, 783.99, 1046.5]
	for i in buf.size():
		var t := float(i) / RATE
		var s := 0.0
		for j in notes.size():
			var start := j * 0.085
			if t < start:
				continue
			var lt := t - start
			var f: float = notes[j]
			var env := minf(lt / 0.006, 1.0) * exp(-lt * 3.2)
			s += (sin(TAU * f * lt) + 0.3 * sin(TAU * f * 2.0 * lt) + 0.12 * sin(TAU * f * 3.0 * lt)) * env * 0.22
		# shimmer tail
		var sh := sin(TAU * 2093.0 * t) * 0.05 * (0.5 + 0.5 * sin(TAU * 9.0 * t)) * exp(-t * 2.0) * minf(t / 0.3, 1.0)
		buf[i] = s + sh
	return buf


func _synth_crash() -> PackedFloat32Array:
	var buf := _buffer(0.75)
	var lp := 0.0
	for i in buf.size():
		var t := float(i) / RATE
		lp += (_rng.randf_range(-1.0, 1.0) - lp) * 0.13
		var thump := sin(TAU * (50.0 + 60.0 * exp(-t * 18.0)) * t) * exp(-t * 8.0)
		buf[i] = (lp * 1.4 * exp(-t * 4.5) + thump * 0.8) * minf(t / 0.003, 1.0)
	return buf


func _synth_lost() -> PackedFloat32Array:
	var buf := _buffer(0.6)
	var phase := 0.0
	for i in buf.size():
		var t := float(i) / RATE
		var freq := lerpf(520.0, 160.0, t / 0.6) * (1.0 + 0.02 * sin(TAU * 7.0 * t))
		phase += TAU * freq / RATE
		buf[i] = sin(phase) * 0.35 * minf(t / 0.01, 1.0) * exp(-t * 3.0)
	return buf


func _synth_click() -> PackedFloat32Array:
	var buf := _buffer(0.07)
	for i in buf.size():
		var t := float(i) / RATE
		buf[i] = (sin(TAU * 1250.0 * t) + 0.5 * sin(TAU * 625.0 * t)) * 0.3 * exp(-t * 70.0)
	return buf


func _synth_star() -> PackedFloat32Array:
	var buf := _buffer(0.35)
	for i in buf.size():
		var t := float(i) / RATE
		buf[i] = (sin(TAU * 1318.5 * t) + 0.4 * sin(TAU * 2637.0 * t)) * 0.28 * minf(t / 0.004, 1.0) * exp(-t * 9.0)
	return buf


## 4 second seamless space drone (all frequencies loop exactly in 4 s).
func _synth_ambient() -> PackedFloat32Array:
	var buf := _buffer(4.0)
	for i in buf.size():
		var t := float(i) / RATE
		var lfo := 0.6 + 0.4 * sin(TAU * 0.25 * t)
		var s := sin(TAU * 55.0 * t) * 0.5 + sin(TAU * 82.5 * t) * 0.3 * lfo + sin(TAU * 110.25 * t) * 0.12 * (1.0 - lfo)
		buf[i] = s * 0.5
	return buf


func _to_wav(samples: PackedFloat32Array, loop := false) -> AudioStreamWAV:
	var bytes := PackedByteArray()
	bytes.resize(samples.size() * 2)
	for i in samples.size():
		var v := int(clampf(samples[i], -1.0, 1.0) * 32767.0)
		bytes.encode_s16(i * 2, v)
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = RATE
	wav.stereo = false
	wav.data = bytes
	if loop:
		wav.loop_mode = AudioStreamWAV.LOOP_FORWARD
		wav.loop_begin = 0
		wav.loop_end = samples.size()
	return wav
