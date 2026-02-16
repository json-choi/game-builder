/**
 * QA Test Prompts
 *
 * 각 레벨은 이전 결과 위에 추가(대화 맥락 유지).
 * Level 1 단독으로도 score >= 80 이면 MVP 생성 가능 확인.
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
      '간단한 플랫포머 게임 만들어줘. 플레이어가 좌우로 이동하고 점프할 수 있어야 해.',
    requiredKeywords: [
      'move_and_slide',
      'velocity',
      'jump',
      'Input',
      'CharacterBody2D',
    ],
  },
  {
    level: 2,
    label: 'Enemy Patrol',
    prompt: '적이 좌우로 왕복하는 기능을 추가해줘',
    requiredKeywords: ['enemy', 'patrol', 'direction'],
  },
  {
    level: 3,
    label: 'Coin Pickup',
    prompt: '코인을 먹으면 점수가 올라가는 기능을 추가해줘',
    requiredKeywords: ['coin', 'score', 'body_entered'],
  },
]
