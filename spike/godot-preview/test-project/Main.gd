extends Node2D

var frame_count = 0

func _ready():
	print("Godot Preview Test - Ready!")

func _process(_delta):
	frame_count += 1
	if frame_count % 60 == 0:
		$Label.text = "Godot Preview Test\nFPS: " + str(Engine.get_frames_per_second())
