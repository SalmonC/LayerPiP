import { observer } from 'mobx-react'
import configStore, { updateConfig } from '@root/store/config'
import { useContext } from 'react'
import vpContext from '../context'

export default observer(function SubtitleHistoryButton() {
  const enabled = configStore.subtitle_historyEnabled
  const { subtitleManager } = useContext(vpContext)
  const available =
    !!subtitleManager?.showSubtitle && !!subtitleManager.rows.length
  const label = !available
    ? '暂无已开启的字幕，请先在字幕菜单选择来源'
    : enabled
      ? '关闭历史字幕'
      : '显示历史字幕'
  return (
    <button
      type="button"
      className="fc-action-button fc-history-button"
      disabled={!available}
      aria-label={label}
      title={label}
      aria-pressed={enabled}
      onClick={(event) => {
        event.stopPropagation()
        if (!available) return
        void updateConfig({ subtitle_historyEnabled: !enabled }, true)
      }}

    >
      历史
    </button>
  )
})
