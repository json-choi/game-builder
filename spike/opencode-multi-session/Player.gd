extends CharacterBody2D

# Movement parameters
@export var speed: float = 200.0
@export var jump_force: float = -400.0
@export var gravity: float = 800.0
@export var max_fall_speed: float = 500.0

# Internal variables
var is_jumping: bool = false

func _physics_process(delta: float) -> void:
	# Handle horizontal movement (WASD)
	var input_vector = Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
	velocity.x = input_vector.x * speed
	
	# Handle jumping (Spacebar)
	if Input.is_action_just_pressed("ui_accept") and is_on_floor():
		velocity.y = jump_force
		is_jumping = true
	
	# Apply gravity
	if not is_on_floor():
		velocity.y += gravity * delta
		# Clamp fall speed to prevent excessive velocity
		velocity.y = min(velocity.y, max_fall_speed)
	else:
		# Reset jump state when on floor
		is_jumping = false
		# Prevent velocity from going below 0 when on floor
		if velocity.y > 0:
			velocity.y = 0
	
	# Move the character
	move_and_slide()
