import { useContext } from 'react'
import { Observer, observer } from 'mobx-react'
import { SettingOutlined, RightOutlined } from '@ant-design/icons'
import configStore, { updateConfig } from '@root/store/config'
import { PlayerEvent } from '@root/core/event'
import { isDocPIP } from '@root/utils'
import Dropdown from '../../Dropdown'
import { SwitchField } from '../../PlayerSettingsFields'
import vpContext from '../context'
import ActionButton from './ActionButton'

export default observer(function PlayerSettingsMenu({
  onSettings,
  onShortcuts,
}: {
  onSettings: () => void
  onShortcuts: () => void
}) {
  const { eventBus, videoPlayerRef, webVideo, sideSwitcher } =
    useContext(vpContext)
  const list = sideSwitcher?.videoList.find((list) => list.mainList)
  const index = list?.items.findIndex((item) => item.isActive) ?? -1
  return (
    <Dropdown
      playerMenu
      menuRender={(close) => (
        <Observer>
          {() => (
            <div className="fc-menu fc-quick-settings">
              {/* 「历史字幕」开关不放在这里：控制栏已有独立的 SubtitleHistoryButton，
                  两处同功能入口会让用户以为是两个设置。 */}
              <SwitchField
                label="滚轮调节音量"
                checked={!configStore.disable_scrollToChangeVolume}
                onChange={(value) => {
                  void updateConfig(
                    { disable_scrollToChangeVolume: !value },
                    true,
                  )
                }}
              />
              <div className="fc-menu-divider" />
              {list && index > 0 && (
                <button
                  type="button"
                  className="fc-menu-item"
                  onClick={() => {
                    close()
                    list.items[index - 1].linkEl.click()
                  }}
                >
                  上一集
                </button>
              )}
              {list && index >= 0 && index < list.items.length - 1 && (
                <button
                  type="button"
                  className="fc-menu-item"
                  onClick={() => {
                    close()
                    list.items[index + 1].linkEl.click()
                  }}
                >
                  下一集
                </button>
              )}
              {isDocPIP(videoPlayerRef.current) && configStore.bp_resize && (
                <button
                  type="button"
                  className="fc-menu-item"
                  onClick={() => {
                    close()
                    eventBus.emit(PlayerEvent.command_autoResize)
                  }}
                >
                  适配窗口 <kbd>R</kbd>
                </button>
              )}
              {location.hostname === 'www.bilibili.com' &&
                /^\/video\//.test(location.pathname) &&
                videoPlayerRef.current &&
                videoPlayerRef.current.ownerDocument !== document && (
                  <button
                    type="button"
                    className="fc-menu-item"
                    onClick={() => {
                      close()
                      videoPlayerRef.current?.ownerDocument.dispatchEvent(
                        new Event('layerpip-open-multi'),
                      )
                    }}
                  >
                    多画面 <RightOutlined />
                  </button>
                )}
              {webVideo && (
                <button
                  type="button"
                  className="fc-menu-item"
                  onClick={() => {
                    close()
                    eventBus.emit(PlayerEvent.command_screenshot)
                  }}
                >
                  保存视频截图
                </button>
              )}
              <button
                type="button"
                className="fc-menu-item"
                onClick={() => {
                  close()
                  onShortcuts()
                }}
              >
                快捷键 <RightOutlined />
              </button>
              <button
                type="button"
                className="fc-menu-item"
                onClick={() => {
                  close()
                  onSettings()
                }}
              >
                更多播放设置 <RightOutlined />
              </button>
            </div>
          )}
        </Observer>
      )}
    >
      <ActionButton aria-label="播放设置" title="播放设置">
        <SettingOutlined />
      </ActionButton>
    </Dropdown>
  )
})
