/// <reference path="../types/global.d.ts" />
import React, { useState, useCallback, useMemo } from 'react'

interface QuestionPanelProps {
  question: QuestionRequest
  onReply: (answers: Array<Array<string>>) => void
  onReject: () => void
}

export const QuestionPanel: React.FC<QuestionPanelProps> = ({
  question,
  onReply,
  onReject
}) => {
  const [selections, setSelections] = useState<Map<number, Set<string>>>(new Map())
  const [customInputs, setCustomInputs] = useState<Map<number, string>>(new Map())

  const handleToggle = useCallback((qIndex: number, optionLabel: string, multiple: boolean) => {
    setSelections(prev => {
      const next = new Map(prev)
      const currentSet = new Set(next.get(qIndex) || [])

      if (multiple) {
        if (currentSet.has(optionLabel)) {
          currentSet.delete(optionLabel)
        } else {
          currentSet.add(optionLabel)
        }
      } else {
        if (currentSet.has(optionLabel)) {
          currentSet.clear()
        } else {
          currentSet.clear()
          currentSet.add(optionLabel)
        }
      }

      if (currentSet.size === 0) {
        next.delete(qIndex)
      } else {
        next.set(qIndex, currentSet)
      }
      return next
    })
  }, [])

  const handleCustomChange = useCallback((qIndex: number, value: string) => {
    setCustomInputs(prev => {
      const next = new Map(prev)
      if (!value) {
        next.delete(qIndex)
      } else {
        next.set(qIndex, value)
      }
      return next
    })
  }, [])

  const isValid = useMemo(() => {
    return question.questions.every((q: QuestionInfo, index: number) => {
      const hasSelection = (selections.get(index)?.size ?? 0) > 0
      const hasCustom = (customInputs.get(index)?.length ?? 0) > 0
      return hasSelection || hasCustom
    })
  }, [question.questions, selections, customInputs])

  const handleSubmit = useCallback(() => {
    if (!isValid) return

    const answers = question.questions.map((_: QuestionInfo, index: number) => {
      const selected = Array.from(selections.get(index) || [])
      const custom = customInputs.get(index)
      if (custom) {
        selected.push(custom)
      }
      return selected
    })

    onReply(answers)
  }, [question.questions, selections, customInputs, isValid, onReply])

  return (
    <div className="question-panel">
      <div className="question-panel__content">
        {question.questions.map((q: QuestionInfo, index: number) => (
          <div key={index} className="question-panel__item">
            {q.header && (
              <div className="question-panel__header">{q.header}</div>
            )}
            <div className="question-panel__text">{q.question}</div>
            
            {q.options && q.options.length > 0 && (
              <div className="question-panel__options">
                {q.options.map((opt: QuestionOption) => {
                  const isSelected = selections.get(index)?.has(opt.label)
                  return (
                    <button
                      key={opt.label}
                      className={`question-panel__option ${isSelected ? 'question-panel__option--selected' : ''}`}
                      onClick={() => handleToggle(index, opt.label, !!q.multiple)}
                      title={opt.description}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            )}

            {q.custom !== false && (
              <div className="question-panel__custom">
                <input
                  type="text"
                  className="question-panel__input"
                  placeholder="Type your answer..."
                  value={customInputs.get(index) || ''}
                  onChange={(e) => handleCustomChange(index, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && isValid) {
                      handleSubmit()
                    }
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="question-panel__actions">
        <button 
          className="question-panel__button question-panel__button--secondary"
          onClick={onReject}
        >
          Skip
        </button>
        <button 
          className="question-panel__button question-panel__button--primary"
          onClick={handleSubmit}
          disabled={!isValid}
        >
          Submit
        </button>
      </div>
    </div>
  )
}
