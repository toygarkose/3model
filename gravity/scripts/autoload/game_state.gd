## Global game state: progress, stars, settings. Saved to user://.
## Registered as the "GameState" autoload in project.godot.
extends Node

signal settings_changed

const LevelData = preload("res://scripts/levels/level_data.gd")
const Tuning = preload("res://scripts/config/tuning.gd")
const SAVE_PATH := "user://gravity_save.cfg"

var current_level := 0
var unlocked := 1                 # number of playable levels
var stars: Array = []             # best stars per level (0..3)
var sound_enabled := true
var vibration_enabled := true


func _ready() -> void:
	stars.resize(LevelData.count())
	stars.fill(0)
	load_game()


func level_count() -> int:
	return LevelData.count()


func is_unlocked(index: int) -> bool:
	return index < unlocked


func stars_for(index: int) -> int:
	if index < 0 or index >= stars.size():
		return 0
	return int(stars[index])


## First level the player has not finished yet (used by PLAY).
func next_unfinished_level() -> int:
	for i in level_count():
		if stars_for(i) == 0 and is_unlocked(i):
			return i
	return clampi(unlocked - 1, 0, level_count() - 1)


func stars_for_attempts(attempts: int) -> int:
	if attempts <= Tuning.THREE_STAR_ATTEMPTS:
		return 3
	if attempts <= Tuning.TWO_STAR_ATTEMPTS:
		return 2
	return 1


func complete_level(index: int, earned: int) -> void:
	if index >= 0 and index < stars.size():
		stars[index] = maxi(stars_for(index), earned)
	unlocked = clampi(maxi(unlocked, index + 2), 1, level_count())
	save_game()


func has_next(index: int) -> bool:
	return index + 1 < level_count()


func set_sound(enabled: bool) -> void:
	sound_enabled = enabled
	save_game()
	settings_changed.emit()


func set_vibration(enabled: bool) -> void:
	vibration_enabled = enabled
	save_game()
	settings_changed.emit()


func reset_progress() -> void:
	unlocked = 1
	stars.fill(0)
	save_game()


## Short haptic pulse on phones (needs VIBRATE permission on Android export).
func vibrate(ms: int) -> void:
	if vibration_enabled and OS.has_feature("mobile"):
		Input.vibrate_handheld(ms)


func save_game() -> void:
	var cfg := ConfigFile.new()
	cfg.set_value("progress", "unlocked", unlocked)
	cfg.set_value("progress", "stars", stars)
	cfg.set_value("settings", "sound", sound_enabled)
	cfg.set_value("settings", "vibration", vibration_enabled)
	cfg.save(SAVE_PATH)


func load_game() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(SAVE_PATH) != OK:
		return
	unlocked = clampi(int(cfg.get_value("progress", "unlocked", 1)), 1, level_count())
	var saved: Array = cfg.get_value("progress", "stars", [])
	for i in mini(saved.size(), stars.size()):
		stars[i] = int(saved[i])
	sound_enabled = bool(cfg.get_value("settings", "sound", true))
	vibration_enabled = bool(cfg.get_value("settings", "vibration", true))
