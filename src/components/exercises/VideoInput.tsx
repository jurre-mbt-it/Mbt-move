'use client'

import { useState, useRef, useCallback } from 'react'
import { VideoPlayer } from './VideoPlayer'
import { Upload, Link, X, Film, AlertCircle } from 'lucide-react'
import {
  P,
  DarkInput,
  DarkTabs,
  DarkTabsList,
  DarkTabsTrigger,
  DarkTabsContent,
  MetaLabel,
} from '@/components/dark-ui'

interface VideoInputProps {
  value: { mediaType: 'UPLOAD' | 'YOUTUBE' | 'VIMEO' | null; url: string }
  onChange: (v: { mediaType: 'UPLOAD' | 'YOUTUBE' | 'VIMEO' | null; url: string }) => void
}

function detectMediaType(url: string): 'YOUTUBE' | 'VIMEO' | null {
  if (/youtube\.com|youtu\.be/.test(url)) return 'YOUTUBE'
  if (/vimeo\.com/.test(url)) return 'VIMEO'
  return null
}

export function VideoInput({ value, onChange }: VideoInputProps) {
  const [dragging, setDragging] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [urlInput, setUrlInput] = useState(
    value.mediaType === 'YOUTUBE' || value.mediaType === 'VIMEO' ? value.url : '',
  )
  const fileRef = useRef<HTMLInputElement>(null)

  const handleUrlChange = (url: string) => {
    setUrlInput(url)
    const type = detectMediaType(url)
    if (type) onChange({ mediaType: type, url })
  }

  const handleFile = useCallback((_file: File) => {
    alert('Video uploaden is nog niet beschikbaar. Gebruik een YouTube of Vimeo link.')
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const clearVideo = () => {
    onChange({ mediaType: null, url: '' })
    setUrlInput('')
    setUploadProgress(null)
  }

  const activeTab =
    value.mediaType === 'UPLOAD'
      ? 'upload'
      : value.mediaType === 'YOUTUBE' || value.mediaType === 'VIMEO'
        ? 'url'
        : 'url'

  return (
    <div className="space-y-3">
      <DarkTabs defaultValue={activeTab}>
        <DarkTabsList>
          <DarkTabsTrigger value="upload" className="gap-2">
            <Upload className="w-3.5 h-3.5" /> UPLOAD
          </DarkTabsTrigger>
          <DarkTabsTrigger value="url" className="gap-2">
            <Link className="w-3.5 h-3.5" /> YOUTUBE / VIMEO
          </DarkTabsTrigger>
        </DarkTabsList>

        <DarkTabsContent value="upload">
          <div
            className="athletic-tap rounded-xl p-6 text-center cursor-pointer transition-colors"
            style={{
              border: `2px dashed ${dragging ? P.lime : P.lineStrong}`,
              background: dragging ? 'rgba(190,242,100,0.08)' : P.surface,
            }}
            onDragOver={e => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
            <Film
              className="w-8 h-8 mx-auto mb-2"
              style={{ color: P.inkMuted }}
            />
            <p
              style={{
                color: P.ink,
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: '0.02em',
              }}
            >
              SLEEP EEN VIDEO HIERNAARTOE
            </p>
            <p
              className="athletic-mono"
              style={{
                color: P.inkMuted,
                fontSize: 10,
                letterSpacing: '0.12em',
                fontWeight: 700,
                marginTop: 6,
              }}
            >
              MP4, MOV, WEBM · MAX 500 MB
            </p>
            <span
              className="athletic-mono inline-block rounded-lg mt-3"
              style={{
                background: P.surfaceHi,
                border: `1px solid ${P.lineStrong}`,
                color: P.ink,
                padding: '6px 14px',
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: '0.14em',
              }}
            >
              BESTAND KIEZEN
            </span>
          </div>

          {uploadProgress !== null && (
            <div className="mt-3 space-y-1.5">
              <div className="flex justify-between">
                <MetaLabel style={{ color: P.inkMuted }}>{value.url}</MetaLabel>
                <MetaLabel style={{ color: P.lime }}>{uploadProgress}%</MetaLabel>
              </div>
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ background: P.surfaceHi }}
              >
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%`, background: P.lime }}
                />
              </div>
              {uploadProgress < 100 && (
                <p
                  className="flex items-center gap-1"
                  style={{
                    color: P.gold,
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  <AlertCircle className="w-3 h-3" />
                  Upload werkt pas met een gekoppeld Supabase account
                </p>
              )}
            </div>
          )}
        </DarkTabsContent>

        <DarkTabsContent value="url" className="space-y-3">
          <div>
            <MetaLabel>YOUTUBE OF VIMEO URL</MetaLabel>
            <DarkInput
              placeholder="https://www.youtube.com/watch?v=..."
              value={urlInput}
              onChange={e => handleUrlChange(e.target.value)}
              className="mt-1.5"
            />
          </div>

          {(value.mediaType === 'YOUTUBE' || value.mediaType === 'VIMEO') && value.url && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <MetaLabel style={{ color: P.inkMuted }}>
                  {value.mediaType} PREVIEW
                </MetaLabel>
                <button
                  type="button"
                  onClick={clearVideo}
                  className="athletic-tap athletic-mono flex items-center gap-1"
                  style={{
                    color: P.danger,
                    fontSize: 10,
                    letterSpacing: '0.14em',
                    fontWeight: 900,
                    textTransform: 'uppercase',
                  }}
                >
                  <X className="w-3 h-3" /> VERWIJDEREN
                </button>
              </div>
              <VideoPlayer url={value.url} />
            </div>
          )}
        </DarkTabsContent>
      </DarkTabs>

      {value.mediaType === 'UPLOAD' && value.url && uploadProgress === null && (
        <div
          className="flex items-center justify-between rounded-lg"
          style={{
            background: P.surfaceHi,
            padding: '8px 12px',
            border: `1px solid ${P.line}`,
          }}
        >
          <span
            className="truncate"
            style={{ color: P.inkMuted, fontSize: 13 }}
          >
            {value.url}
          </span>
          <button
            type="button"
            onClick={clearVideo}
            className="athletic-tap"
            style={{ color: P.inkMuted }}
            aria-label="Verwijder"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
