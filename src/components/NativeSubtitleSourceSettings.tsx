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
import {
  getSubtitleSourceBinding,
  saveSubtitleSourceBinding,
} from '@root/core/SubtitleSource/repository'
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
    description: '按来源 CID 绑定，不受分P排序变化影响',
  },
  {
    value: 'direct-url',
    label: '网络字幕链接',
    description: 'SRT、ASS 或 B 站字幕 JSON 地址',
  },
  {
    value: 'local-file',
    label: '本地字幕文件',
    description: '字幕正文保存在扩展本地数据库',
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
  const [existingLocalAssetId, setExistingLocalAssetId] = useState('')
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
            setExistingLocalAssetId(source.assetId)
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
        result.needsPartSelection
          ? '该链接没有指定分P，请选择后继续'
          : `已读取 ${result.tracks.length} 条字幕轨道`,
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
    try {
      let source: SubtitleSourceDescriptor
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
            throw new Error('请选择一个 SRT 或 ASS 字幕文件')
          }
          const asset = await createSubtitleAsset(localFile)
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
      await saveSubtitleSourceBinding(identity, source)
      if (
        existingLocalAssetId &&
        (source.type !== 'local-file' ||
          source.assetId !== existingLocalAssetId)
      ) {
        await deleteSubtitleAsset(existingLocalAssetId)
        setExistingLocalAssetId('')
      }
      if (source.type === 'local-file') {
        setExistingLocalAssetId(source.assetId)
      }
      setStatus('已保存；下次打开小窗时生效')
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
      <legend>原生小窗字幕来源</legend>
      {identity ? (
        <div className="fc-video-identity">
          <strong>{identity.title || `av${identity.aid}`}</strong>
          <span>
            P{identity.page} · CID {identity.cid}
          </span>
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
          {probe?.needsPartSelection && (
            <div className="fc-source-inline">
              <label className="fc-source-field">
                <span>来源分P</span>
                <select
                  value={selectedPart}
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
            type="file"
            accept=".srt,.ass"
            disabled={loading}
            onChange={(event) => setLocalFile(event.target.files?.[0])}
          />
          {existingLocalAssetId && !localFile && (
            <small>已保存本地字幕；选择新文件可替换。</small>
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
