import { CloseOutlined, ReloadOutlined } from '@ant-design/icons'
import { observer } from 'mobx-react'
import { FC, useEffect, useRef, useState } from 'react'
import { PipMode } from '@root/types/config'
import { addonRecovery, type AddonKind } from '@root/core/AddonRecovery'
import NativeSubtitleSourceSettings from './NativeSubtitleSourceSettings'
import AiSubtitleControls from './AiSubtitleControls'
import { aiSubtitles } from '@root/core/AiSubtitle/controller'

import {
  RangeField,
  SwitchField,
  ChoiceField,
  DanmakuFields,
} from './PlayerSettingsFields'

type SettingsValues = Record<string, any>

type Props = {
  values: SettingsValues
  onPatch: (patch: Record<string, unknown>) => void
  onReset: () => void
  onClose: () => void
  initialTab?: Tab
}

export type Tab = 'general' | 'subtitle' | 'danmaku' | 'shortcuts'

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'general', label: '播放' },
  { id: 'subtitle', label: '字幕' },
  { id: 'danmaku', label: '弹幕' },
  { id: 'shortcuts', label: '快捷键' },
]

const shortcuts = [
  ['播放 / 暂停', 'Space'],
  ['快退 / 快进', '← / →'],
  ['逐帧后退 / 前进', 'Shift + ← / →'],
  ['音量', '↑ / ↓'],
  ['静音', 'M'],
  ['自动适配宽高比', 'R'],
  ['字幕', 'S'],
  ['弹幕', 'D'],
  ['长按加速', '长按 →'],
]

const RecoveryControl = observer(({ kind }: { kind: AddonKind }) => {
  const label = kind === 'subtitle' ? '字幕' : '弹幕'
  const error = addonRecovery.errors[kind]
  if (!error && !addonRecovery.busy[kind]) return null
  return (
    <div className="fc-setting-group">
      <div className="fc-setting-row">
        <span>
          <strong>{label}加载与显示</strong>
          <small>
            {addonRecovery.available
              ? '重新加载此功能，视频继续播放'
              : '打开小窗后可单独重新加载'}
          </small>
        </span>
        <button
          type="button"
          className="fc-form-button"
          disabled={!addonRecovery.available || addonRecovery.busy[kind]}
          onClick={() => void addonRecovery.retry(kind)}
        >
          {addonRecovery.busy[kind] ? '正在重试…' : `重试${label}`}
        </button>
      </div>
      {error && (
        <p role="status" className="fc-form-status is-error">
          {error}
        </p>
      )}
    </div>
  )
})

const LayerPipSettings: FC<Props> = observer(
  ({ values, onPatch, onReset, onClose, initialTab = 'general' }) => {
    const [tab, setTab] = useState<Tab>(initialTab)
    const closeRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
      closeRef.current?.focus()
    }, [])

    return (
      <div className="fc-settings-backdrop" onMouseDown={onClose}>
        <section
          className="fc-settings-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fc-settings-title"
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key !== 'Tab') return
            const controls = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
              ),
            ).filter((el) => el.getClientRects().length)
            const first = controls[0],
              last = controls[controls.length - 1]
            if (!first) return
            if (event.shiftKey && event.target === first) {
              event.preventDefault()
              last.focus()
            } else if (!event.shiftKey && event.target === last) {
              event.preventDefault()
              first.focus()
            }
          }}
        >
          <header className="fc-settings-header">
            <div>
              <span className="fc-eyebrow">LayerPiP</span>
              <h2 id="fc-settings-title">播放设置</h2>
            </div>
            <button
              ref={closeRef}
              type="button"
              className="fc-icon-button"
              aria-label="关闭设置"
              title="关闭设置"
              onClick={onClose}
            >
              <CloseOutlined />
            </button>
          </header>

          <nav className="fc-settings-tabs" aria-label="设置分类">
            {tabs.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-current={tab === item.id ? 'page' : undefined}
                className={tab === item.id ? 'is-active' : ''}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <main className="fc-settings-content">
            {tab === 'general' && (
              <div className="fc-settings-section">
                <fieldset className="fc-setting-group">
                  <legend>小窗模式</legend>
                  <ChoiceField
                    label="选择小窗"
                    value={values.pipMode}
                    options={[
                      { value: PipMode.document, label: '增强小窗' },
                      {
                        value: PipMode.nativeComposite,
                        label: 'Edge 原生小窗',
                      },
                    ]}
                    onChange={(value) =>
                      onPatch({
                        pipMode: value,
                        nativeCompositeOptIn: value === PipMode.nativeComposite,
                      })
                    }
                  />
                  <p>切换后在下一次打开小窗时生效。</p>
                </fieldset>
                <SwitchField
                  label="显示网页浮动入口"
                  description="在 B 站视频上打开小窗或调整字幕"
                  checked={values.floatButtonVisible}
                  onChange={(value) => onPatch({ floatButtonVisible: value })}
                />
                <SwitchField
                  label="关闭小窗时暂停"
                  description="关闭画中画后同步暂停原视频"
                  checked={values.pauseInClose_video}
                  onChange={(value) => onPatch({ pauseInClose_video: value })}
                />
                <SwitchField
                  label="滚轮调节音量"
                  description="鼠标位于小窗时使用滚轮调音量"
                  checked={!values.disable_scrollToChangeVolume}
                  onChange={(value) =>
                    onPatch({ disable_scrollToChangeVolume: !value })
                  }
                />
                <RangeField
                  label="长按 → 倍速"
                  value={values.playbackRate}
                  min={1}
                  max={5}
                  step={0.25}
                  suffix="×"
                  onChange={(value) => onPatch({ playbackRate: value })}
                />
                <ChoiceField
                  label="视频适配"
                  value={values.videoNoBorder}
                  options={[
                    { value: 'default', label: '保持比例' },
                    { value: 'width', label: '铺满宽度' },
                    { value: 'height', label: '铺满高度' },
                  ]}
                  onChange={(value) => onPatch({ videoNoBorder: value })}
                />
              </div>
            )}

            {tab === 'subtitle' && (
              <div className="fc-settings-section">
                <SwitchField
                  label="本地 AI 字幕"
                  description="启用后，可在字幕菜单开始识别"
                  checked={!!values.aiSubtitleEnabled}
                  onChange={(value) => {
                    aiSubtitles.setEnabled(value)
                    onPatch({ aiSubtitleEnabled: value })
                  }}
                />
                {!!values.aiSubtitleEnabled && <AiSubtitleControls details />}
                <RecoveryControl kind="subtitle" />
                <SwitchField
                  label="历史字幕"
                  description="在当前字幕上方补看之前的话，小窗底栏也可一键切换"
                  checked={values.subtitle_historyEnabled ?? true}
                  onChange={(value) =>
                    onPatch({ subtitle_historyEnabled: value })
                  }
                />
                <RangeField
                  label="历史段数"
                  value={values.subtitle_historyCount ?? 2}
                  min={1}
                  max={5}
                  onChange={(value) =>
                    onPatch({ subtitle_historyCount: value })
                  }
                />
                <details className="fc-settings-details">
                  <summary>字幕来源与视频关联</summary>
                  <NativeSubtitleSourceSettings />
                </details>
                <RangeField
                  label="字号"
                  value={values.subtitle_fontSize}
                  min={12}
                  max={32}
                  suffix="px"
                  onChange={(value) => onPatch({ subtitle_fontSize: value })}
                />
                <RangeField
                  label="字幕不透明度"
                  value={Math.round(values.subtitle_opacity * 100)}
                  min={20}
                  max={100}
                  step={5}
                  suffix="%"
                  onChange={(value) =>
                    onPatch({ subtitle_opacity: value / 100 })
                  }
                />
                <RangeField
                  label="背景不透明度"
                  value={Math.round(values.subtitle_bgOpacity * 100)}
                  min={0}
                  max={100}
                  step={5}
                  suffix="%"
                  onChange={(value) =>
                    onPatch({ subtitle_bgOpacity: value / 100 })
                  }
                />
                <label className="fc-setting-row">
                  <span>
                    <strong>字幕颜色</strong>
                    <small>建议保持高对比度</small>
                  </span>
                  <input
                    type="color"
                    value={values.subtitle_fontColor}
                    onChange={(event) =>
                      onPatch({ subtitle_fontColor: event.target.value })
                    }
                  />
                </label>
              </div>
            )}

            {tab === 'danmaku' && (
              <div className="fc-settings-section">
                <RecoveryControl kind="danmaku" />
                <DanmakuFields values={values} onPatch={onPatch} />
              </div>
            )}

            {tab === 'shortcuts' && (
              <div className="fc-shortcut-list">
                {shortcuts.map(([label, key]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <kbd>{key}</kbd>
                  </div>
                ))}
                <p>输入字幕链接、偏移或弹幕文字时，播放器不会劫持按键。</p>
              </div>
            )}
          </main>

          <footer className="fc-settings-footer">
            <button
              type="button"
              className="fc-secondary-button"
              onClick={onReset}
            >
              <ReloadOutlined /> 恢复安全默认
            </button>
          </footer>
        </section>
      </div>
    )
  },
)

export default LayerPipSettings
