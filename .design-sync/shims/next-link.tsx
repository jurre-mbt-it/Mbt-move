// Sync-only shim: next/link needs the Next.js app-router context, which
// doesn't exist in design previews. Renders a plain anchor instead.
import * as React from 'react'
type Props = React.ComponentPropsWithoutRef<'a'> & { href?: unknown; prefetch?: boolean; scroll?: boolean; replace?: boolean }
export default function Link({ href, prefetch, scroll, replace, children, ...rest }: Props) {
  const h = typeof href === 'string' ? href : '#'
  return <a href={h} {...rest}>{children}</a>
}
