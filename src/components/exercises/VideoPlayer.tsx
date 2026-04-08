'use client'

interface VideoPlayerProps {
  url: string
  className?: string
}

function getYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/)
  return match ? match[1] : null
}

function getVimeoId(url: string): string | null {
  const match = url.match(/vimeo\.com\/(\d+)/)
  return match ? match[1] : null
}

export function VideoPlayer({ url, className }: VideoPlayerProps) {
  const youtubeId = getYouTubeId(url)
  const vimeoId = getVimeoId(url)

  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-black ${className ?? ''}`}
      style={{ aspectRatio: '16/9' }}
    >
      {youtubeId ? (
        <iframe
          src={`https://www.youtube.com/embed/${youtubeId}?modestbranding=1&rel=0`}
          title="Video player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
        />
      ) : vimeoId ? (
        <iframe
          src={`https://player.vimeo.com/video/${vimeoId}`}
          title="Video player"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full border-0"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white/50 text-sm">
          Geen geldige video URL
        </div>
      )}
    </div>
  )
}
