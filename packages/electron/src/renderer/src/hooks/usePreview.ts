import { useState, useEffect, useCallback } from 'react'

export function usePreview() {
  const [status, setStatus] = useState<PreviewState['status']>('idle')
  const [error, setError] = useState<string | null>(null)
  const [output, setOutput] = useState<string[]>([])

  useEffect(() => {
    const unsub1 = window.api.godot.onPreviewStateChanged((state: PreviewState) => {
      setStatus(state.status)
      setError(state.error)
      setOutput(state.output)
    })
    const unsub2 = window.api.godot.onPreviewOutput((line: string) => {
      setOutput((prev) => [...prev.slice(-199), line])
    })
    return () => {
      unsub1()
      unsub2()
    }
  }, [])

  const startPreview = useCallback(async (projectPath: string) => {
    const result = await window.api.godot.startPreview(projectPath)
    setStatus(result.status)
  }, [])

  const stopPreview = useCallback(async () => {
    await window.api.godot.stopPreview()
  }, [])

  const clearOutput = useCallback(() => setOutput([]), [])

  return { status, error, output, startPreview, stopPreview, clearOutput }
}
