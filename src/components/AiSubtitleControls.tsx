import { observer } from 'mobx-react'
import { aiSubtitles } from '@root/core/AiSubtitle/controller'
import { SwitchField } from './PlayerSettingsFields'

export default observer(function AiSubtitleControls({
  details = false,
}: {
  details?: boolean
}) {
  if (!aiSubtitles.enabled) return null
  const error = aiSubtitles.phase === 'error'
  return (
    <div className="fc-ai-controls">
      <SwitchField
        label="AI 字幕"
        checked={aiSubtitles.running}
        disabled={!aiSubtitles.available}
        onChange={(enabled) =>
          enabled ? void aiSubtitles.start() : aiSubtitles.stop()
        }
      />
      {(!aiSubtitles.available || error || aiSubtitles.phase === 'loading') && (
        <p
          role="status"
          className={`fc-form-status${error ? ' is-error' : ''}`}
        >
          {!aiSubtitles.available
            ? '打开小窗后可开始识别'
            : error
              ? aiSubtitles.message
              : '正在准备…'}
        </p>
      )}
      {error && aiSubtitles.realtimeFallback && (
        <button
          type="button"
          className="fc-form-button"
          disabled={!aiSubtitles.available}
          onClick={() => void aiSubtitles.startRealtime()}
        >
          切换实时识别
        </button>
      )}
      {details && (
        <details className="fc-settings-details">
          <summary>识别信息</summary>
          <p>当前支持 1 倍速；跳转后需重新开启识别。</p>
          <p>{aiSubtitles.model.label}</p>
          <p role="status">{aiSubtitles.message}</p>
        </details>
      )}
    </div>
  )
})
