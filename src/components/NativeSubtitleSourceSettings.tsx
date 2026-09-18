import { LoadingOutlined } from '@ant-design/icons'
import type { NetworkSubtitleProbe } from '@root/core/SubtitleManager/types'
import {
  createSubtitleAsset,
  deleteSubtitleAsset,
} from '@root/core/SubtitleSource/assets'
import {
  probeLinkedBilibiliSource,
  resolveCurrentBilibiliIdentity,
} from '@root/core/SubtitleSource/bilibili'
import { getSubtitleSourceBinding } from '@root/core/SubtitleSource/repository'
import { commitSubtitleSource } from '@root/core/SubtitleSource/commitSource'
import type {
  BilibiliVideoIdentity,
  SubtitleSourceDescriptor,
} from '@root/core/SubtitleSource/types'
import { type FC, useEffect, useRef, useState } from 'react'

type SourceType = SubtitleSourceDescriptor['type']

const sourceLabels: Array<{
  value: SourceType
  label: string
  description: string
}> = [
  {
    value: 'auto',
    label: '自动（推荐）',
    description: '优先使用当前视频当前分P的官方字幕',
  },
  {
    value: 'current-bilibili',
    label: '当前视频官方字幕',
    description: '固定语言轨道，轨道消失时停止加载',
  },
  {
    value: 'linked-bilibili',
    label: '另一个 B 站视频',
    description: '选择另一个视频及对应分P',
  },
  {
    value: 'direct-url',
    label: '网络字幕链接',
    description: 'SRT、ASS 或 B 站字幕 JSON 地址',
  },
  {
    value: 'local-file',
    label: '本地字幕文件',
    description: '保存此文件，之后自动用于当前分P',
  },
  { value: 'none', label: '关闭', description: '对当前分P明确禁用字幕' },
]

function sourceDescription(type: SourceType) {
  return sourceLabels.find((item) => item.value === type)?.description
}

const NativeSubtitleSourceSettings: FC = () => {
  const [identity, setIdentity] = useState<BilibiliVideoIdentity>()
  const [sourceType, setSourceType] = useState<SourceType>('auto')
  const [linkedUrl, setLinkedUrl] = useState('')
  const [directUrl, setDirectUrl] = useState('')
  const [offset, setOffset] = useState('0')
  const [probe, setProbe] = useState<NetworkSubtitleProbe>()
  const [selectedPart, setSelectedPart] = useState('')
  const [selectedTrack, setSelectedTrack] = useState('')
  const [localFile, setLocalFile] = useState<File>()
  const [existingLocalSource, setExistingLocalSource] =
    useState<Extract<SubtitleSourceDescriptor, { type: 'local-file' }>>()
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('正在识别当前视频与分P…')
  const requestId = useRef(0)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const current = await resolveCurrentBilibiliIdentity()
        if (!active) return
        setIdentity(current)
        const binding = await getSubtitleSourceBinding(current)
        if (!active) return
        if (binding) {
          const source = binding.source
          setSourceType(source.type)
          if ('offset' in source) setOffset(String(source.offset))
          if (source.type === 'direct-url') setDirectUrl(source.url)
          if (source.type === 'local-file') {
            setExistingLocalSource(source)
          }
          if (source.type === 'linked-bilibili') {
            const ref = source.bvid
              ? `BV${source.bvid.replace(/^BV/i, '')}`
              : `av${source.aid}`
            setLinkedUrl(
              `https://www.bilibili.com/video/${ref}/?p=${source.sourcePageAtBind}`,
            )
          }
          setStatus('已读取当前分P的字幕来源设置')
        } else {
          setStatus('当前分P未单独配置，将使用自动来源')
        }
      } catch (reason) {
        if (active) {
          setStatus(reason instanceof Error ? reason.message : String(reason))
        }
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
      requestId.current++
    }
  }, [])

  const readTracks = async (part?: number) => {
    const currentRequest = ++requestId.current
    setLoading(true)
    setStatus('正在读取字幕轨道…')
    try {
      const url =
        sourceType === 'current-bilibili' ? location.href : linkedUrl.trim()
      const result = await probeLinkedBilibiliSource(url, part)
      if (currentRequest !== requestId.current) return
      setProbe(result)
      setSelectedPart(
        String(result.selectedPart ?? result.parts[0]?.page ?? ''),
      )
      setSelectedTrack(result.tracks[0]?.value ?? '')
      setStatus(
        result.tracks.length
          ? `已读取 P${result.selectedPart} 的 ${result.tracks.length} 条字幕轨道`
          : `P${result.selectedPart} 暂无字幕，可选择其他分P`,
      )
    } catch (reason) {
      if (currentRequest === requestId.current) {
        setProbe(undefined)
        setStatus(reason instanceof Error ? reason.message : String(reason))
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }

  const save = async () => {
    if (!identity) return
    const offsetNumber = Number(offset)
    if (!Number.isFinite(offsetNumber)) {
      setStatus('字幕偏移必须是有效数字')
      return
    }
    setLoading(true)
    setStatus('正在保存…')
    let createdAssetId: string | undefined
    try {
      let source: SubtitleSourceDescriptor
      const current = await resolveCurrentBilibiliIdentity()
      if (current.aid !== identity.aid || current.cid !== identity.cid)
        throw new Error('视频已切换，请重新打开字幕设置')
      switch (sourceType) {
        case 'auto':
          source = { type: 'auto' }
          break
        case 'none':
          source = { type: 'none' }
          break
        case 'current-bilibili': {
          const track = probe?.tracks.find(
            (item) => item.value === selectedTrack,
          )
          if (!track) throw new Error('请先读取并选择当前视频的字幕轨道')
          if (probe?.selectedCid !== identity.cid) {
            throw new Error('当前分P CID 已变化，请关闭设置后重新打开')
          }
          source = {
            type: 'current-bilibili',
            language: track.language,
            offset: offsetNumber,
          }
          break
        }
        case 'linked-bilibili': {
          if (Number(selectedPart) !== probe?.selectedPart)
            throw new Error('请先读取所选分P的字幕轨道')
          const track = probe?.tracks.find(
            (item) => item.value === selectedTrack,
          )
          if (
            !track ||
            !probe?.aid ||
            !probe.selectedCid ||
            !probe.selectedPart
          ) {
            throw new Error('请先解析来源视频、分P和字幕轨道')
          }
          source = {
            type: 'linked-bilibili',
            aid: probe.aid,
            bvid: probe.bvid,
            sourceCid: probe.selectedCid,
            sourcePageAtBind: probe.selectedPart,
            language: track.language,
            offset: offsetNumber,
          }
          break
        }
        case 'direct-url': {
          const url = new URL(directUrl.trim())
          if (url.protocol !== 'https:' && url.protocol !== 'http:') {
            throw new Error('网络字幕仅支持 HTTP 或 HTTPS 链接')
          }
          source = {
            type: 'direct-url',
            url: url.href,
            offset: offsetNumber,
          }
          break
        }
        case 'local-file': {
          if (!localFile) {
            if (!existingLocalSource)
              throw new Error('请选择一个 SRT 或 ASS 字幕文件')
            source = { ...existingLocalSource, offset: offsetNumber }
            break
          }
          const asset = await createSubtitleAsset(localFile)
          createdAssetId = asset.id
          source = {
            type: 'local-file',
            assetId: asset.id,
            fileName: asset.fileName,
            format: asset.format,
            contentHash: asset.contentHash,
            offset: offsetNumber,
          }
          break
        }
      }
      await commitSubtitleSource(identity, source, createdAssetId)
      const previousAssetId = existingLocalSource?.assetId
      setExistingLocalSource(source.type === 'local-file' ? source : undefined)
      setLocalFile(undefined)
      let cleanupFailed = false
      if (
        previousAssetId &&
        (source.type !== 'local-file' || source.assetId !== previousAssetId)
      ) {
        try {
          await deleteSubtitleAsset(previousAssetId)
        } catch {
          cleanupFailed = true
        }
      }
      setStatus(
        cleanupFailed
          ? '已保存并应用；旧字幕文件清理失败，已保留，不影响播放'
          : '已保存，当前小窗会重新加载字幕',
      )
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }

  const currentTrack = probe?.tracks.find(
    (item) => item.value === selectedTrack,
  )

  return (
    <fieldset className="fc-setting-group fc-subtitle-source-settings">
      <legend>这个视频的字幕来源</legend>
      {identity ? (
        <div className="fc-video-identity">
          <strong>{identity.title || `av${identity.aid}`}</strong>
          <span>P{identity.page}</span>
        </div>
      ) : (
        <p>仅在 B 站视频页面中可配置当前分P的字幕来源。</p>
      )}

      <label className="fc-source-field">
        <span>来源</span>
        <select
          disabled={loading || !identity}
          value={sourceType}
          onChange={(event) => {
            requestId.current++
            setSourceType(event.target.value as SourceType)
            setProbe(undefined)
            setSelectedTrack('')
            setStatus(sourceDescription(event.target.value as SourceType) || '')
          }}
        >
          {sourceLabels.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <small>{sourceDescription(sourceType)}</small>
      </label>

      {sourceType === 'linked-bilibili' && (
        <label className="fc-source-field">
          <span>来源视频链接</span>
          <input
            value={linkedUrl}
            disabled={loading}
            placeholder="https://www.bilibili.com/video/BV…/?p=57"
            onChange={(event) => {
              requestId.current++
              setLinkedUrl(event.target.value)
              setProbe(undefined)
            }}
          />
        </label>
      )}

      {(sourceType === 'current-bilibili' ||
        sourceType === 'linked-bilibili') && (
        <>
          {!probe && (
            <button
              type="button"
              className="fc-form-button"
              disabled={
                loading ||
                (sourceType === 'linked-bilibili' && !linkedUrl.trim())
              }
              onClick={() => readTracks()}
            >
              {loading ? (
                <LoadingOutlined className="animate-spin" />
              ) : (
                '读取字幕轨道'
              )}
            </button>
          )}
          {sourceType === 'linked-bilibili' &&
            probe &&
            probe.parts.length > 1 && (
              <div className="fc-source-inline">
                <label className="fc-source-field">
                  <span>来源分P</span>
                  <select
                    value={selectedPart}
                    disabled={loading}
                    onChange={(event) => setSelectedPart(event.target.value)}
                  >
                    {probe.parts.map((part) => (
                      <option key={part.cid} value={part.page}>
                        {part.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="fc-form-button"
                  disabled={loading || !selectedPart}
                  onClick={() => readTracks(Number(selectedPart))}
                >
                  读取所选分P
                </button>
              </div>
            )}
          {!!probe?.tracks.length && (
            <label className="fc-source-field">
              <span>字幕轨道</span>
              <select
                value={selectedTrack}
                onChange={(event) => setSelectedTrack(event.target.value)}
              >
                {probe.tracks.map((track) => (
                  <option key={track.value} value={track.value}>
                    {track.label}
                  </option>
                ))}
              </select>
              {currentTrack?.language && <small>{currentTrack.language}</small>}
            </label>
          )}
        </>
      )}

      {sourceType === 'direct-url' && (
        <label className="fc-source-field">
          <span>字幕链接</span>
          <input
            value={directUrl}
            disabled={loading}
            placeholder="https://…/subtitle.srt"
            onChange={(event) => setDirectUrl(event.target.value)}
          />
        </label>
      )}

      {sourceType === 'local-file' && (
        <label className="fc-source-field">
          <span>字幕文件</span>
          <input
            key={existingLocalSource?.assetId ?? 'new-local-file'}
            type="file"
            accept=".srt,.ass"
            disabled={loading}
            onChange={(event) => setLocalFile(event.target.files?.[0])}
          />
          {existingLocalSource && !localFile && (
            <small>
              已保存：{existingLocalSource.fileName}
              ；可直接调整偏移，选择新文件可替换。
            </small>
          )}
        </label>
      )}

      {!['auto', 'none'].includes(sourceType) && (
        <label className="fc-source-field fc-source-offset">
          <span>时间偏移（秒）</span>
          <input
            type="number"
            step="0.1"
            value={offset}
            disabled={loading}
            onChange={(event) => setOffset(event.target.value)}
          />
        </label>
      )}

      <div className="fc-source-actions">
        <p className="fc-form-status" role="status">
          {status}
        </p>
        <button
          type="button"
          className="fc-form-button is-primary"
          disabled={loading || !identity}
          onClick={save}
        >
          保存当前分P
        </button>
      </div>
    </fieldset>
  )
}

export default NativeSubtitleSourceSettings
