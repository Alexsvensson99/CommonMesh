import { useEffect, useState } from 'react'
import { coordinationStore } from '../store/coordinationStore'
import { registerCommonMeshTools } from './tools'

export type WebMCPStatus = {
  state: 'checking' | 'connected' | 'unavailable' | 'error'
  toolCount: number
  detail: string
}

const initialStatus: WebMCPStatus = {
  state: 'checking',
  toolCount: 0,
  detail: 'Looking for document.modelContext…',
}

export function useWebMCP() {
  const [status, setStatus] = useState<WebMCPStatus>(initialStatus)

  useEffect(() => {
    let disposed = false
    let unregister: (() => void) | undefined
    let attempts = 0
    const lifecycleController = new AbortController()

    const register = async () => {
      if (disposed || unregister) return true
      const modelContext = document.modelContext
      if (!modelContext) return false

      try {
        const registration = await registerCommonMeshTools(
          modelContext,
          coordinationStore,
          lifecycleController.signal,
        )
        if (disposed) {
          registration.unregister()
          return true
        }
        unregister = registration.unregister
        setStatus({
          state: 'connected',
          toolCount: registration.count,
          detail: `${registration.count} structured tools are live`,
        })
        coordinationStore.recordActivity(
          'system',
          'webmcp_connected',
          'WebMCP connected to the shared workspace',
          `${registration.count} structured tools registered on this page`,
          'info',
        )
        return true
      } catch (error) {
        if (!disposed) {
          setStatus({
            state: 'error',
            toolCount: 0,
            detail:
              'WebMCP tools could not be registered. Reload or use a supported browser.',
          })
          coordinationStore.recordActivity(
            'system',
            'webmcp_registration',
            'WebMCP registration failed',
            error instanceof Error ? error.name : 'REGISTRATION_ERROR',
            'failed',
          )
        }
        return true
      }
    }

    void register()
    const timer = window.setInterval(() => {
      attempts += 1
      void register().then((finished) => {
        if (finished) window.clearInterval(timer)
        if (!finished && attempts >= 8 && !disposed) {
          window.clearInterval(timer)
          setStatus({
            state: 'unavailable',
            toolCount: 0,
            detail: 'Open in ChatGPT or WebMCP-enabled Chrome',
          })
        }
      })
    }, 750)

    return () => {
      disposed = true
      window.clearInterval(timer)
      lifecycleController.abort()
      unregister?.()
    }
  }, [])

  return status
}
