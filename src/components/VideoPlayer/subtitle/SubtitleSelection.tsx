import {
  CheckOutlined,
  LoadingOutlined,
  TranslationOutlined,
} from '@ant-design/icons'
import Dropdown from '@root/components/Dropdown'
import FileDropper from '@root/components/FileDropper'
import Iconfont from '@root/components/Iconfont'
import ActionButton from '@root/components/VideoPlayerV2/bottomPanel/ActionButton'
import vpContext from '@root/components/VideoPlayerV2/context'
import { PlayerEvent } from '@root/core/event'
import type SubtitleManager from '@root/core/SubtitleManager'
import { translateMode } from '@root/core/SubtitleManager'
import type { NetworkSubtitleProbe } from '@root/core/SubtitleManager/types'
import { useOnce } from '@root/hook'
import { t } from '@root/utils/i18n'
import { useMemoizedFn } from 'ahooks'
import classNames from 'classnames'
import { runInAction } from 'mobx'
import { observer } from 'mobx-react'
import { type FC, memo, useContext, useRef, useState } from 'react'

type Props = {
  subtitleManager: SubtitleManager
}
const SubtitleSelectionInner: FC<Props> = observer((props) => {
  const { subtitleManager } = props
  const activeLabel = subtitleManager.activeSubtitleLabel
  const { eventBus, videoPlayerRef } = useContext(vpContext)

  const handleChangeVisible = useMemoizedFn(() => {
    runInAction(() => {
      if (!subtitleManager.activeSubtitleLabel) {
        if (subtitleManager.subtitleItems.length) {
          subtitleManager.useSubtitle(subtitleManager.subtitleItems[0].label)
          subtitleManager.showSubtitle = true
        } else {
          return console.log('No subtitle')
        }
      } else {
        subtitleManager.showSubtitle = !subtitleManager.showSubtitle
      }
    })
  })

  useOnce(() =>
    eventBus.on2(PlayerEvent.command_subtitleVisible, () => {
      handleChangeVisible()
    }),
  )

  return (
    <Dropdown
      menuRender={() => <Menu {...props} />}
      getPopupContainer={(node) =>
        videoPlayerRef.current || node.ownerDocument.body!
      }
    >
      <ActionButton
        isUnActive={!subtitleManager.showSubtitle}
        onClick={handleChangeVisible}
      >
        <Iconfont type="subtitle" size={18} />
      </ActionButton>
    </Dropdown>
  )
})

const Menu: FC<Props> = observer((props) => {
  const { subtitleManager } = props
  const activeLabel = subtitleManager.activeSubtitleLabel
  const [showNetworkLoader, setShowNetworkLoader] = useState(false)
  return (
    <div
      className={classNames(
        'bg-[#000] rounded-[4px] p-[4px] text-[14px] text-white max-h-[calc(100vh-var(--area-height)-10px)] custom-scrollbar overflow-auto',
        showNetworkLoader ? 'w-[310px]' : 'w-[170px]',
      )}
    >
      <div className="f-i-center px-2 py-1 justify-between gap-2">
        <TranslationOutlined className="text-[16px]" />
        <select
          value={subtitleManager.translateMode}
          className="bg-[#333] flex-1"
          onChange={(e) => {
            runInAction(() => {
              subtitleManager.translateMode = e.target.value as any
            })
          }}
        >
          {Object.entries(translateMode).map(([v, text]) => (
            <option className="bg-[#333]" key={v} value={v}>
              {text}
            </option>
          ))}
        </select>
      </div>
      <div className="relative h-[24px] px-[4px] rounded-[4px] f-center cursor-pointer hover:bg-gray-800 transition-colors">
        {t('vp.addNewSubtitle')}
        <input
          className="absolute w-full left-0 top-0 h-full opacity-0 cursor-pointer"
          type="file"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            subtitleManager.addFileSubtitle(file)
          }}
          accept=".srt, .ass"
        />
      </div>
      <div
        className="h-[24px] mt-1 px-[4px] rounded-[4px] text-center cursor-pointer hover:bg-gray-800 transition-colors leading-[24px]"
        onClick={() => setShowNetworkLoader((value) => !value)}
      >
        {t('vp.addNetworkSubtitle')}
      </div>
      {showNetworkLoader && (
        <NetworkSubtitleLoader subtitleManager={subtitleManager} />
      )}
      {subtitleManager.subtitleItems.map((subtitleItem, i) => (
        <div
          key={`${subtitleItem.value}-${i}`}
          className={classNames(
            'h-[24px] mt-1 px-[4px] rounded-[4px] text-ellipsis text-center cursor-pointer hover:bg-gray-800 w-full transition-colors whitespace-nowrap overflow-hidden leading-[24px]',
            activeLabel === subtitleItem.label && 'text-[var(--color-main)]',
          )}
          onClick={() => {
            subtitleManager.useSubtitle(subtitleItem.label)
            subtitleManager.showSubtitle = true
          }}
        >
          {subtitleItem.label}
        </div>
      ))}
    </div>
  )
})

const NetworkSubtitleLoader: FC<Props> = (props) => {
  const { subtitleManager } = props
  const [url, setUrl] = useState('')
  const [offset, setOffset] = useState('0')
  const [probe, setProbe] = useState<NetworkSubtitleProbe>()
  const [selectedPart, setSelectedPart] = useState('')
  const [selectedTrack, setSelectedTrack] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadedLabel, setLoadedLabel] = useState('')
  const [error, setError] = useState('')
  const requestId = useRef(0)

  const resolveUrl = useMemoizedFn(async (part?: number) => {
    const currentRequest = ++requestId.current
    setLoading(true)
    setError('')
    setLoadedLabel('')
    try {
      const result = await subtitleManager.probeNetworkSubtitle(url, part)
      if (currentRequest !== requestId.current) return
      setProbe(result)
      if (result.parts.length) {
        setSelectedPart(String(result.selectedPart ?? result.parts[0].page))
      }
      setSelectedTrack(result.tracks[0]?.value ?? '')
    } catch (reason) {
      if (currentRequest !== requestId.current) return
      setProbe(undefined)
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  })

  const importTrack = useMemoizedFn(async () => {
    const track = probe?.tracks.find((item) => item.value === selectedTrack)
    if (!track) return setError(t('vp.selectSubtitleTrack'))
    const offsetNumber = Number(offset)
    if (!Number.isFinite(offsetNumber)) {
      return setError(t('vp.subtitleOffsetInvalid'))
    }

    setLoading(true)
    setError('')
    setLoadedLabel('')
    try {
      const label = await subtitleManager.addNetworkSubtitle(
        track,
        offsetNumber,
      )
      setLoadedLabel(label)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  })

  return (
    <div className="mt-1 p-2 rounded-[4px] bg-[#161616] flex flex-col gap-2">
      <input
        className="w-full bg-[#292929] border border-[#fff4] rounded px-2 py-1"
        disabled={loading}
        value={url}
        placeholder={t('vp.networkSubtitleUrlPlaceholder')}
        onChange={(event) => {
          requestId.current++
          setUrl(event.target.value)
          setProbe(undefined)
          setError('')
          setLoadedLabel('')
        }}
      />
      <label className="f-i-center gap-2" title={t('vp.subtitleOffsetTips')}>
        <span className="whitespace-nowrap">{t('vp.subtitleOffset')}</span>
        <input
          className="min-w-0 flex-1 bg-[#292929] border border-[#fff4] rounded px-2 py-1"
          disabled={loading}
          type="number"
          step="0.1"
          value={offset}
          onChange={(event) => setOffset(event.target.value)}
        />
      </label>
      {!probe && (
        <button
          className="rounded bg-[#333] hover:bg-[#444] px-2 py-1 disabled:opacity-50"
          disabled={loading || !url.trim()}
          type="button"
          onClick={() => resolveUrl()}
        >
          {loading ? (
            <LoadingOutlined className="animate-spin" />
          ) : (
            t('vp.resolveSubtitleLink')
          )}
        </button>
      )}
      {probe?.needsPartSelection && (
        <>
          <label>{t('vp.selectSubtitlePart')}</label>
          <select
            className="w-full bg-[#292929] border border-[#fff4] rounded px-2 py-1"
            disabled={loading}
            value={selectedPart}
            onChange={(event) => setSelectedPart(event.target.value)}
          >
            {probe.parts.map((part) => (
              <option key={part.page} value={part.page}>
                {part.label}
              </option>
            ))}
          </select>
          <button
            className="rounded bg-[#333] hover:bg-[#444] px-2 py-1 disabled:opacity-50"
            disabled={loading || !selectedPart}
            type="button"
            onClick={() => resolveUrl(Number(selectedPart))}
          >
            {loading ? (
              <LoadingOutlined className="animate-spin" />
            ) : (
              t('vp.readSelectedPart')
            )}
          </button>
        </>
      )}
      {!!probe?.tracks.length && (
        <>
          <label>{t('vp.selectSubtitleTrack')}</label>
          <select
            className="w-full bg-[#292929] border border-[#fff4] rounded px-2 py-1"
            disabled={loading}
            value={selectedTrack}
            onChange={(event) => setSelectedTrack(event.target.value)}
          >
            {probe.tracks.map((track) => (
              <option key={track.value} value={track.value}>
                {track.label}
              </option>
            ))}
          </select>
          <button
            className="rounded bg-[var(--color-main)] text-black px-2 py-1 disabled:opacity-50"
            disabled={loading || !selectedTrack}
            type="button"
            onClick={importTrack}
          >
            {loading ? (
              <LoadingOutlined className="animate-spin" />
            ) : (
              t('vp.loadNetworkSubtitle')
            )}
          </button>
        </>
      )}
      {loadedLabel && (
        <p className="text-green-400 break-words">
          <CheckOutlined /> {t('vp.networkSubtitleLoaded')}: {loadedLabel}
        </p>
      )}
      {error && <p className="text-red-400 break-words">{error}</p>}
    </div>
  )
}

const SubtitleSelection: FC<Props> = memo((props) => {
  const { isLive } = useContext(vpContext)
  if (isLive) return null
  return (
    <FileDropper
      global
      dragoverRender={
        <div className="f-center w-full h-full gap-[24px] bg-[#fff3]">
          <Iconfont type="file" size={30} />
          <p className="font-medium">{t('vp.subtitleSupport')}</p>
        </div>
      }
      handleDrop={async (dataTransfer) => {
        const file = dataTransfer.files[0]
        props.subtitleManager.addFileSubtitle(file)
      }}
      getPopupContainer={() =>
        window?.documentPictureInPicture?.window?.document?.body ??
        document.body
      }
    >
      <div>
        <SubtitleSelectionInner {...props} />
      </div>
    </FileDropper>
  )
})

export default SubtitleSelection
