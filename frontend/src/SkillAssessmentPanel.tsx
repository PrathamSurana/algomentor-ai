import { lazy, Suspense } from 'react'
import type { SkillAssessment } from './api'

const SkillChart = lazy(() => import('./SkillChart'))

export default function SkillAssessmentPanel({ assessment, loading, error }: {
  assessment: SkillAssessment | null
  loading: boolean
  error: string | null
}) {
  const scored = assessment?.topics.filter((topic) => topic.score !== null) ?? []
  const chartData = scored.slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 10)
    .map((topic) => ({ topic: topic.topic, score: topic.score ?? 0 }))

  return <section className="ui-card p-6 sm:p-8">
    <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">Deterministic assessment</p><h3 className="mt-2 text-xl font-semibold">Topic skill estimates</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Scores are estimates from unique accepted and attempted problems, rated difficulty, observable failed attempts, and the last 90 days of activity. They are not exact skill measurements.</p></div>
    {loading && <p role="status" className="mt-6 text-sm text-slate-400">Calculating topic evidence…</p>}
    {error && <p role="alert" className="mt-6 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">Skill assessment could not be loaded: {error}</p>}
    {assessment && <>
      <p className="mt-5 text-xs leading-5 text-slate-500">Version {assessment.scoring_version}. Publishing requires a complete import, at least 5 distinct attempted problems, 3 distinct solves, and 2 rated solves per topic. Base weights: 40% solve rate, 25% difficulty, 15% efficiency, 20% recent performance. Unavailable components are omitted and weights are redistributed.</p>
      {!assessment.history_complete && <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">Older submission pages remain. Load them before a topic score is published.</p>}
      {assessment.topics.length === 0 && <p className="mt-6 text-sm text-slate-400">No tagged attempts are available yet.</p>}
      {assessment.topics.length > 0 && scored.length === 0 && <p className="mt-6 text-sm text-slate-400">The imported history is too limited for a score. Component evidence is shown below.</p>}
      {chartData.length > 0 && <Suspense fallback={<p className="mt-6 text-sm text-slate-400">Loading skill chart…</p>}><SkillChart data={chartData} /></Suspense>}
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {assessment.topics.map((topic) => <article key={topic.topic} className="rounded-xl border border-white/10 bg-[#171621] p-4">
          <div className="flex items-start justify-between gap-3"><h4 className="font-semibold capitalize">{topic.topic}</h4><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${topic.score === null ? 'bg-amber-400/10 text-amber-200' : 'bg-indigo-400/10 text-indigo-200'}`}>{topic.score === null ? 'Insufficient data' : `Est. ${topic.score}/100 · ${topic.confidence}`}</span></div>
          <p className="mt-3 text-xs leading-5 text-slate-400">{topic.solved_unique}/{topic.attempted_unique} distinct problems solved · {topic.rated_solved} rated solves · {topic.failed_attempts} observed failures · {topic.recent_solved}/{topic.recent_attempted} recent</p>
          <details className="mt-3 border-t border-white/10 pt-3 text-xs text-slate-400"><summary className="cursor-pointer font-medium text-indigo-200">Components and rationale</summary><div className="mt-3 grid grid-cols-2 gap-2"><Metric label="Solve rate" value={topic.components.solve_rate} /><Metric label="Difficulty" value={topic.components.difficulty} /><Metric label="Efficiency" value={topic.components.efficiency} /><Metric label="Recent performance" value={topic.components.recent_performance} /></div><p className="mt-3">Applied weights: {Object.entries(topic.effective_weights).map(([name, weight]) => `${name.replace('_', ' ')} ${Math.round(weight * 100)}%`).join(' · ')}</p><ul className="mt-3 list-disc space-y-1 pl-4">{topic.rationale.map((line) => <li key={line}>{line}</li>)}</ul></details>
        </article>)}
      </div>
    </>}
  </section>
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return <div><span className="text-slate-500">{label}: </span><span className="text-slate-200">{value === null ? 'Unavailable' : `${Math.round(value * 100)}%`}</span></div>
}
