import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowRight, ArrowUpRight, CalendarDays, CircleCheck, Code2, LoaderCircle, RefreshCw, Target, TrendingUp } from 'lucide-react'
import { getChallengeTree, getCodeforcesSkills, getCodeforcesSummary, getLinkedAccounts, getRecommendations, syncLinkedCodeforcesHistory, type ChallengeTree, type CodeforcesSummary, type SkillAssessment, type RecommendationsResponse } from './api'
import SkillAssessmentPanel from './SkillAssessmentPanel'
import Toast from './Toast'
import { CODEFORCES_HANDLE_KEY } from './storage'

const TopicChart = lazy(() => import('./TopicChart'))

export default function CodeforcesPanel({ session, onOpenRecommendations, onOpenRoadmap }: { session: Session; onOpenRecommendations: () => void; onOpenRoadmap: () => void }) {
  const [handle, setHandle] = useState(() => localStorage.getItem(CODEFORCES_HANDLE_KEY) ?? '')
  const [summary, setSummary] = useState<CodeforcesSummary | null>(null)
  const [assessment, setAssessment] = useState<SkillAssessment | null>(null)
  const [loading, setLoading] = useState(Boolean(localStorage.getItem(CODEFORCES_HANDLE_KEY)))
  const [skillsLoading, setSkillsLoading] = useState(Boolean(localStorage.getItem(CODEFORCES_HANDLE_KEY)))
  const [skillsError, setSkillsError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [recommendations, setRecommendations] = useState<RecommendationsResponse | null>(null)
  const [roadmap, setRoadmap] = useState<ChallengeTree | null>(null)

  useEffect(() => {
    let active = true
    getLinkedAccounts(session.access_token).then((data) => {
      if (!active) return
      const saved = data.accounts.find((account) => account.platform === 'codeforces')?.username ?? localStorage.getItem(CODEFORCES_HANDLE_KEY)
      if (!saved) { setLoading(false); setSkillsLoading(false); return }
      localStorage.setItem(CODEFORCES_HANDLE_KEY, saved)
      setHandle(saved)
      setLoading(true)
      setSkillsLoading(true)
      getCodeforcesSummary(saved)
      .then((data) => { if (active) setSummary(data) })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load saved history.') })
      .finally(() => { if (active) setLoading(false) })
      getCodeforcesSkills(saved)
      .then((data) => { if (active) setAssessment(data) })
      .catch((cause: unknown) => { if (active) setSkillsError(cause instanceof Error ? cause.message : 'Could not load skill estimates.') })
      .finally(() => { if (active) setSkillsLoading(false) })
    }).catch((cause: unknown) => { if (active) { setError(cause instanceof Error ? cause.message : 'Could not load linked account.'); setLoading(false); setSkillsLoading(false) } })
    return () => { active = false }
  }, [session.access_token])

  async function runSync(mode: 'refresh' | 'continue', event?: FormEvent) {
    event?.preventDefault()
    setError(null)
    setNotice(null)
    setSyncing(true)
    setSkillsError(null)
    setSkillsLoading(true)
    try {
      const selected = mode === 'continue' ? summary?.handle ?? handle.trim() : handle.trim()
      const result = await syncLinkedCodeforcesHistory(session.access_token, selected, mode)
      localStorage.setItem(CODEFORCES_HANDLE_KEY, result.handle)
      setHandle(result.handle)
      setSummary(await getCodeforcesSummary(result.handle))
      setAssessment(null)
      window.dispatchEvent(new Event('algomentor:sync'))
      try {
        setAssessment(await getCodeforcesSkills(result.handle))
      } catch (cause) {
        setSkillsError(cause instanceof Error ? cause.message : 'Could not load skill estimates.')
      }
      setNotice(`${result.new_submissions} new submissions saved. ${result.has_more ? 'Older pages remain; sync again to continue.' : 'Full available history imported.'}${result.rating_history_status === 'error' ? ' Rating history refresh will retry next sync.' : ''}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sync failed. Please try again.')
    } finally {
      window.dispatchEvent(new Event('algomentor:sync'))
      setSyncing(false)
      setSkillsLoading(false)
    }
  }

  const chartData = summary?.topic_distribution.slice(0, 8) ?? []

  useEffect(() => {
    if (!summary) return
    let active = true
    getChallengeTree(session.access_token).then((data) => {
      if (!active) return
      setRoadmap(data)
      if (!summary.has_more) {
        const assigned = new Set(data.nodes.flatMap((node) => node.challenges.map((challenge) => `${challenge.contest_id}:${challenge.problem_index}`)))
        getRecommendations(summary.handle, 10).then((result) => {
          if (active) setRecommendations({ ...result, recommendations: result.recommendations.filter((problem) => !assigned.has(`${problem.contest_id}:${problem.problem_index}`)) })
        }).catch(() => { if (active) setRecommendations(null) })
      }
    }).catch(() => { if (active) setRoadmap(null) })
    return () => { active = false }
  }, [summary, session.access_token])

  const activity = useMemo(() => {
    const counts = new Map<string, number>()
    for (const problem of summary?.solved_problems ?? []) {
      const day = problem.solved_at.slice(0, 10)
      counts.set(day, (counts.get(day) ?? 0) + 1)
    }
    return Array.from({ length: 84 }, (_, index) => {
      const date = new Date()
      date.setDate(date.getDate() - 83 + index)
      const key = date.toISOString().slice(0, 10)
      return { key, count: counts.get(key) ?? 0 }
    })
  }, [summary])

  return <div className="mt-9 space-y-6">
    <section className="ui-card relative overflow-hidden p-6 sm:p-8">
      <div className="pointer-events-none absolute -right-14 -top-24 size-72 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-3"><div><p className="ui-eyebrow">Codeforces connection</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">{summary ? `Tracking @${summary.handle}` : 'Connect your coding history'}</h2><p className="mt-2 text-sm text-slate-400">Import your public profile and submissions to see evidence-based insights.</p></div>{summary?.synced_at && <span className="ui-badge">Synced {new Date(summary.synced_at).toLocaleDateString()}</span>}</div>
      <form onSubmit={(event) => runSync('refresh', event)} className="mt-6 flex flex-col gap-3 sm:flex-row">
        <label htmlFor="cf-handle" className="sr-only">Codeforces username</label>
        <input id="cf-handle" value={handle} onChange={(event) => setHandle(event.target.value)} required maxLength={24} pattern="[A-Za-z0-9_.-]+" autoComplete="off" placeholder="Your Codeforces handle" className="ui-input min-w-0 flex-1" />
        <button type="submit" disabled={syncing} className="ui-button ui-button-primary disabled:opacity-60">{syncing ? <LoaderCircle size={17} className="animate-spin" /> : <RefreshCw size={17} />}{syncing ? 'Syncing…' : summary ? 'Refresh history' : 'Connect handle'}</button>
      </form>
      <p className="mt-3 text-xs text-slate-500">Large histories may need several syncs. No private submissions or source code are fetched.</p>
      {error && <p role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
      {notice && <Toast message={notice} onDismiss={() => setNotice(null)} />}
    </section>

    {loading && <div role="status" className="grid gap-4 sm:grid-cols-3"><span className="sr-only">Loading saved Codeforces history…</span>{[0,1,2].map((item) => <div key={item} className="ui-skeleton h-32" />)}</div>}
    {!loading && !summary && <div className="ui-card border-dashed p-10 text-center"><Code2 size={28} className="mx-auto text-violet-300" /><h3 className="mt-4 text-lg font-semibold">Your dashboard starts with your history</h3><p className="mx-auto mt-2 max-w-md text-sm text-slate-400">Connect a public handle above to see your real solves, topic strengths, practice suggestions, and roadmap progress.</p></div>}
    {summary && <>
      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Problems solved" value={summary.solved_count.toLocaleString()} detail="Distinct accepted problems" icon={CircleCheck} />
        <Stat label="Current rating" value={summary.rating?.toLocaleString() ?? 'Unrated'} detail={summary.rank ?? 'Codeforces profile'} icon={TrendingUp} />
        <Stat label="Submissions" value={summary.total_submissions.toLocaleString()} detail={summary.has_more ? 'Older pages available' : 'Imported history'} icon={Target} />
      </section>
      <section className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <div className="ui-card p-6"><div className="flex items-center justify-between"><div><p className="ui-eyebrow">Consistency</p><h3 className="mt-2 text-lg font-semibold">Coding activity</h3></div><CalendarDays size={19} className="text-violet-300" /></div><p className="mt-1 text-xs text-slate-500">Accepted problems from the latest 100 distinct solves · last 12 weeks</p><div className="mt-7 grid grid-flow-col grid-rows-7 gap-1.5 overflow-x-auto" aria-label="Coding activity for the last 84 days">{activity.map((day) => <span key={day.key} title={`${day.key}: ${day.count} solved`} aria-label={`${day.key}: ${day.count} solved`} className={`size-3.5 rounded-[4px] sm:size-4 ${day.count === 0 ? 'bg-[#2d2b3a]' : day.count === 1 ? 'bg-violet-900' : day.count === 2 ? 'bg-violet-600' : 'bg-violet-400'}`} />)}</div><p className="mt-5 text-xs text-slate-500">Activity shown only for available imported solves.</p></div>
        <div className="ui-card p-6"><div className="flex items-center justify-between"><div><p className="ui-eyebrow">Learning path</p><h3 className="mt-2 text-lg font-semibold">Verified roadmap progress</h3></div><button type="button" onClick={onOpenRoadmap} className="text-violet-300 hover:text-violet-200" aria-label="Open roadmap"><ArrowUpRight size={18} /></button></div>{roadmap ? <><p className="mt-6 text-3xl font-semibold">{roadmap.completed_count}<span className="text-lg text-slate-500"> / {roadmap.total_count}</span></p><div className="ui-progress mt-4"><span style={{ width: `${roadmap.total_count ? 100 * roadmap.completed_count / roadmap.total_count : 0}%` }} /></div><p className="mt-4 text-sm text-slate-400">{roadmap.recommended_key ? `Next: ${roadmap.nodes.find((item) => item.key === roadmap.recommended_key)?.title ?? 'Ready topic'}` : 'All topics completed'}</p></> : <p className="mt-7 text-sm text-slate-400">Roadmap progress is unavailable right now. Open the roadmap to retry.</p>}</div>
      </section>
      {recommendations?.recommendations.length ? <section className="ui-card p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="ui-eyebrow">Chosen for your next session</p><h3 className="mt-2 text-lg font-semibold">Smart recommendations</h3></div><button type="button" onClick={onOpenRecommendations} className="ui-button ui-button-secondary">View all <ArrowRight size={15} /></button></div><div className="mt-5 grid gap-3 md:grid-cols-2">{recommendations.recommendations.slice(0, 2).map((problem) => <a key={`${problem.contest_id}-${problem.problem_index}`} href={problem.url} target="_blank" rel="noreferrer" className="ui-card ui-card-hover block p-4"><span className="ui-badge">{problem.rating ?? 'Unrated'}</span><p className="mt-3 font-semibold">{problem.name} <ArrowUpRight size={15} className="inline text-violet-300" /></p><p className="mt-1 text-xs text-slate-400">{problem.target_topic} · {problem.contest_id}{problem.problem_index}</p><p className="mt-3 text-xs text-slate-400">{problem.rationale[0]}</p></a>)}</div></section> : null}
      {summary.has_more && <button type="button" disabled={syncing} onClick={() => runSync('continue')} className="rounded-xl border border-indigo-400/30 px-4 py-2.5 text-sm font-medium text-indigo-200 hover:bg-indigo-400/10 disabled:opacity-60">Load older submissions</button>}
      <SkillAssessmentPanel assessment={assessment} loading={skillsLoading} error={skillsError} />
      <section className="grid gap-5 xl:grid-cols-[1fr_1.3fr]">
        <div className="ui-card p-6"><p className="ui-eyebrow">Topic coverage</p><h3 className="mt-2 text-lg font-semibold">Where you have solved</h3><p className="mt-1 text-xs text-slate-500">Each accepted problem counts once per tag.</p>{chartData.length ? <Suspense fallback={<div className="ui-skeleton mt-6 h-72" />}><TopicChart data={chartData} /></Suspense> : <p className="mt-8 text-sm text-slate-400">No accepted tagged problems in the imported history.</p>}</div>
        <div className="ui-card p-6"><p className="ui-eyebrow">Recent achievements</p><h3 className="mt-2 text-lg font-semibold">Solved problems</h3><p className="mt-1 text-xs text-slate-500">Most recent 100 distinct accepted problems.</p>{summary.solved_problems.length ? <ul className="mt-5 max-h-80 divide-y divide-white/10 overflow-auto">{summary.solved_problems.map((problem) => <li key={`${problem.contest_id}-${problem.problem_index}`} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{problem.name}</p><p className="mt-1 text-xs text-slate-500">{problem.contest_id}{problem.problem_index} · {problem.rating ?? 'Unrated'} · {problem.tags.slice(0, 2).join(', ') || 'No tags'}</p></div><a href={problem.url} target="_blank" rel="noreferrer" aria-label={`Open ${problem.name} on Codeforces`} className="shrink-0 rounded-lg p-2 text-violet-300 hover:bg-violet-400/10"><ArrowUpRight size={17} /></a></li>)}</ul> : <p className="mt-8 text-sm text-slate-400">No accepted problems in the imported history.</p>}</div>
      </section>
    </>}
  </div>
}

function Stat({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof CircleCheck }) {
  return <div className="ui-card p-5"><div className="flex items-center justify-between"><p className="ui-eyebrow">{label}</p><Icon size={18} className="text-violet-300" /></div><p className="mt-5 truncate text-3xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-slate-400">{detail}</p></div>
}
