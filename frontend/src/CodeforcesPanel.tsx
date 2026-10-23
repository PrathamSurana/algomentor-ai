import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react'
import { ArrowUpRight, LoaderCircle, RefreshCw } from 'lucide-react'
import { getCodeforcesSummary, syncCodeforces, type CodeforcesSummary } from './api'

const STORAGE_KEY = 'algomentor_codeforces_handle'
const TopicChart = lazy(() => import('./TopicChart'))

export default function CodeforcesPanel() {
  const [handle, setHandle] = useState(() => localStorage.getItem(STORAGE_KEY) ?? '')
  const [summary, setSummary] = useState<CodeforcesSummary | null>(null)
  const [loading, setLoading] = useState(Boolean(localStorage.getItem(STORAGE_KEY)))
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return
    let active = true
    getCodeforcesSummary(saved)
      .then((data) => { if (active) setSummary(data) })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load saved history.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function runSync(mode: 'refresh' | 'continue', event?: FormEvent) {
    event?.preventDefault()
    setError(null)
    setNotice(null)
    setSyncing(true)
    try {
      const result = await syncCodeforces(mode === 'continue' ? summary?.handle ?? handle.trim() : handle.trim(), mode)
      localStorage.setItem(STORAGE_KEY, result.handle)
      setHandle(result.handle)
      setSummary(await getCodeforcesSummary(result.handle))
      setNotice(`${result.new_submissions} new submissions saved. ${result.has_more ? 'Older pages are available.' : 'History is up to date.'}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sync failed. Please try again.')
    } finally {
      setSyncing(false)
    }
  }

  const chartData = summary?.topic_distribution.slice(0, 8) ?? []

  return <div className="mt-9 space-y-6">
    <section className="rounded-2xl border border-white/10 bg-[#111929] p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">Public Codeforces history</p><h2 className="mt-2 text-2xl font-semibold">Connect a handle</h2><p className="mt-2 text-sm text-slate-400">Import public profile, submissions, and problem metadata from the official API.</p></div>{summary?.synced_at && <span className="text-xs text-slate-500">Last sync {new Date(summary.synced_at).toLocaleString()}</span>}</div>
      <form onSubmit={(event) => runSync('refresh', event)} className="mt-6 flex flex-col gap-3 sm:flex-row">
        <label htmlFor="cf-handle" className="sr-only">Codeforces username</label>
        <input id="cf-handle" value={handle} onChange={(event) => setHandle(event.target.value)} required maxLength={24} pattern="[A-Za-z0-9_.-]+" autoComplete="off" placeholder="Codeforces username" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-400" />
        <button type="submit" disabled={syncing} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60">{syncing ? <LoaderCircle size={17} className="animate-spin" /> : <RefreshCw size={17} />}{syncing ? 'Syncing…' : 'Sync history'}</button>
      </form>
      <p className="mt-3 text-xs text-slate-500">Large histories may need several syncs. No private submissions or source code are fetched.</p>
      {error && <p role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-200">{notice}</p>}
    </section>

    {loading && <div role="status" className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#111929] p-6 text-sm text-slate-300"><LoaderCircle size={18} className="animate-spin" /> Loading saved Codeforces history…</div>}
    {!loading && !summary && <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.025] p-8 text-center text-sm text-slate-400">No Codeforces history loaded yet. Enter a public handle and sync to see real results.</div>}
    {summary && <>
      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Handle" value={summary.handle} detail={summary.rank ?? 'Unrated'} />
        <Stat label="Solved problems" value={String(summary.solved_count)} detail="Distinct accepted problems" />
        <Stat label="Submissions" value={String(summary.total_submissions)} detail={summary.has_more ? 'Older pages available' : 'Imported history'} />
      </section>
      {summary.has_more && <button type="button" disabled={syncing} onClick={() => runSync('continue')} className="rounded-xl border border-indigo-400/30 px-4 py-2.5 text-sm font-medium text-indigo-200 hover:bg-indigo-400/10 disabled:opacity-60">Load older submissions</button>}
      <section className="grid gap-5 xl:grid-cols-[1fr_1.3fr]">
        <div className="rounded-2xl border border-white/10 bg-[#111929] p-6"><h3 className="text-lg font-semibold">Topic distribution</h3><p className="mt-1 text-xs text-slate-500">Each accepted problem counts once per tag.</p>{chartData.length ? <Suspense fallback={<p className="mt-8 text-sm text-slate-400">Loading chart…</p>}><TopicChart data={chartData} /></Suspense> : <p className="mt-8 text-sm text-slate-400">No accepted tagged problems in the imported history.</p>}</div>
        <div className="rounded-2xl border border-white/10 bg-[#111929] p-6"><h3 className="text-lg font-semibold">Solved problems</h3><p className="mt-1 text-xs text-slate-500">Most recent 100 distinct accepted problems.</p>{summary.solved_problems.length ? <ul className="mt-5 max-h-80 divide-y divide-white/10 overflow-auto">{summary.solved_problems.map((problem) => <li key={`${problem.contest_id}-${problem.problem_index}`} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{problem.name}</p><p className="mt-1 text-xs text-slate-500">{problem.contest_id}{problem.problem_index} · {problem.rating ?? 'Unrated'} · {problem.tags.slice(0, 2).join(', ') || 'No tags'}</p></div><a href={problem.url} target="_blank" rel="noreferrer" aria-label={`Open ${problem.name} on Codeforces`} className="shrink-0 rounded-lg p-2 text-indigo-300 hover:bg-indigo-400/10"><ArrowUpRight size={17} /></a></li>)}</ul> : <p className="mt-8 text-sm text-slate-400">No accepted problems in the imported history.</p>}</div>
      </section>
    </>}
  </div>
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-white/10 bg-[#111929] p-5"><p className="text-xs uppercase tracking-widest text-slate-500">{label}</p><p className="mt-3 truncate text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-slate-400">{detail}</p></div>
}
