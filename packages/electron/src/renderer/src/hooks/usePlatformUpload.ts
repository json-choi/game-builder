import { useState, useCallback } from 'react'

type UploadStatus = 'idle' | 'uploading' | 'success' | 'error'

interface UploadState {
  status: UploadStatus
  progress: string[]
  error: string | null
  gameUrl: string | null
}

const API_URL = 'https://godot-play-platform.vercel.app'

export function usePlatformUpload() {
  const [state, setState] = useState<UploadState>({
    status: 'idle',
    progress: [],
    error: null,
    gameUrl: null,
  })

  const upload = useCallback(async (projectPath: string) => {
    setState({
      status: 'uploading',
      progress: ['Starting upload...'],
      error: null,
      gameUrl: null,
    })

    try {
      const result = await window.api.godot.uploadToPlatform(projectPath, API_URL, (message: string) => {
        setState((prev) => ({
          ...prev,
          progress: [...prev.progress, message],
        }))
      })

      if (result.success) {
        setState({
          status: 'success',
          progress: [...state.progress, 'Upload completed!'],
          error: null,
          gameUrl: result.gameUrl || null,
        })
      } else {
        setState({
          status: 'error',
          progress: [...state.progress, `Error: ${result.error}`],
          error: result.error || 'Upload failed',
          gameUrl: null,
        })
      }

      return result
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setState({
        status: 'error',
        progress: [...state.progress, `Error: ${errorMsg}`],
        error: errorMsg,
        gameUrl: null,
      })
      return { success: false, error: errorMsg }
    }
  }, [])

  const reset = useCallback(() => {
    setState({
      status: 'idle',
      progress: [],
      error: null,
      gameUrl: null,
    })
  }, [])

  return {
    status: state.status,
    progress: state.progress,
    error: state.error,
    gameUrl: state.gameUrl,
    upload,
    reset,
  }
}
