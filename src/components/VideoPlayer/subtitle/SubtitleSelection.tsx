import {
  CheckOutlined,
  FileAddOutlined,
  LoadingOutlined,
} from '@ant-design/icons'
import configStore, { updateConfig, openSettingPanel } from '@root/store/config'
import { SwitchField, RangeField } from '../../PlayerSettingsFields'
import Dropdown from '@root/components/Dropdown'
import AiSubtitleControls from '@root/components/AiSubtitleControls'
import FileDropper from '@root/components/FileDropper'
import Iconfont from '@root/components/Iconfont'
import ActionButton from '@root/components/VideoPlayerV2/bottomPanel/ActionButton'
import vpContext from '@root/components/VideoPlayerV2/context'
import { PlayerEvent } from '@root/core/event'
import type SubtitleManager from '@root/core/SubtitleManager'
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
      playerMenu
      menuRender={(close) => <Menu {...props} close={close} />}
      getPopupContainer={(node) =>
        videoPlayerRef.current || node.ownerDocument.body!
      }
    >
      <ActionButton
        isUnActive={!subtitleManager.showSubtitle}
        aria-label="字幕"
        aria-pressed={subtitleManager.showSubtitle}
        title="字幕"
      >
        <Iconfont type="subtitle" size={18} />
      </ActionButton>
    </Dropdown>
  )
})

const Menu: FC<Props & { close: () => void }> = observer((props) => {
  const { subtitleManager } = props
  const activeLabel = subtitleManager.activeSubtitleLabel
  const [showNetworkLoader, setShowNetworkLoader] = useState(false)
  const { videoPlayerRef } = useContext(vpContext)
  return (
    <div
      className={classNames(
        'fc-menu fc-subtitle-menu custom-scrollbar',
        showNetworkLoader && 'is-expanded',
      )}
    >
      {showNetworkLoader ? (
        <>
          <button
            type="button"
            className="fc-menu-item"
            onClick={() => setShowNetworkLoader(false)}
          >
            ‹ 返回字幕
          </button>
          <NetworkSubtitleLoader subtitleManager={subtitleManager} />
        </>
      ) : (
        <>
          <SwitchField
            label="显示字幕"
            checked={subtitleManager.showSubtitle}
            onChange={(value) => {
              if (
                value &&
                !subtitleManager.activeSubtitleLabel &&
                subtitleManager.subtitleItems.length
              ) {
                subtitleManager.useSubtitle(
                  subtitleManager.subtitleItems[0].label,
                )
              }
              subtitleManager.showSubtitle = value
            }}
          />
          <AiSubtitleControls />
          {!subtitleManager.subtitleItems.length && (
            <p className="fc-menu-empty">暂无可用字幕，可导入或关联视频</p>
          )}
          {subtitleManager.subtitleItems.map((subtitleItem, i) => (
            <button
              type="button"
              key={`${subtitleItem.value}-${i}`}
              className={classNames(
                'fc-menu-item',
                activeLabel === subtitleItem.label && 'is-active',
              )}
              onClick={() => {
                subtitleManager.useSubtitle(subtitleItem.label)
                subtitleManager.showSubtitle = true
                props.close()
              }}
            >
              {activeLabel === subtitleItem.label && <CheckOutlined />}
              {subtitleItem.label}
            </button>
          ))}
          <div className="fc-menu-divider" />
          <SwitchField
            label="历史字幕"
            checked={configStore.subtitle_historyEnabled}
            onChange={(value) => {
              void updateConfig({ subtitle_historyEnabled: value }, true)
            }}
          />
          <RangeField
            label="历史段数"
            value={configStore.subtitle_historyCount}
            min={1}
            max={5}
            onChange={(value) => {
              void updateConfig({ subtitle_historyCount: value }, true)
            }}
          />
          <label className="fc-menu-action">
            <FileAddOutlined />
            <span>导入字幕文件</span>
            <input
              className="fc-file-input"
              type="file"
              accept=".srt,.ass"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) subtitleManager.addFileSubtitle(file)
              }}
            />
          </label>
          <button
            type="button"
            className="fc-menu-item"
            onClick={() => setShowNetworkLoader(true)}
          >
            临时导入链接 <span>›</span>
          </button>
          <button
            type="button"
            className="fc-menu-item"
            onClick={() => {
              props.close()
              openSettingPanel({
                renderTarget: videoPlayerRef.current ?? undefined,
                category: 'subtitle',
              })
            }}
          >
            字幕设置与视频关联 <span>›</span>
          </button>
        </>
      )}
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
    if (probe?.parts.length && Number(selectedPart) !== probe.selectedPart)
      return setError('请先读取所选分P的字幕轨道')
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
    <div className="fc-network-subtitle-form">
      <label>
        <span>视频或字幕链接</span>
        <input
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
      </label>
      <label title={t('vp.subtitleOffsetTips')}>
        <span>{t('vp.subtitleOffset')}</span>
        <input
          disabled={loading}
          type="number"
          step="0.1"
          value={offset}
          onChange={(event) => setOffset(event.target.value)}
        />
      </label>
      {!probe && (
        <button
          className="fc-form-button"
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
      {probe && probe.parts.length > 1 && (
        <>
          <label>
            <span>{t('vp.selectSubtitlePart')}</span>
            <select
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
          </label>
          <button
            className="fc-form-button"
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
          <label>
            <span>{t('vp.selectSubtitleTrack')}</span>
            <select
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
          </label>
          <button
            className="fc-form-button is-primary"
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
      {probe && !probe.tracks.length && !loading && (
        <p className="fc-form-status" role="status">
          P{probe.selectedPart} 暂无字幕，可选择其他分P
        </p>
      )}
      {loadedLabel && (
        <p className="fc-form-status is-success" role="status">
          <CheckOutlined /> {t('vp.networkSubtitleLoaded')}: {loadedLabel}
        </p>
      )}
      {error && (
        <p className="fc-form-status is-error" role="alert">
          {error}
        </p>
      )}
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
