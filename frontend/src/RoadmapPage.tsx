import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowRight, Check, CircleAlert, LockKeyhole, LoaderCircle, LogOut, Mail, RotateCcw, Sparkles } from 'lucide-react'
import { getRoadmap, updateRoadmapMilestone, type RoadmapResponse } from './api'
import { CODEFORCES_HANDLE_KEY } from './storage'
import { getSupabaseClient } from './supabase'

const supabase = getSupabaseClient()

export default function RoadmapPage({ onOpenOverview }: { onOpenOverview: () => void }) {
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(Boolean(supabase))
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [roadmap, setRoadmap] = useState<RoadmapResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const handle = localStorage.getItem(CODEFORCES_HANDLE_KEY)

  useEffect(() => {
    if (!supabase) return
    let active = true
    supabase.auth.getSession()
      .then(({ data, error: authError }) => {
        if (active) {
          if (authError) setError(authError.message)
          setSession(data.session)
        }
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not check sign-in.') })
      .finally(() => { if (active) setAuthLoading(false) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) setSession(next)
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!session) { setRoadmap(null); return }
    let active = true
    setLoading(true)
    setError(null)
    getRoadmap(session.access_token, handle)
      .then((data) => { if (active) setRoadmap(data) })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load roadmap.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session, handle, refresh])

  async function sendLink(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setSending(true)
    setError(null)
    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin },
      })
      if (authError) setError(authError.message)
      else setSent(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send sign-in link.')
    } finally {
      setSending(false)
    }
  }

  async function toggle(key: string, completed: boolean) {
    if (!session) return
    setPendingKey(key)
    setError(null)
    try {
      setRoadmap(await updateRoadmapMilestone(session.access_token, key, completed, handle))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save progress.')
    } finally {
      setPendingKey(null)
    }
  }

  return <div className="mt-9 space-y-6">
    <section className="rounded-2xl border border-white/10 bg-[#111929] p-6 sm:p-8"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">Adaptive learning path</p><h2 className="mt-2 text-2xl font-semibold">DSA and CP roadmap</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Work through twelve prerequisite-linked milestones. Completion is saved to your signed-in account, and the next ready topic reflects your available Codeforces proficiency evidence.</p></section>

    {!supabase && <State title="Supabase Auth setup needed" message="Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in frontend/.env.local, then configure email sign-in and redirect URLs in Supabase." />}
    {authLoading && <State title="Checking sign-in" message="Loading your Supabase session…" loading />}
    {supabase && !authLoading && !session && <section className="rounded-2xl border border-white/10 bg-[#111929] p-6 sm:p-8"><div className="flex items-center gap-3"><Mail size={22} className="text-indigo-300" /><h3 className="text-lg font-semibold">Sign in to save progress</h3></div><p className="mt-2 text-sm text-slate-400">Enter your email for a Supabase magic link. Open the link, then return to Roadmap.</p><form onSubmit={sendLink} className="mt-5 flex flex-col gap-3 sm:flex-row"><label htmlFor="roadmap-email" className="sr-only">Email address</label><input id="roadmap-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0b1220] px-4 py-3 text-sm text-white outline-none focus:border-indigo-400" /><button type="submit" disabled={sending} className="rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50">{sending ? 'Sending…' : 'Send sign-in link'}</button></form>{sent && <p role="status" className="mt-4 text-sm text-emerald-300">Check your inbox for the sign-in link.</p>}</section>}
    {error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200"><CircleAlert size={18} /><span className="flex-1">{error}</span>{session && <button type="button" onClick={() => setRefresh((value) => value + 1)} className="rounded-lg border border-rose-300/20 px-3 py-1.5">Retry</button>}</div>}
    {session && <><div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400"><span>Signed in as {session.user.email ?? 'Supabase user'}{handle ? ` · Using public Codeforces history for ${handle}` : ' · No Codeforces handle selected'}</span><button type="button" onClick={() => supabase?.auth.signOut()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 hover:bg-white/5"><LogOut size={14} /> Sign out</button></div>{!handle && <button type="button" onClick={onOpenOverview} className="text-sm text-indigo-300 hover:underline">Connect a Codeforces handle for proficiency-aware suggestions →</button>}</>}
    {session && loading && <State title="Loading roadmap" message="Checking your saved milestones and topic evidence…" loading />}
    {session && !loading && roadmap && <>
      <section className="grid gap-4 sm:grid-cols-[1fr_1.5fr]"><div className="rounded-2xl border border-white/10 bg-[#111929] p-6"><p className="text-xs uppercase tracking-widest text-slate-500">Progress</p><p className="mt-4 text-3xl font-semibold">{roadmap.completed_count}<span className="text-lg text-slate-500"> / {roadmap.total_count}</span></p><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-indigo-400" style={{ width: `${100 * roadmap.completed_count / roadmap.total_count}%` }} /></div><p className="mt-3 text-xs text-slate-400">Milestones completed and saved</p></div><div className="rounded-2xl border border-indigo-400/20 bg-indigo-400/[0.07] p-6"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-indigo-300"><Sparkles size={15} /> Recommended next</p><h3 className="mt-4 text-xl font-semibold">{roadmap.recommended_key ? roadmap.milestones.find((item) => item.key === roadmap.recommended_key)?.title : 'Roadmap complete'}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{roadmap.recommendation_reason ?? 'All twelve milestones are complete.'}</p></div></section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Roadmap milestones">{roadmap.milestones.map((item) => <article key={item.key} className={`rounded-2xl border p-5 ${item.state === 'completed' ? 'border-emerald-400/20 bg-emerald-400/[0.05]' : item.state === 'ready' ? 'border-indigo-400/25 bg-[#111929]' : 'border-white/10 bg-[#0c1421]'}`}><div className="flex items-start justify-between gap-3"><span className={`flex size-9 items-center justify-center rounded-xl ${item.state === 'completed' ? 'bg-emerald-400/10 text-emerald-300' : item.state === 'ready' ? 'bg-indigo-400/10 text-indigo-300' : 'bg-white/5 text-slate-500'}`}>{item.state === 'completed' ? <Check size={19} /> : item.state === 'ready' ? <ArrowRight size={19} /> : <LockKeyhole size={18} />}</span><span className={`rounded-full px-2.5 py-1 text-xs capitalize ${item.state === 'completed' ? 'bg-emerald-400/10 text-emerald-200' : item.state === 'ready' ? 'bg-indigo-400/10 text-indigo-200' : 'bg-white/5 text-slate-500'}`}>{item.state}</span></div><h3 className="mt-5 font-semibold">{item.title}</h3><p className="mt-2 min-h-12 text-sm leading-6 text-slate-400">{item.description}</p><p className="mt-4 text-xs text-slate-500">{item.prerequisites.length ? `Requires ${item.prerequisites.map((key) => roadmap.milestones.find((parent) => parent.key === key)?.title ?? key).join(', ')}` : 'Start here · no prerequisites'}</p><p className="mt-2 text-xs text-slate-500">{item.proficiency_score === null ? 'Proficiency: insufficient evidence' : `Proficiency estimate: ${item.proficiency_score}/100 · ${item.proficiency_confidence}`}{item.skill_source === 'proxy' ? ' · broad tag proxy' : ''}</p><button type="button" disabled={item.state === 'locked' || pendingKey !== null} onClick={() => toggle(item.key, item.state !== 'completed')} className={`mt-5 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${item.state === 'completed' ? 'border border-emerald-400/20 text-emerald-200 hover:bg-emerald-400/10' : 'bg-indigo-500 text-white hover:bg-indigo-400'}`}>{pendingKey === item.key ? <LoaderCircle size={14} className="animate-spin" /> : item.state === 'completed' ? <RotateCcw size={14} /> : <Check size={14} />}{item.state === 'completed' ? 'Reopen' : item.state === 'locked' ? 'Locked' : 'Mark complete'}</button></article>)}</section>
    </>}
  </div>
}

function State({ title, message, loading = false }: { title: string; message: string; loading?: boolean }) {
  return <section role="status" className="rounded-2xl border border-white/10 bg-[#111929] p-8 text-center">{loading ? <LoaderCircle size={25} className="mx-auto animate-spin text-indigo-300" /> : <LockKeyhole size={25} className="mx-auto text-indigo-300" />}<h3 className="mt-4 text-lg font-semibold">{title}</h3><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-400">{message}</p></section>
}
