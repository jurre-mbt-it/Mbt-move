'use client'

import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { VideoPlayer } from './VideoPlayer'
import { Upload, Link, X, Film, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

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
    value.mediaType === 'YOUTUBE' || value.mediaType === 'VIMEO' ? value.url : ''
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

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const clearVideo = () => {
    onChange({ mediaType: null, url: '' })
    setUrlInput('')
    setUploadProgress(null)
  }

  const activeTab = value.mediaType === 'UPLOAD' ? 'upload'
    : (value.mediaType === 'YOUTUBE' || value.mediaType === 'VIMEO') ? 'url'
    : 'url'

  return (
    <div className="space-y-3">
      <Tabs defaultValue={activeTab}>
        <TabsList>
          <TabsTrigger value="upload" className="gap-2">
            <Upload className="w-4 h-4" /> Upload
          </TabsTrigger>
          <TabsTrigger value="url" className="gap-2">
            <Link className="w-4 h-4" /> YouTube / Vimeo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="mt-3">
          <div
            className={cn(
              'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
              dragging ? 'border-[#BEF264] bg-[#BEF26410]' : 'border-[rgba(255,255,255,0.12)] hover:border-[#BEF264] hover:bg-[#BEF26405]'
            )}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
            <Film className="w-10 h-10 mx-auto mb-3 text-[#7B8889]" />
            <p className="font-medium text-sm">Sleep een video hiernaartoe</p>
            <p className="text-xs text-muted-foreground mt-1">MP4, MOV, WebM • max 500 MB</p>
            <Button variant="outline" size="sm" className="mt-3" type="button">
              Bestand kiezen
            </Button>
          </div>

          {uploadProgress !== null && (
            <div className="mt-3 space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{value.url}</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-1.5 bg-[#1C2425] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%`, background: '#BEF264' }}
                />
              </div>
              {uploadProgress < 100 && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Upload werkt pas met een gekoppeld Supabase account
                </p>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="url" className="mt-3 space-y-3">
          <div>
            <Label htmlFor="video-url">YouTube of Vimeo URL</Label>
            <Input
              id="video-url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={urlInput}
              onChange={e => handleUrlChange(e.target.value)}
              className="mt-1.5"
            />
          </div>

          {(value.mediaType === 'YOUTUBE' || value.mediaType === 'VIMEO') && value.url && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground capitalize">
                  {value.mediaType} preview
                </span>
                <button type="button" onClick={clearVideo} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1">
                  <X className="w-3 h-3" /> Verwijderen
                </button>
              </div>
              <VideoPlayer url={value.url} />
            </div>
          )}
        </TabsContent>
      </Tabs>

      {value.mediaType === 'UPLOAD' && value.url && uploadProgress === null && (
        <div className="flex items-center justify-between text-sm bg-[#1C2425] rounded-lg px-3 py-2">
          <span className="text-muted-foreground truncate">{value.url}</span>
          <button type="button" onClick={clearVideo}>
            <X className="w-4 h-4 text-muted-foreground hover:text-destructive" />
          </button>
        </div>
      )}
    </div>
  )
}
