# Game Builder — 개선 계획

## Phase 1: 미완성 기능 완성 (우선순위 높음)

### Task A1: Console 탭 구현
- ConsolePlaceholder → 실제 Console 컴포넌트
- Godot preview output을 Console 탭에 실시간 표시
- 로그 레벨 (info/warning/error) 색상 구분
- 클리어 버튼, 자동 스크롤

### Task A2: Assets 탭 구현
- AssetsPlaceholder → 실제 Asset Library 컴포넌트
- 프로젝트 addons/ 및 assets/ 디렉토리 스캔
- 이미지 미리보기 (png, jpg, svg)
- 오디오 파일 재생 (wav, ogg, mp3)
- 에셋 카테고리 필터 (이미지/오디오/스크립트/씬)

### Task A3: Usage Stats 연결
- SettingsPanel의 하드코딩된 0 → useCostTracking 훅 연결
- 실시간 토큰/비용 표시

### Task A4: PixelLab MCP 실제 연동
- placeholder 반환 → 실제 API 호출 구조 (API 키 설정 시)
- API 키 없으면 graceful 안내 메시지

## Phase 2: UX 개선

### Task B1: 프로젝트 전환
- 헤더에 현재 프로젝트명 표시
- 뒤로가기/프로젝트 전환 버튼
- 최근 프로젝트 목록

### Task B2: 에이전트 선택 드롭다운
- ChatInput 툴바에 에이전트 선택 UI
- orchestrator/game-coder/designer/scene-builder/debugger/reviewer/vision

### Task B3: 대화 히스토리
- 사이드바에 대화 목록
- 새 대화 생성
- 이전 대화 불러오기
- 대화 삭제

### Task B4: 파일 편집기
- FileExplorer에서 파일 클릭 → 코드 뷰어
- Monaco Editor 또는 CodeMirror 통합
- GDScript 구문 강조
- 읽기 전용 → 편집 모드 전환

### Task B5: 에러/알림 토스트
- 전역 토스트 알림 시스템
- 성공/에러/경고/정보 레벨
- 자동 dismiss + 수동 닫기

### Task B6: 키보드 단축키
- Cmd/Ctrl+Enter: 메시지 전송
- Cmd/Ctrl+N: 새 프로젝트
- Cmd/Ctrl+P: 프로젝트 전환
- Cmd/Ctrl+1~5: 탭 전환

### Task B7: 다크/라이트 테마
- CSS 변수 기반 테마 시스템
- 토글 버튼 (Settings)
- 시스템 테마 감지

## Phase 3: 기능 확장

### Task C1: 튜토리얼/온보딩
- 첫 실행 감지 → 온보딩 모달
- 단계: API 키 설정 → 첫 프로젝트 → 첫 대화
- 스킵 가능

### Task C2: 템플릿 프로젝트
- 프로젝트 생성 시 템플릿 선택
- 플랫포머, 퍼즐, 슈터, RPG, 빈 프로젝트
- 각 템플릿에 기본 GDScript + 씬 포함

### Task C3: 버전 관리 UI
- work-log 데이터를 타임라인 뷰어로 표시
- 각 엔트리 상세 보기 (변경 파일, 설명)
- 특정 버전으로 복원 기능

### Task C4: 멀티 파일 Diff 뷰어
- 에이전트가 수정한 파일 목록
- 변경 전/후 diff 표시
- 변경 수락/거부

### Task C5: 배포 UI
- itch.io/Steam/Web 퍼블리시 UI (LeftPanel에 Deploy 탭 추가)
- 기존 publisher 백엔드와 연결
- 배포 상태/히스토리

### Task C6: 사운드/음악 에셋 관리
- 오디오 파일 미리 듣기
- 파형 시각화
- AI 사운드 생성 에셋 연동 준비

## Phase 4: 기술 부채

### Task D1: CSS 분리
- 2000줄+ index.css → 컴포넌트별 CSS modules
- 또는 Tailwind CSS 도입

### Task D2: 게임 테스트 자동화
- Godot 실행 → 스크린샷 캡처 → Vision Agent 분석
- 자동 피드백 루프

## 실행 순서
Phase 1 (A1~A4) → Phase 2 (B1~B7) → Phase 3 (C1~C6) → Phase 4 (D1~D2)
총 19개 Task
