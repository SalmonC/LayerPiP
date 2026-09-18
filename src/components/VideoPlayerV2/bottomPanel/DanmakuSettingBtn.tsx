import { PlayerEvent } from '@root/core/event'
import { useReactBrowserSyncStorage } from '@root/hook/browserStorage'
import { DANMAKU_VISIBLE } from '@root/shared/storeKey'
import { t } from '@root/utils/i18n'
import { setBrowserSyncStorage } from '@root/utils/storage'
import { isUndefined } from 'lodash-es'
import { runInAction } from 'mobx'
import { observer } from 'mobx-react'
import { FC, useContext, useEffect, useState } from 'react'
import configStore, { updateConfig } from '@root/store/config'
import { DanmakuFields, SwitchField } from '../../PlayerSettingsFields'
import Dropdown from '../../Dropdown'
import Iconfont from '../../Iconfont'
import vpContext from '../context'
import ActionButton from './ActionButton'

const Menu: FC = observer(() => {
  const { danmakuEngine } = useContext(vpContext)
  if (!danmakuEngine) return

  return (
    <div className="fc-menu fc-danmaku-menu">
      <SwitchField
        label="显示弹幕"
        checked={danmakuEngine.visible}
        onChange={() => danmakuEngine.changeVisible()}
      />
      <DanmakuFields
        values={configStore}
        onPatch={(patch) => {
          void updateConfig(patch, true)
        }}
      />
      <details className="fc-settings-details">
        <summary>高级设置</summary>

        <label
          className="fc-inline-field"
          title={t('vp.danmakuTimeOffsetTips')}
        >
          <span>{t('vp.danmakuTimeOffset')}</span>
          <input
            type="number"
            step="0.1"
            value={danmakuEngine.timeOffset}
            onChange={(event) => {
              runInAction(() => {
                const value = Number(event.target.value)
                if (Number.isFinite(value)) danmakuEngine.timeOffset = value
              })
            }}
          />
        </label>
        <small>正数提前，负数延后（秒）。</small>
      </details>
    </div>
  )
})

const DanmakuSettingBtn: FC = () => {
  const { danmakuEngine, eventBus } = useContext(vpContext)
  const [isInitialized, setInitialized] = useState(false)
  const visible = danmakuEngine?.visible ?? false

  useEffect(
    () =>
      eventBus.on2(PlayerEvent.command_danmakuVisible, () => {
        danmakuEngine?.changeVisible()
      }),
    [eventBus, danmakuEngine],
  )

  useReactBrowserSyncStorage(DANMAKU_VISIBLE, (value) => {
    if (isUndefined(value) || !danmakuEngine) return
    runInAction(() => {
      danmakuEngine.visible = value
    })
  })

  useEffect(() => {
    if (!danmakuEngine) return
    if (!isInitialized) {
      setInitialized(true)
      return
    }
    setBrowserSyncStorage(DANMAKU_VISIBLE, danmakuEngine.visible)
  }, [danmakuEngine?.visible])

  if (!danmakuEngine) return null
  return (
    <Dropdown playerMenu action={['hover']} menuRender={() => <Menu />}>
      <ActionButton
        isUnActive={!visible}
        aria-label="弹幕"
        aria-pressed={visible}
        title={visible ? '关闭弹幕（D）' : '开启弹幕（D）'}
        onClick={() => danmakuEngine.changeVisible()}
      >
        <Iconfont size={18} type={visible ? 'danmaku_open' : 'danmaku_close'} />
      </ActionButton>
    </Dropdown>
  )
}

export default observer(DanmakuSettingBtn)
