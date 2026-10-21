import type { JSX } from 'react'

export interface MoodOption {
  key: string
  emoji: string
  label: string
}

export const MOODS: MoodOption[] = [
  { key: 'angry', emoji: '😤', label: '烦躁' },
  { key: 'anxious', emoji: '😰', label: '焦虑' },
  { key: 'sad', emoji: '😢', label: '难过' },
  { key: 'neutral', emoji: '😐', label: '平静' },
  { key: 'happy', emoji: '😊', label: '开心' },
]

const LEGACY_MOODS: Record<string, string> = {
  烦躁: '😤',
  焦虑: '😰',
  难过: '😢',
  平静: '😐',
  开心: '😊',
}

/** 旧数据里的中文心情也映射到同一套 emoji。 */
export function normalizeMood(value: string): string {
  return LEGACY_MOODS[value] ?? value
}

export interface MoodPickerProps {
  value: string
  onChange: (value: string) => void
  testId?: string
}

/** 右上角心情滑块：清除 + 五档 emoji。 */
export function MoodPicker({ value, onChange, testId = 'diary-mood' }: MoodPickerProps): JSX.Element {
  const current = normalizeMood(value)
  return (
    <div className="diary-mood-picker" data-testid={testId} role="group" aria-label="心情">
      <button
        type="button"
        className="diary-mood-option diary-mood-clear"
        data-testid={`${testId}-clear`}
        aria-pressed={!current}
        title="清除心情"
        onClick={() => onChange('')}
      >
        —
      </button>
      {MOODS.map((mood) => (
        <button
          key={mood.key}
          type="button"
          className="diary-mood-option"
          data-testid={`${testId}-${mood.key}`}
          aria-pressed={current === mood.emoji}
          title={mood.label}
          aria-label={mood.label}
          onClick={() => onChange(mood.emoji)}
        >
          {mood.emoji}
        </button>
      ))}
    </div>
  )
}
