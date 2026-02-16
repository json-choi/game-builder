# QA Loop Specification — Game Builder

## 목표
프롬프트로 게임 아이디어를 말하면 → 10번 이내 대화 핑퐁으로 → MVP 게임이 만들어지는지 검증.
만족할 때까지 자동으로 코드를 수정하고 다시 테스트하는 루프.

## 아키텍처

### 1. QA Test Harness (`scripts/qa-harness.ts`)
Electron UI 없이 **agent 패키지를 직접 호출**하는 headless 테스트.
OpenCode 서버가 localhost:4096에서 돌아야 함.

#### 시나리오 흐름:
1. 임시 프로젝트 디렉토리 생성 + project.godot scaffold
2. OrchestratorAgent에 프롬프트 전달: "간단한 플랫포머 게임을 만들어줘"
3. orchestrator → game-coder → 파일 생성
4. 생성된 파일 검증:
   - project.godot 존재?
   - .tscn 씬 파일 존재?
   - .gd 스크립트 파일 존재?
   - 코드에 기본 문법 오류 없는지 (정규식 기반 체크)
   - project.godot의 run/main_scene이 설정됐는지
5. (Godot 바이너리가 있으면) `godot --check-only`로 실제 검증
6. 결과를 `qa-report.json`에 저장

#### 테스트 프롬프트들 (순서대로 도전):
- Level 1: "간단한 플랫포머 게임 만들어줘. 플레이어가 좌우로 이동하고 점프할 수 있어야 해."
- Level 2: "적이 좌우로 왕복하는 기능을 추가해줘"
- Level 3: "코인을 먹으면 점수가 올라가는 기능을 추가해줘"

각 레벨은 이전 결과 위에 추가 (대화 맥락 유지).

### 2. QA Judge (`scripts/qa-judge.ts`)
생성된 파일들을 분석해서 품질 점수를 매기는 판단 로직.

#### 체크리스트 (각 항목 pass/fail + 이유):
- [ ] 프로젝트 구조 완전성 (project.godot, main scene 설정)
- [ ] 파일 참조 일관성 (.tscn에서 참조하는 .gd 파일이 실제 존재)
- [ ] GDScript 기본 문법 (extends, func, 들여쓰기)
- [ ] 씬 파일 포맷 유효성 ([gd_scene], [node], ext_resource 매칭)
- [ ] 게임 로직 존재 (단순 빈 파일이 아닌지)
- [ ] 유저 요청 충족 (플레이어 이동, 점프 등 키워드 기반 확인)

점수: 0-100 (각 항목 가중치)

### 3. QA Loop Runner (`scripts/qa-loop-runner.ts`)
전체 루프를 오케스트레이션:

```
while (score < 80 && iteration < MAX_ITERATIONS) {
  1. harness 실행 → 게임 생성
  2. judge 실행 → 점수 + 이슈 목록
  3. 이슈를 자연어 프롬프트로 변환
  4. 에이전트에게 수정 요청
  5. 반복
}
```

MAX_ITERATIONS = 5 (무한루프 방지)
목표 점수 = 80/100 이상

### 4. 결과 리포트 (`qa-report.md`)
각 iteration마다:
- 프롬프트
- 생성된 파일 목록
- 점수 + 실패 항목
- 수정 요청 프롬프트
- 최종 pass/fail

## 중요: OpenCode 서버 의존
- agents 패키지는 OpenCode SDK를 통해 AI를 호출
- `opencode` 프로세스가 실행 중이어야 함
- 먼저 서버 health check → 안 되면 에러 리포트

## 파일 구조
```
scripts/
  qa-harness.ts      — 게임 생성 시나리오 실행
  qa-judge.ts         — 결과 판단 + 점수
  qa-loop-runner.ts   — 전체 루프 오케스트레이션
  qa-prompts.ts       — 테스트 프롬프트 정의
  run-qa-loop.sh      — 원커맨드 실행 스크립트
```

## 성공 기준
Level 1 프롬프트로 score >= 80 달성 = **MVP 생성 가능 확인**
