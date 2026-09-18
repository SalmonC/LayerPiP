import { FC, useContext, useEffect, useRef } from 'react'
import { addonRecovery } from '@root/core/AddonRecovery'
import { createElement } from '@root/utils'
import vpContext from './context'

const _danmakuContainer = createElement('div', {
  style: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    pointerEvents: 'none',
  },
})

const DanmakuContainer: FC = (props) => {
  const { webVideo, danmakuEngine } = useContext(vpContext)
  const danmakuContainer = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!danmakuEngine || !danmakuContainer.current || !webVideo) return
    // Attach before measuring/initializing, including after a delayed video bind.
    danmakuContainer.current.appendChild(_danmakuContainer)
    try {
      danmakuEngine.init({ media: webVideo, container: _danmakuContainer })
    } catch (error) {
      try {
        danmakuEngine.unload()
      } catch (cleanupError) {
        console.warn(cleanupError)
      }
      addonRecovery.report(webVideo, 'danmaku', error)
    }
  }, [danmakuEngine, webVideo])

  if (!danmakuEngine) return null

  return (
    <div
      className="absolute left-0 top-0 size-full overflow-hidden pointer-events-none"
      ref={danmakuContainer}
    ></div>
  )
}

export default DanmakuContainer
