# Basic 2D Godot Project Template

This is a scaffold template for basic 2D Godot projects. It provides a minimal, valid Godot 4.4 project structure that AI agents can extend.

## Directory Structure

```
basic-2d/
├── project.godot          # Godot project configuration (config_version=5)
├── scenes/
│   └── Main.tscn          # Main scene entry point
├── scripts/               # GDScript files directory
└── assets/                # Game assets (sprites, sounds, etc.)
```

## Extension Points for AI Agents

AI agents can extend this template by adding files to these locations:

### 1. **Scenes** (`scenes/`)
- Add new `.tscn` scene files here
- Reference scenes in `Main.tscn` using `InstancePlaceholder` or `load()`
- Example: `scenes/Player.tscn`, `scenes/Enemy.tscn`

### 2. **Scripts** (`scripts/`)
- Add GDScript files (`.gd`) here
- Attach scripts to nodes in scene files
- Example: `scripts/player.gd`, `scripts/game_manager.gd`

### 3. **Assets** (`assets/`)
- Add sprites, textures, sounds, and other game assets
- Organize by type: `assets/sprites/`, `assets/sounds/`, etc.
- Reference in scenes using `res://assets/...` paths

## Configuration

The `project.godot` file includes:
- **config_version**: 5 (Godot 4.x format)
- **main_scene**: `res://scenes/Main.tscn`
- **features**: `["4.4", "Forward Plus"]`
- **viewport**: 1152x648 (16:9 aspect ratio)

## Usage

This template is used by the game-builder scaffold system to create new 2D game projects. The scaffold manager:
1. Copies this template to a new project directory
2. Customizes `project.godot` with the project name
3. Preserves the directory structure for AI agents to extend
