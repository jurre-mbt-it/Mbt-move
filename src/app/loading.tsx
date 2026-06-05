import { AppLoader } from '@/components/AppLoader'

// Wordt automatisch getoond als Suspense-fallback tijdens het laden van een
// route. In de iOS-webview is dit het eerste wat je ziet terwijl de app boot.
export default function Loading() {
  return <AppLoader />
}
