import { CloseOutlined, ReloadOutlined } from '@ant-design/icons'
import { observer } from 'mobx-react'
import { FC, useEffect, useRef, useState } from 'react'
import { PipMode } from '@root/types/config'
import NativeSubtitleSourceSettings from './NativeSubtitleSourceSettings'

type SettingsValues = Record<string, any>

type Props = {
  values: SettingsValues
  onPatch: (patch: Record<string, unknown>) => void
  onReset: () => void
  onClose: () => void
}

type Tab = 'general' | 'subtitle' | 'danmaku' | 'shortcuts'

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'general', label: '播放' },
  { id: 'subtitle', label: '字幕' },
  { id: 'danmaku', label: '弹幕' },
  { id: 'shortcuts', label: '快捷键' },
]

const RangeField: FC<{
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (value: number) => void
}> = ({ label, value, min, max, step = 1, suffix = '', onChange }) => (
  <label className="fc-setting-field">
    <span>{label}</span>
    <span className="fc-setting-value">
      {value}
      {suffix}
    </span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  </label>
)

const SwitchField: FC<{
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}> = ({ label, description, checked, onChange }) => (
  <label className="fc-setting-row">
    <span>
      <strong>{label}</strong>
      <small>{description}</small>
    </span>
    <input
      type="checkbox"
      role="switch"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
  </label>
)

const shortcuts = [
  ['播放 / 暂停', 'Space'],
  ['快退 / 快进', '← / →'],
  ['逐帧后退 / 前进', 'Shift + ← / →'],
  ['音量', '↑ / ↓'],
  ['静音', 'M'],
  ['字幕', 'S'],
  ['弹幕', 'D'],
  ['长按加速', '长按 →'],
]

const FloatCaptionSettings: FC<Props> = observer(
  ({ values, onPatch, onReset, onClose }) => {
    const [tab, setTab] = useState<Tab>('general')
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
        >
          <header className="fc-settings-header">
            <div>
              <span className="fc-eyebrow">FLOATCAPTION</span>
              <h2 id="fc-settings-title">浮幕设置</h2>
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
                  <div className="fc-segmented-control" aria-label="小窗模式">
                    <button
                      type="button"
                      aria-pressed={values.pipMode === PipMode.document}
                      className={
                        values.pipMode === PipMode.document ? 'is-active' : ''
                      }
                      onClick={() =>
                        onPatch({
                          pipMode: PipMode.document,
                          nativeCompositeOptIn: false,
                        })
                      }
                    >
                      <strong>增强小窗</strong>
                      <small>完整控件与字幕菜单</small>
                    </button>
                    <button
                      type="button"
                      aria-pressed={values.pipMode === PipMode.nativeComposite}
                      className={
                        values.pipMode === PipMode.nativeComposite
                          ? 'is-active'
                          : ''
                      }
                      onClick={() =>
                        onPatch({
                          pipMode: PipMode.nativeComposite,
                          nativeCompositeOptIn: true,
                        })
                      }
                    >
                      <strong>Edge 原生小窗</strong>
                      <small>合成视频、弹幕与字幕</small>
                    </button>
                  </div>
                  <p>切换后在下一次打开小窗时生效。</p>
                </fieldset>
                <SwitchField
                  label="显示网页浮动入口"
                  description="在检测到视频时显示浮幕按钮"
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
                  label="长按右键倍速"
                  value={values.playbackRate}
                  min={1}
                  max={5}
                  step={0.25}
                  suffix="×"
                  onChange={(value) => onPatch({ playbackRate: value })}
                />
                <label className="fc-setting-row">
                  <span>
                    <strong>视频适配</strong>
                    <small>控制视频在小窗中的宽高填充方式</small>
                  </span>
                  <select
                    value={values.videoNoBorder}
                    onChange={(event) =>
                      onPatch({ videoNoBorder: event.target.value })
                    }
                  >
                    <option value="default">保持比例</option>
                    <option value="width">铺满宽度</option>
                    <option value="height">铺满高度</option>
                  </select>
                </label>
              </div>
            )}

            {tab === 'subtitle' && (
              <div className="fc-settings-section">
                {values.pipMode === PipMode.nativeComposite && (
                  <NativeSubtitleSourceSettings />
                )}
                <RangeField
                  label="字号"
                  value={values.subtitle_fontSize}
                  min={12}
                  max={32}
                  suffix="px"
                  onChange={(value) => onPatch({ subtitle_fontSize: value })}
                />
                <RangeField
                  label="字幕透明度"
                  value={values.subtitle_opacity}
                  min={0.2}
                  max={1}
                  step={0.05}
                  onChange={(value) => onPatch({ subtitle_opacity: value })}
                />
                <RangeField
                  label="背景透明度"
                  value={values.subtitle_bgOpacity}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(value) => onPatch({ subtitle_bgOpacity: value })}
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
                <RangeField
                  label="字号"
                  value={values.fontSize}
                  min={12}
                  max={32}
                  suffix="px"
                  onChange={(value) => onPatch({ fontSize: value })}
                />
                <RangeField
                  label="透明度"
                  value={values.opacity}
                  min={0.2}
                  max={1}
                  step={0.05}
                  onChange={(value) => onPatch({ opacity: value })}
                />
                <RangeField
                  label="滚动速度"
                  value={values.danSpeed}
                  min={5}
                  max={40}
                  suffix="s"
                  onChange={(value) => onPatch({ danSpeed: value })}
                />
                <label className="fc-setting-row">
                  <span>
                    <strong>屏幕占用</strong>
                    <small>限制弹幕覆盖画面的高度</small>
                  </span>
                  <select
                    value={values.maxTunnel}
                    onChange={(event) =>
                      onPatch({ maxTunnel: event.target.value })
                    }
                  >
                    <option value="1/4">顶部四分之一</option>
                    <option value="1/2">顶部二分之一</option>
                    <option value="full">全屏</option>
                  </select>
                </label>
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
            <span>基于 dmMiniPlayer · 仅限非商业使用</span>
          </footer>
        </section>
      </div>
    )
  },
)

export default FloatCaptionSettings
