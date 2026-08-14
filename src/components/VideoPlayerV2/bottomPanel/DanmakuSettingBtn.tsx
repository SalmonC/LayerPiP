import { PlayerEvent } from '@root/core/event'
import { useOnce } from '@root/hook'
import { useReactBrowserSyncStorage } from '@root/hook/browserStorage'
import { DANMAKU_VISIBLE } from '@root/shared/storeKey'
import { t } from '@root/utils/i18n'
import { setBrowserSyncStorage } from '@root/utils/storage'
import { isUndefined } from 'lodash-es'
import { runInAction } from 'mobx'
import { observer } from 'mobx-react'
import { FC, useContext, useEffect, useState } from 'react'
import Dropdown from '../../Dropdown'
import Iconfont from '../../Iconfont'
import vpContext from '../context'
import ActionButton from './ActionButton'

const Menu: FC = observer(() => {
  const { danmakuEngine } = useContext(vpContext)
  if (!danmakuEngine) return

  return (
    <div className="fc-menu fc-danmaku-menu">
      <p className="fc-menu-heading">弹幕同步</p>
      <label className="fc-inline-field" title={t('vp.danmakuTimeOffsetTips')}>
        <span>{t('vp.danmakuTimeOffset')}</span>
        <input
          type="number"
          step="0.1"
          value={danmakuEngine.timeOffset}
          onChange={(event) => {
            runInAction(() => {
              danmakuEngine.timeOffset = Number(event.target.value)
            })
          }}
        />
      </label>
      <small>正数使弹幕更早出现，负数使弹幕更晚出现。</small>
    </div>
  )
})

const DanmakuSettingBtn: FC = () => {
  const { danmakuEngine, eventBus } = useContext(vpContext)
  const [isInitialized, setInitialized] = useState(false)
  if (!danmakuEngine) return

  const visible = danmakuEngine.visible

  useOnce(() =>
    eventBus.on2(PlayerEvent.command_danmakuVisible, () => {
      danmakuEngine.changeVisible()
    }),
  )

  useReactBrowserSyncStorage(DANMAKU_VISIBLE, (value) => {
    if (isUndefined(value)) return
    runInAction(() => {
      danmakuEngine.visible = value
    })
  })

  useEffect(() => {
    if (!isInitialized) {
      setInitialized(true)
      return
    }
    setBrowserSyncStorage(DANMAKU_VISIBLE, danmakuEngine.visible)
  }, [danmakuEngine.visible])

  return (
    <Dropdown menuRender={() => <Menu />}>
      <ActionButton
        isUnActive={!visible}
        aria-label="弹幕"
        aria-pressed={visible}
        title="弹幕"
        onClick={() => {
          danmakuEngine.changeVisible()
        }}
      >
        <Iconfont size={18} type={visible ? 'danmaku_open' : 'danmaku_close'} />
      </ActionButton>
    </Dropdown>
  )
}

export default observer(DanmakuSettingBtn)
