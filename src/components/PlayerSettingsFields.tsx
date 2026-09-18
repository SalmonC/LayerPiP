import { type CSSProperties } from 'react'
import { observer } from 'mobx-react'

export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  display,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  display?: string
  onChange: (value: number) => void
}) {
  const percent = Math.max(
    0,
    Math.min(100, ((value - min) / (max - min)) * 100),
  )
  return (
    <label className="fc-setting-field">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--range-fill': `${percent}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output>{display ?? `${value}${suffix}`}</output>
    </label>
  )
}

export function SwitchField({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="fc-setting-row">
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  )
}

export function ChoiceField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: readonly { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <fieldset className="fc-choice-field">
      <legend>{label}</legend>
      <div className="fc-choice-options">
        {options.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export const DanmakuFields = observer(function DanmakuFields({
  values,
  onPatch,
}: {
  values: Record<string, any>
  onPatch: (patch: Record<string, unknown>) => void
}) {
  const regions = ['1/4', '1/2', 'full']
  return (
    <>
      <RangeField
        label="显示区域"
        value={Math.max(0, regions.indexOf(values.maxTunnel))}
        min={0}
        max={2}
        display={
          values.maxTunnel === 'full'
            ? '全屏'
            : values.maxTunnel === '1/4'
              ? '25%'
              : '50%'
        }
        onChange={(value) => onPatch({ maxTunnel: regions[value] })}
      />
      <RangeField
        label="不透明度"
        value={Math.round(values.opacity * 100)}
        min={20}
        max={100}
        step={5}
        suffix="%"
        onChange={(value) => onPatch({ opacity: value / 100 })}
      />
      <RangeField
        label="弹幕字号"
        value={values.fontSize}
        min={12}
        max={32}
        suffix="px"
        onChange={(value) => onPatch({ fontSize: value })}
      />
      <RangeField
        label="弹幕速度"
        value={values.danSpeed}
        min={5}
        max={40}
        display={
          values.danSpeed === 20
            ? '适中'
            : `${(values.danSpeed / 20).toFixed(2)}×`
        }
        onChange={(value) => onPatch({ danSpeed: value })}
      />
    </>
  )
})
