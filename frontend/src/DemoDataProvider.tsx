import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AnalyticsResponse, ChallengeTree, RecommendationsResponse } from './api'
import { buildDemoAnalytics, buildDemoRecommendations, buildDemoTree, isInitiallySolved, validDemoChallenge } from './demoData'

const ACTIVE_KEY = 'algomentor:demo-active'
const SOLVES_KEY = 'algomentor:demo-solves'

function readSolves(): Set<string> {
  try {
    const value = JSON.parse(sessionStorage.getItem(SOLVES_KEY) ?? '[]')
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && validDemoChallenge(item) && !isInitiallySolved(item)) : [])
  } catch { return new Set() }
}

type DemoContextValue = {
  active: boolean
  tree: ChallengeTree
  recommendations: RecommendationsResponse
  analytics: (period: 'daily' | 'weekly' | 'monthly') => AnalyticsResponse
  enter: () => void
  exit: () => void
  reset: () => void
  simulate: (topic: string, tier: string) => void
}

const DemoContext = createContext<DemoContextValue | null>(null)

export function DemoDataProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(() => {
    try { return sessionStorage.getItem(ACTIVE_KEY) === '1' } catch { return false }
  })
  const [simulated, setSimulated] = useState(readSolves)
  useEffect(() => {
    try {
      if (active) sessionStorage.setItem(SOLVES_KEY, JSON.stringify([...simulated]))
    } catch { /* Demo still works when session storage is unavailable. */ }
  }, [active, simulated])

  const tree = useMemo(() => buildDemoTree(simulated), [simulated])
  const recommendations = useMemo(() => buildDemoRecommendations(tree), [tree])
  const value: DemoContextValue = {
    active, tree, recommendations,
    analytics: (period) => buildDemoAnalytics(simulated, period),
    enter: () => {
      try { sessionStorage.setItem(ACTIVE_KEY, '1') } catch { /* In-memory mode remains usable. */ }
      setActive(true)
    },
    exit: () => {
      try { sessionStorage.removeItem(ACTIVE_KEY); sessionStorage.removeItem(SOLVES_KEY) } catch { /* In-memory state is cleared below. */ }
      setSimulated(new Set())
      setActive(false)
    },
    reset: () => {
      try { sessionStorage.removeItem(SOLVES_KEY) } catch { /* In-memory state is cleared below. */ }
      setSimulated(new Set())
    },
    simulate: (topic, tier) => {
      const key = `${topic}:${tier}`
      if (!validDemoChallenge(key) || isInitiallySolved(key)) return
      setSimulated((current) => new Set([...current, key]))
    },
  }
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>
}

export function useDemoData() {
  const demo = useContext(DemoContext)
  if (!demo) throw new Error('DemoDataProvider is missing')
  return demo
}
