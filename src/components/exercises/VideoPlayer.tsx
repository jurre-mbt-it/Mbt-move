'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Play } from 'lucide-react'

// Load react-player only on client to avoid SSR issues
const ReactPlayer = dynamic(() => import('react-player'), { ssr: false })

interface VideoPlayerProps {
  url: string
  className?: string
}

export function VideoPlayer({ url, className }: VideoPlayerProps) {
  const [playing, setPlaying] = useState(false)
  const [ready, setReady] = useState(false)

  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-black ${className ?? ''}`}
      style={{ aspectRatio: '16/9' }}
    >
      <ReactPlayer
        url={url}
        width="100%"
        height="100%"
        playing={playing}
        controls
        onReady={() => setReady(true)}
        style={{ position: 'absolute', top: 0, left: 0 }}
        config={{
          youtube: { playerVars: { modestbranding: 1, rel: 0 } },
          vimeo: { playerOptions: { byline: false, portrait: false } },
        }}
      />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center cursor-pointer transition-transform hover:scale-110"
            style={{ background: '#3ECF6A' }}
            onClick={() => setPlaying(true)}
          >
            <Play className="w-6 h-6 text-white ml-1" />
          </div>
        </div>
      )}
    </div>
  )
}
