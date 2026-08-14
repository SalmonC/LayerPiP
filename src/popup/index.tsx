import { type FC, useState } from 'react'
import { sendMessage } from 'webext-bridge/popup'
import Browser from 'webextension-polyfill'
import { createRoot } from 'react-dom/client'
import WebextEvent from '@root/shared/webextEvent'
import { LoadingOutlined } from '@ant-design/icons'
import { useAction, useOnce } from '../hook'

const errorTypeMap: Record<string, string> = {
  'user-activation': '请回到网页点击任意位置，浮幕会继续打开。',
  'no-video': '当前页面没有检测到可播放的视频。',
  'no-support': '浏览器内部页面不支持打开视频小窗。',
}

const Page_popup: FC = () => {
  const [errorType, setErrorType] = useState('')
  const [isLoading, startPIP] = useAction(async () => {
    setErrorType('')
    const tabs = await Browser.tabs.query({ active: true, currentWindow: true })
    if (!tabs.length) return
    const tarTab = tabs[0]
    if (!tarTab.url) return setErrorType('no-support')
    if (
      tarTab.url.startsWith('chrome://') ||
      tarTab.url.startsWith('about:') ||
      tarTab.url.startsWith('edge:')
    )
      return setErrorType('no-support')

    await sendMessage(WebextEvent.requestVideoPIP, null, {
      tabId: tarTab.id!,
      context: 'content-script',
    }).then((res) => {
      if (res.state === 'ok') return window.close()
      if (res.state === 'error' && res.errType) {
        setErrorType(res.errType)
      }
    })
  }, true)

  useOnce(() => {
    startPIP()
  })

  const openSettings = async () => {
    const [tab] = await Browser.tabs.query({
      active: true,
      currentWindow: true,
    })
    if (!tab?.id) return
    await sendMessage(WebextEvent.openSetting, null, {
      tabId: tab.id,
      context: 'content-script',
    })
    window.close()
  }

  return (
    <main className="fc-popup">
      <header className="fc-popup-header">
        <img src="./assets/icon64.png" width="38" height="38" alt="" />
        <div>
          <span>FLOATCAPTION</span>
          <h1>浮幕</h1>
        </div>
      </header>

      <section className="fc-popup-status" aria-live="polite">
        {isLoading ? (
          <>
            <LoadingOutlined spin />
            <div>
              <strong>正在打开小窗</strong>
              <p>将保留弹幕、字幕和键盘控制</p>
            </div>
          </>
        ) : errorType ? (
          <>
            <span className="fc-popup-status-dot" aria-hidden="true" />
            <div>
              <strong>暂时无法打开</strong>
              <p>{errorTypeMap[errorType]}</p>
            </div>
          </>
        ) : (
          <div>
            <strong>已准备好</strong>
            <p>点击下方按钮重新尝试</p>
          </div>
        )}
      </section>

      <div className="fc-popup-actions">
        <button type="button" className="is-primary" onClick={startPIP}>
          {isLoading ? '打开中…' : '打开小窗'}
        </button>
        <button type="button" onClick={openSettings}>
          设置
        </button>
      </div>

      <footer>B站视频 · 直播 · 通用 HTML5 视频</footer>
    </main>
  )
}

createRoot(document.getElementById('app')!).render(<Page_popup />)
