# Game Builder — Task Progress Tracker

## Completed
- [x] Task 1-8: Phase 0-1 (Spikes + Skeleton)
- [x] Task 9: Game Coder Agent — 검증 완료, 21개 테스트 추가 (74c313a)
- [x] Task 10: Chat UI + Streaming Response — 검증 완료, useChat 테스트 추가 (c3b0510)
- [x] Task 11: Game Preview Integration — 버그 수정 (ca72132) + usePreview 테스트 20개 추가
- [x] Task 12: Agent Architecture — v2 SDK 마이그레이션, mock 격리 수정, 189 tests pass (818be46)
- [x] Task 14: Game Designer Agent — 테스트 14개 추가, 203 tests pass (bda6fce)
- [x] Task 15: Scene Builder Agent — 테스트 21개 추가, 224 tests pass (3a7d7c6)
- [x] Task 16: Debugger Agent — 테스트 추가, 367 agent tests pass (18818e4)
- [x] Task 17: Reviewer Agent — 테스트 26개 추가, 271 agent tests pass (a5c9de4)
- [x] Task 18: Agent Coordination & Turn-Taking — orchestrator/agents-init 테스트 +25개, 310 tests pass (ff180c4)
- [x] Tests: code-extractor, framework (4), godot-manager (8), orchestrator, config, providers, tools, agent, useChat, usePreview, game-designer, scene-builder, debugger, reviewer, orchestrator-agent, agents-init

## Skipped
- [ ] Task 13: Orchestrator Agent — OpenCode titlecase 버그로 2회 크래시, skip

## Current
- [ ] Task 19: Error Feedback Loop

## Queue (순서대로)
- [ ] Task 20: Progress UI & Generation Status
- [ ] Task 21: Chat History Persistence
- [ ] Task 22: Project Management
- [ ] Task 23: Settings & API Key Management
- [ ] Task 24: Elysia + Bun Backend Setup
- [ ] Task 25: Better Auth Integration
- [ ] Task 26: PostgreSQL + Drizzle Schema
- [ ] Task 27: Deep Link Auth Flow
- [ ] Task 28: Web Landing Page
- [ ] Task 29: PixelLab MCP Integration
- [ ] Task 30: Asset Generator Agent
- [ ] Task 31: Godot Auto-Download System
- [ ] Task 32: Tab System (Left Panel)
- [ ] Task 33: Cost Tracking & Usage UI
- [ ] Task 34: Godot Build/Export Integration
- [ ] Task 35: Godot MCP Integration
- [ ] Task 36: Plugin Manager
- [ ] Task 37: AI Plugin Recommender
- [ ] Task 38: Git-like Work Log
- [ ] Task 39: Auto-Commit System
- [ ] Task 40: Multi-Platform Build Pipeline
- [ ] Task 41: Build Progress UI
- [ ] Task 42: One-Click Publish — itch.io
- [ ] Task 43: One-Click Publish — Mobile Stores
- [ ] Task 44: One-Click Publish — Steam/Web

## Last Updated
2026-02-15T08:51:00+09:00

## Notes
- Task 9-12: 코드는 존재하지만 실제 동작 검증/보완 필요
- bun mock.module은 cross-file 오염 주의
- OpenCode 크래시 시 해당 Task부터 재시작
- Task 13: OpenCode titlecase 버그 (locale.ts:3) 2회 연속 발생으로 skip됨
