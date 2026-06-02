/** Kleine helpers om YouTube-id, thumbnail en embed-URL uit een (niet-vermelde)
 *  YouTube-link te halen. Werkt voor shorts, watch- en youtu.be-vormen. */

export function youtubeId(url?: string | null): string | null {
  if (!url) return null
  const m = url.match(/(?:shorts\/|watch\?v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

export function youtubeThumb(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
}

export function youtubeEmbed(id: string): string {
  return `https://www.youtube.com/embed/${id}`
}
