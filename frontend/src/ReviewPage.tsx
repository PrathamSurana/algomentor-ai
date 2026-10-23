import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AlertTriangle, ArrowRight, Braces, CheckCircle2, Clock3, Code2, History, LoaderCircle, LogOut, Mail, RefreshCw, Sparkles } from 'lucide-react'
import { createReview, getReview, getReviewHistory, type ReviewDetail, type ReviewHistory } from './api'
import { getSupabaseClient } from './supabase'

const supabase = getSupabaseClient()
const inputClass = 'w-full rounded-xl border border-white/10 bg-[#0a1220] px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-indigo-400'

export default function ReviewPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(Boolean(supabase))
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [language, setLanguage] = useState<'python' | 'cpp' | 'java'>('python')
  const [code, setCode] = useState('')
  const [problemContext, setProblemContext] = useState('')
  const [contestId, setContestId] = useState('')
  const [problemIndex, setProblemIndex] = useState('')
  const [review, setReview] = useState<ReviewDetail | null>(null)
  const [history, setHistory] = useState<ReviewHistory['reviews']>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [opening, setOpening] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    if (!supabase) return
    let active = true
    supabase.auth.getSession().then(({ data, error: authError }) => {
      if (active) {
        if (authError) setError(authError.message)
        setSession(data.session)
      }
    }).catch(() => { if (active) setError('Could not check sign-in.') })
      .finally(() => { if (active) setAuthLoading(false) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) setSession(next)
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!session) {
      setHistory([])
      setReview(null)
      setCode('')
      setProblemContext('')
      setContestId('')
      setProblemIndex('')
      return
    }
    let active = true
    setHistoryLoading(true)
    getReviewHistory(session.access_token).then((data) => {
      if (active) setHistory(data.reviews)
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not load review history.')
    }).finally(() => { if (active) setHistoryLoading(false) })
    return () => { active = false }
  }, [session, refresh])

  async function sendLink(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setSending(true)
    setError(null)
    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email, options: { emailRedirectTo: window.location.origin },
      })
      if (authError) throw authError
      setSent(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send sign-in link.')
    } finally { setSending(false) }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!session) return
    if ((contestId && !problemIndex) || (!contestId && problemIndex)) {
      setError('Enter both the Codeforces contest ID and problem index, or leave both blank.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const result = await createReview(session.access_token, {
        language, code, problem_context: problemContext || null,
        contest_id: contestId ? Number(contestId) : null,
        problem_index: problemIndex || null,
      })
      setReview(result)
      setRefresh((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Review failed. Try again.')
    } finally { setSubmitting(false) }
  }

  async function openReview(id: string) {
    if (!session) return
    setOpening(id)
    setError(null)
    try {
      const result = await getReview(session.access_token, id)
      setReview(result)
      setLanguage(result.language)
      setCode(result.code)
      setProblemContext(result.problem_context ?? '')
      setContestId(result.contest_id?.toString() ?? '')
      setProblemIndex(result.problem_index ?? '')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open review.')
    } finally { setOpening(null) }
  }

  return <div className="mt-9 space-y-6">
    <section className="relative overflow-hidden rounded-2xl border border-indigo-400/15 bg-[#111929] p-6 sm:p-8">
      <div className="pointer-events-none absolute -right-16 -top-16 size-60 rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="relative"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300"><Sparkles size={15} /> AI code review</p><h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Get a second look at your solution</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Paste your own Python, C++, or Java code. Add a saved Codeforces problem and any constraints you know for more focused feedback.</p><div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-400"><span className="rounded-full border border-white/10 px-3 py-1.5">Complexity estimates</span><span className="rounded-full border border-white/10 px-3 py-1.5">Edge cases</span><span className="rounded-full border border-white/10 px-3 py-1.5">Improvements</span></div></div>
    </section>

    {!supabase && <Notice icon={AlertTriangle} title="Supabase Auth setup needed" message="Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to sign in and save reviews." />}
    {authLoading && <Notice icon={LoaderCircle} title="Checking sign-in" message="Loading your Supabase session…" />}
    {supabase && !authLoading && !session && <section className="rounded-2xl border border-white/10 bg-[#111929] p-6 sm:p-8"><div className="flex items-center gap-3"><Mail className="text-indigo-300" size={22} /><h3 className="text-lg font-semibold">Sign in to review code</h3></div><p className="mt-2 text-sm text-slate-400">Your review history is saved to your account. Enter your email for a magic link.</p><form onSubmit={sendLink} className="mt-5 flex flex-col gap-3 sm:flex-row"><label htmlFor="review-email" className="sr-only">Email address</label><input id="review-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className={inputClass} /><button type="submit" disabled={sending} className="shrink-0 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold hover:bg-indigo-400 disabled:opacity-50">{sending ? 'Sending…' : 'Send sign-in link'}</button></form>{sent && <p role="status" className="mt-4 text-sm text-emerald-300">Check your inbox for the sign-in link.</p>}</section>}
    {error && <div role="alert" className="flex items-center gap-3 rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200"><AlertTriangle size={18} className="shrink-0" /><span className="flex-1">{error}</span><button type="button" onClick={() => { setError(null); setRefresh((value) => value + 1) }} className="rounded-lg border border-rose-300/20 px-3 py-1.5">Retry</button></div>}

    {session && <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400"><span>Signed in as {session.user.email ?? 'Supabase user'}</span><button type="button" onClick={() => supabase?.auth.signOut()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 hover:bg-white/5"><LogOut size={14} /> Sign out</button></div>}
    {session && <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
      <div className="space-y-6"><form onSubmit={submit} className="rounded-2xl border border-white/10 bg-[#111929] p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">01 / Your solution</p><h3 className="mt-1 text-lg font-semibold">Source code</h3></div><span className="text-xs text-slate-500">Signed in as {session.user.email ?? 'Supabase user'}</span></div><div className="mt-5 flex flex-wrap gap-2" aria-label="Programming language">{(['python', 'cpp', 'java'] as const).map((item) => <button key={item} type="button" onClick={() => setLanguage(item)} aria-pressed={language === item} className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${language === item ? 'bg-indigo-500 text-white' : 'border border-white/10 text-slate-400 hover:bg-white/5'}`}>{item === 'cpp' ? 'C++' : item === 'java' ? 'Java' : 'Python'}</button>)}</div><label htmlFor="review-code" className="sr-only">Solution code</label><textarea id="review-code" required minLength={20} maxLength={20000} spellCheck={false} value={code} onChange={(event) => setCode(event.target.value)} placeholder={language === 'python' ? 'def solve():\n    # Paste your solution here' : '// Paste your solution here'} className={`${inputClass} mt-4 min-h-[320px] resize-y font-mono text-[13px] leading-6`} /><div className="mt-2 flex justify-between text-xs text-slate-500"><span>Code is sent as text and never executed.</span><span>{code.length.toLocaleString()} / 20,000</span></div><div className="mt-7 border-t border-white/10 pt-6"><p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">02 / Problem context</p><p className="mt-2 text-sm text-slate-400">Optional. A Codeforces ID must refer to a problem already in the local catalog.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs text-slate-400">Contest ID<input type="number" min="1" step="1" value={contestId} onChange={(event) => setContestId(event.target.value)} placeholder="e.g. 4" className={`${inputClass} mt-2`} /></label><label className="text-xs text-slate-400">Problem index<input type="text" maxLength={10} pattern="[A-Za-z][A-Za-z0-9]{0,9}" value={problemIndex} onChange={(event) => setProblemIndex(event.target.value)} placeholder="e.g. A" className={`${inputClass} mt-2`} /></label></div><label htmlFor="review-context" className="mt-4 block text-xs text-slate-400">Your problem notes or constraints</label><textarea id="review-context" maxLength={4000} rows={4} value={problemContext} onChange={(event) => setProblemContext(event.target.value)} placeholder="Describe the task, constraints, and what you want reviewed…" className={`${inputClass} mt-2 resize-y`} /><p className="mt-1 text-right text-xs text-slate-500">{problemContext.length.toLocaleString()} / 4,000</p></div><button type="submit" disabled={submitting || code.trim().length < 20} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/15 hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? <><LoaderCircle size={17} className="animate-spin" /> Reviewing solution…</> : <><Sparkles size={17} /> Review my code <ArrowRight size={16} /></>}</button></form>
        {review && <Feedback review={review} />}
      </div>
      <aside className="self-start rounded-2xl border border-white/10 bg-[#111929] p-5 sm:p-6"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><History size={18} className="text-indigo-300" /><h3 className="font-semibold">Review history</h3></div><button type="button" onClick={() => setRefresh((value) => value + 1)} aria-label="Refresh review history" className="rounded-lg p-2 text-slate-400 hover:bg-white/5"><RefreshCw size={16} /></button></div><p className="mt-2 text-xs leading-5 text-slate-500">Recent reviews saved to your account.</p>{historyLoading && <div role="status" className="mt-6 flex items-center gap-2 text-sm text-slate-400"><LoaderCircle size={16} className="animate-spin" /> Loading history…</div>}{!historyLoading && history.length === 0 && <div className="mt-6 rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">Your first review will appear here.</div>}<div className="mt-4 space-y-2">{history.map((item) => <button key={item.id} type="button" onClick={() => openReview(item.id)} disabled={opening !== null} className={`w-full rounded-xl border p-4 text-left transition hover:bg-white/5 ${review?.id === item.id ? 'border-indigo-400/40 bg-indigo-400/[0.06]' : 'border-white/10 bg-[#0d1524]'}`}><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold uppercase tracking-wider text-indigo-300">{item.language === 'cpp' ? 'C++' : item.language}</span><span className="text-[11px] text-slate-500">{new Date(item.created_at).toLocaleDateString()}</span></div><p className="mt-2 line-clamp-2 text-sm font-medium text-slate-200">{item.problem_title ?? item.approach_summary}</p>{opening === item.id && <LoaderCircle size={15} className="mt-2 animate-spin text-indigo-300" />}</button>)}</div></aside>
    </div>}
  </div>
}

function Feedback({ review }: { review: ReviewDetail }) {
  const feedback = review.feedback
  return <section aria-label="AI feedback" className="overflow-hidden rounded-2xl border border-indigo-400/20 bg-[#111929]"><div className="border-b border-white/10 bg-indigo-400/[0.05] p-5 sm:p-7"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-indigo-300"><CheckCircle2 size={16} /> Review saved</p><h3 className="mt-2 text-xl font-semibold">Feedback on your solution</h3><p className="mt-2 text-sm leading-6 text-slate-300">{feedback.approach_summary}</p><p className="mt-3 text-xs text-slate-500">{review.problem_title ?? 'No catalog problem selected'} · {new Date(review.created_at).toLocaleString()}</p></div><div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-7"><Metric icon={Clock3} title="Time complexity" estimate={feedback.time_complexity.estimate} reasoning={feedback.time_complexity.reasoning} /><Metric icon={Braces} title="Space complexity" estimate={feedback.space_complexity.estimate} reasoning={feedback.space_complexity.reasoning} /><ListCard title="Potential edge cases" items={feedback.potential_edge_cases} empty="No specific edge cases identified." /><ListCard title="Suggested improvements" items={feedback.suggested_improvements} empty="No specific improvements identified." /></div><div className="border-t border-white/10 px-5 py-5 sm:px-7"><p className="flex items-center gap-2 text-sm font-semibold text-amber-200"><AlertTriangle size={17} /> Uncertainty and limitations</p>{feedback.uncertainty_notes.length ? <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-400">{feedback.uncertainty_notes.map((item, index) => <li key={index}>• {item}</li>)}</ul> : <p className="mt-3 text-sm text-slate-400">No specific uncertainty notes were returned.</p>}<p className="mt-4 text-xs leading-5 text-slate-500">AI feedback is advisory and may be incorrect. The solution was not run or proven correct; verify suggestions with tests and the original problem statement.</p></div></section>
}

function Metric({ icon: Icon, title, estimate, reasoning }: { icon: typeof Clock3; title: string; estimate: string; reasoning: string }) {
  return <div className="rounded-xl border border-white/10 bg-[#0c1422] p-4"><p className="flex items-center gap-2 text-xs font-medium text-slate-400"><Icon size={15} className="text-indigo-300" /> {title}</p><p className="mt-3 font-mono text-lg font-semibold text-indigo-200">{estimate}</p><p className="mt-2 text-sm leading-6 text-slate-400">{reasoning}</p></div>
}

function ListCard({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return <div className="rounded-xl border border-white/10 bg-[#0c1422] p-4"><h4 className="text-sm font-semibold">{title}</h4>{items.length ? <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-400">{items.map((item, index) => <li key={index} className="flex gap-2"><span className="text-indigo-300">•</span><span>{item}</span></li>)}</ul> : <p className="mt-3 text-sm text-slate-500">{empty}</p>}</div>
}

function Notice({ icon: Icon, title, message }: { icon: typeof Code2; title: string; message: string }) {
  return <section role="status" className="rounded-2xl border border-white/10 bg-[#111929] p-8 text-center"><Icon size={24} className="mx-auto text-indigo-300" /><h3 className="mt-4 text-lg font-semibold">{title}</h3><p className="mx-auto mt-2 max-w-lg text-sm text-slate-400">{message}</p></section>
}
