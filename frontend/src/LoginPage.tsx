import { useEffect, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ArrowRight, BrainCircuit, Check, CircleAlert, Code2, LoaderCircle, LockKeyhole, Mail, Map, Sparkles } from 'lucide-react'
import { callbackUrl } from './authRoutes'

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5">
    <path fill="#4285F4" d="M21.35 12.24c0-.72-.06-1.24-.2-1.79H12v3.3h5.37a4.58 4.58 0 0 1-1.99 3.01v2.5h3.22c1.88-1.73 2.75-4.28 2.75-7.02Z" />
    <path fill="#34A853" d="M12 21.6c2.7 0 4.96-.9 6.6-2.44l-3.22-2.5c-.9.6-2.05.97-3.38.97-2.6 0-4.8-1.76-5.6-4.13H3.1v2.57A9.97 9.97 0 0 0 12 21.6Z" />
    <path fill="#FBBC05" d="M6.4 13.5a6 6 0 0 1 0-3.02V7.9H3.1a10.04 10.04 0 0 0 0 8.17l3.3-2.57Z" />
    <path fill="#EA4335" d="M12 6.37c1.43 0 2.7.5 3.7 1.45l2.86-2.86A9.5 9.5 0 0 0 12 2.4a9.97 9.97 0 0 0-8.9 5.5l3.3 2.58c.8-2.37 3-4.11 5.6-4.11Z" />
  </svg>
}

export default function LoginPage({
  client, returnTo, initialError, onExploreDemo,
}: {
  client: SupabaseClient | null
  returnTo: string
  initialError: string | null
  onExploreDemo?: () => void
}) {
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState<'google' | 'email' | null>(null)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissedInitialError, setDismissedInitialError] = useState(false)
  const message = error ?? (dismissedInitialError ? null : initialError)

  useEffect(() => {
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) setPending(null)
    }
    window.addEventListener('pageshow', restore)
    return () => window.removeEventListener('pageshow', restore)
  }, [])

  async function signInWithGoogle() {
    if (!client) return
    setPending('google')
    setError(null)
    setSent(false)
    setDismissedInitialError(true)
    try {
      const { data, error: authError } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callbackUrl(window.location.origin, returnTo) },
      })
      if (authError) throw authError
      if (!data.url) throw new Error('Google sign-in could not start. Check the provider setup and try again.')
      // supabase-js performs the browser redirect. The callback restores the session.
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Google sign-in could not start. Please try again.')
    } finally {
      setPending(null)
    }
  }

  async function sendEmailLink(event: FormEvent) {
    event.preventDefault()
    if (!client) return
    setPending('email')
    setError(null)
    setSent(false)
    setDismissedInitialError(true)
    try {
      const { error: authError } = await client.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: callbackUrl(window.location.origin, returnTo) },
      })
      if (authError) throw authError
      setSent(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the email link. Please try again.')
    } finally {
      setPending(null)
    }
  }

  return <main className="relative isolate min-h-screen overflow-hidden bg-[#09090f] text-slate-100">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_30%,rgba(119,79,222,0.21),transparent_36%),radial-gradient(ellipse_at_95%_85%,rgba(76,49,132,0.14),transparent_34%)]" />
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:48px_48px]" />
    <div className="relative mx-auto flex min-h-screen max-w-[1450px] flex-col px-5 py-7 sm:px-8 lg:px-14">
      <div className="flex items-center gap-3 text-lg font-semibold tracking-tight"><span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-400 to-violet-700 shadow-lg shadow-violet-500/25"><Code2 size={21} /></span><span>AlgoMentor <span className="text-violet-300">AI</span></span></div>
      <div className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20 lg:py-16">
        <section className="max-w-2xl"><div className="ui-badge"><Sparkles size={14} /> Your practice, with purpose</div><h1 className="mt-7 text-4xl font-semibold leading-[1.08] tracking-[-0.055em] sm:text-5xl xl:text-6xl"><span className="mb-4 block text-sm font-medium tracking-normal text-violet-300">Your personalized AI coding coach.</span>Code smarter.<br /><span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-slate-100 bg-clip-text text-transparent">Grow faster.</span></h1><p className="mt-6 max-w-xl text-base leading-8 text-slate-400 sm:text-lg">A focused workspace for your competitive programming journey. Understand your strengths, find the right problems, and improve every solution.</p>
          <div className="mt-10 grid gap-3 sm:grid-cols-3"><Feature icon={BrainCircuit} title="Know your level" detail="Evidence-based topic insights" /><Feature icon={Map} title="Find your path" detail="A roadmap built on prerequisites" /><Feature icon={Code2} title="Improve your code" detail="Structured, advisory reviews" /></div>
          <div className="login-code-preview mt-8" aria-hidden="true"><div className="login-code-title"><span className="flex gap-1.5"><i /><i /><i /></span><span>progress.py</span><span>● learning</span></div><pre><span>01</span>  <b>while</b> curiosity:<br /><span>02</span>      practice.<em>solve</em>(next_problem)<br /><span>03</span>      skills.<em>level_up</em>()<br /><span>04</span>      <b>if</b> stuck: mentor.<em>guide</em>()</pre></div>
        </section>
        <section aria-label="Sign in" className="ui-card mx-auto w-full max-w-[470px] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-9"><div className="flex size-12 items-center justify-center rounded-2xl bg-violet-400/10 text-violet-300"><LockKeyhole size={23} /></div><h2 className="mt-6 text-2xl font-semibold tracking-tight">Welcome to AlgoMentor</h2><p className="mt-2 text-sm leading-6 text-slate-400">Sign in to keep your roadmap and code reviews connected to your account.</p>
          {!client && <div role="alert" className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">Supabase Auth is not configured. Set the public Supabase URL and publishable key in <code>frontend/.env.local</code>, then restart Vite.</div>}
          {message && <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm leading-6 text-rose-100"><CircleAlert size={18} className="mt-0.5 shrink-0" /><span>{message}</span></div>}
          <button type="button" onClick={signInWithGoogle} disabled={!client || pending !== null} className="mt-7 flex w-full items-center justify-center gap-3 rounded-xl bg-white px-5 py-4 text-sm font-semibold text-[#14213b] shadow-lg shadow-black/10 transition hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300 disabled:cursor-not-allowed disabled:opacity-55">{pending === 'google' ? <LoaderCircle size={20} className="animate-spin" /> : <GoogleMark />}{pending === 'google' ? 'Connecting to Google…' : 'Continue with Google'}{pending !== 'google' && <ArrowRight size={17} className="ml-auto text-slate-500" />}</button>
          {onExploreDemo && <button type="button" onClick={onExploreDemo} className="mt-3 flex w-full items-center justify-center gap-3 rounded-xl border border-violet-400/40 bg-violet-400/10 px-5 py-4 text-sm font-semibold text-violet-100 transition hover:border-violet-300 hover:bg-violet-400/20"><Sparkles size={18} /> Explore Demo <ArrowRight size={16} className="ml-auto" /></button>}
          {onExploreDemo && <p className="mt-2 text-center text-xs text-slate-500">No account needed · sample data · changes stay in this browser session</p>}
          <div className="my-7 flex items-center gap-4 text-xs text-slate-500"><span className="h-px flex-1 bg-white/10" /> or use email <span className="h-px flex-1 bg-white/10" /></div>
          <form onSubmit={sendEmailLink}><label htmlFor="login-email" className="mb-2 block text-xs font-medium text-slate-300">Email address</label><div className="relative"><Mail size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" /><input id="login-email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="w-full rounded-xl border border-white/10 bg-[#0a1220] py-3.5 pl-11 pr-4 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-indigo-400" /></div><button type="submit" disabled={!client || pending !== null} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-5 py-3.5 text-sm font-semibold text-slate-100 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-55">{pending === 'email' ? <LoaderCircle size={16} className="animate-spin" /> : <Mail size={16} />}{pending === 'email' ? 'Sending link…' : 'Send email sign-in link'}</button></form>
          {sent && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-emerald-300"><Check size={16} /> Check your inbox and open the link on this device.</p>}
          <p className="mt-7 border-t border-white/10 pt-5 text-xs leading-5 text-slate-500">Your account keeps private progress and reviews under your authenticated user ID. Codeforces history uses only public submissions.</p>
        </section>
      </div>
      <footer className="pb-2 text-xs text-slate-600">Practice with direction. Progress with confidence.</footer>
    </div>
  </main>
}

function Feature({ icon: Icon, title, detail }: { icon: typeof Code2; title: string; detail: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><Icon size={19} className="text-indigo-300" /><p className="mt-4 text-sm font-semibold text-slate-200">{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p></div>
}
