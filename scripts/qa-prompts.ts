/**
 * QA Test Prompts
 *
 * 각 레벨은 이전 결과 위에 추가(대화 맥락 유지).
 * Level 1 단독으로도 score = 100 이면 MVP 생성 가능 확인.
 */

export interface QAPrompt {
  level: number
  label: string
  prompt: string
  /** 이 레벨에서 반드시 존재해야 하는 키워드 (judge가 사용) */
  requiredKeywords: string[]
}

export const QA_PROMPTS: QAPrompt[] = [
  {
    level: 1,
    label: 'Basic Platformer',
    prompt:
      '간단한 플랫포머 게임 만들어줘. 플레이어가 좌우로 이동하고 점프할 수 있어야 해. 바닥(플랫폼)이 있어야 하고, 플레이어가 떨어지지 않아야 해. 모든 스크립트 파일에 적절한 함수가 있어야 하고, 타입 힌트를 사용해야 해. CollisionShape2D를 반드시 포함해줘.',
    requiredKeywords: [
      'move_and_slide',
      'velocity',
      'jump',
      'Input',
      'CharacterBody2D',
      'CollisionShape2D',
      'StaticBody2D',
      'gravity',
    ],
  },
  {
    level: 2,
    label: 'Enemy Patrol',
    prompt: '적이 좌우로 왕복하는 기능을 추가해줘. 적은 별도 씬(.tscn)과 스크립트(.gd)로 만들어줘.',
    requiredKeywords: ['enemy', 'patrol', 'direction', 'CharacterBody2D'],
  },
  {
    level: 3,
    label: 'Coin Pickup',
    prompt: '코인을 먹으면 점수가 올라가는 기능을 추가해줘. 코인은 Area2D로 만들고 body_entered 시그널을 사용해줘. UI에 점수를 표시해줘.',
    requiredKeywords: ['coin', 'score', 'body_entered', 'Area2D', 'Label'],
  },
]
