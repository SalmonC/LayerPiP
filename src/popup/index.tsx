import { type FC, useState } from 'react'
import { sendMessage } from 'webext-bridge/popup'
import Browser from 'webextension-polyfill'
import { createRoot } from 'react-dom/client'
import WebextEvent from '@root/shared/webextEvent'
import { LoadingOutlined } from '@ant-design/icons'
import { useAction } from '../hook'

const errorTypeMap: Record<string, string> = {
  'not-bilibili': '叠映主要为 B 站设计，请先打开 Bilibili 视频或直播页。',
  'user-activation': '请回到网页点击任意位置，叠映会继续打开。',
  'no-video': '当前页面没有检测到可播放的视频。',
  'no-support': '浏览器内部页面不支持打开视频小窗。',
}

async function withTimeout<T>(request: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error('连接页面超时，请回到 B 站视频页，从网页入口打开小窗'),
            ),
          15000,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

const Page_popup: FC = () => {
  const [errorType, setErrorType] = useState('')
  const [isLoading, startPIP] = useAction(async () => {
    setErrorType('')
    const tabs = await Browser.tabs.query({ active: true, currentWindow: true })
    if (!tabs.length) return setErrorType('no-video')
    const tarTab = tabs[0]
    if (!tarTab.url) return setErrorType('no-support')
    if (!/(^|\.)bilibili\.com$/.test(new URL(tarTab.url).hostname))
      return setErrorType('not-bilibili')
    if (
      tarTab.url.startsWith('chrome://') ||
      tarTab.url.startsWith('about:') ||
      tarTab.url.startsWith('edge:')
    )
      return setErrorType('no-support')

    await withTimeout(
      sendMessage(WebextEvent.requestVideoPIP, null, {
        tabId: tarTab.id!,
        context: 'content-script',
      }),
    )
      .then((res) => {
        if (res.state === 'ok') return window.close()
        if (res.state === 'error' && res.errType) {
          setErrorType(res.errType)
        }
      })
      .catch((error) =>
        setErrorType(
          error instanceof Error
            ? error.message
            : '连接页面失败，请刷新视频页后重试',
        ),
      )
  })

  const openSettings = async () => {
    const [tab] = await Browser.tabs.query({
      active: true,
      currentWindow: true,
    })
    if (!tab?.id) return
    try {
      if (!tab.url || !/(^|\.)bilibili\.com$/.test(new URL(tab.url).hostname)) {
        setErrorType('not-bilibili')
        return
      }
      await withTimeout(
        sendMessage(WebextEvent.openSetting, undefined, {
          tabId: tab.id,
          context: 'content-script',
        }),
      )
      window.close()
    } catch (error) {
      setErrorType(error instanceof Error ? error.message : '打开设置失败')
    }
  }

  return (
    <main className="fc-popup">
      <header className="fc-popup-header">
        <img src="./assets/icon64.png" width="38" height="38" alt="" />
        <div>
          <span>LAYERPIP</span>
          <h1>叠映</h1>
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
              <p>{errorTypeMap[errorType] ?? errorType}</p>
            </div>
          </>
        ) : (
          <div>
            <strong>已准备好</strong>
            <p>打开 B 站视频后选择小窗或设置</p>
          </div>
        )}
      </section>

      <div className="fc-popup-actions">
        <button
          type="button"
          className="is-primary"
          disabled={isLoading}
          onClick={startPIP}
        >
          {isLoading ? '打开中…' : '打开小窗'}
        </button>
        <button type="button" onClick={openSettings}>
          设置
        </button>
      </div>
    </main>
  )
}

createRoot(document.getElementById('app')!).render(<Page_popup />)
