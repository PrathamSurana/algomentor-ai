import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowUpRight, Check, CircleAlert, Focus, LockKeyhole, RefreshCw, Search, Sparkles, Target } from 'lucide-react'
import { ReactFlow, Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlowProvider, type Edge, type Node, type NodeProps, type ReactFlowInstance } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { getChallengeTree, syncLinkedCodeforcesHistory, type ChallengeNode, type ChallengeTree } from './api'
import Toast from './Toast'

type SkillNode = Node<{ topic: ChallengeNode; selected: boolean }, 'skill'>
const nodeTypes = { skill: SkillCard }
const pathOrder = ['Foundations', 'Core DSA', 'Techniques', 'Trees and Graphs', 'Advanced CP']

function SkillCard({ data }: NodeProps<SkillNode>) {
  const topic = data.topic
  const color = topic.state === 'completed' ? '#43cfae' : topic.state === 'ready' ? '#a78bfa' : '#64748b'
  return <div className={`w-[236px] rounded-2xl border bg-[#171827] p-4 text-left shadow-xl transition-all ${data.selected ? 'border-violet-300 ring-2 ring-violet-400/30' : topic.state === 'completed' ? 'border-emerald-400/40' : topic.state === 'ready' ? 'border-violet-400/35 hover:border-violet-300/70' : 'border-white/10 opacity-75'}`}>
    <Handle type="target" position={Position.Left} className="!border-0 !bg-violet-400" />
    <div className="flex items-start justify-between gap-2"><div><p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{topic.pathway}</p><p className="mt-1 text-sm font-semibold text-white">{topic.title}</p></div><div className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: `conic-gradient(${color} ${100 * topic.verified_count / topic.required_count}%, #343648 0)`, color }}>{topic.state === 'completed' ? <Check size={16} className="rounded-full bg-[#171827] p-0.5" /> : <span className="flex size-7 items-center justify-center rounded-full bg-[#171827]">{topic.verified_count}</span>}</div></div>
    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400"><span>{topic.verified_count}/{topic.required_count} verified</span><span className="capitalize">{topic.state === 'locked' ? <LockKeyhole size={13} /> : topic.rank}</span></div>
    <Handle type="source" position={Position.Right} className="!border-0 !bg-violet-400" />
  </div>
}

function layout(topics: ChallengeNode[], selected: string | null): { nodes: SkillNode[]; edges: Edge[] } {
  const byKey = new Map(topics.map((topic) => [topic.key, topic]))
  const depth = new Map<string, number>()
  function column(key: string): number {
    if (depth.has(key)) return depth.get(key)!
    const topic = byKey.get(key)
    const value = topic?.prerequisites.length ? 1 + Math.max(...topic.prerequisites.map(column)) : 0
    depth.set(key, value)
    return value
  }
  topics.forEach((topic) => column(topic.key))
  const counters = new Map<number, number>()
  const nodes: SkillNode[] = topics.map((topic) => {
    const x = depth.get(topic.key) ?? 0
    const y = counters.get(x) ?? 0
    counters.set(x, y + 1)
    return { id: topic.key, type: 'skill', position: { x: x * 320, y: y * 160 + pathOrder.indexOf(topic.pathway) * 5 }, measured: { width: 236, height: 116 }, data: { topic, selected: selected === topic.key } }
  })
  const edges = topics.flatMap((topic) => topic.prerequisites.map((parent) => ({ id: `${parent}-${topic.key}`, source: parent, target: topic.key, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed, color: topic.state === 'locked' ? '#45465d' : '#8b7de0' }, style: { stroke: topic.state === 'locked' ? '#45465d' : '#8b7de0', strokeWidth: 1.5 }, animated: topic.state === 'ready' })))
  return { nodes, edges }
}

export default function RoadmapPage({ session, demoTree, onDemoSolve, onOpenOverview }: { session: Session | null; demoTree?: ChallengeTree; onDemoSolve?: (topic: string, tier: string) => void; onOpenOverview: () => void }) {
  return <ReactFlowProvider><RoadmapContent session={session} demoTree={demoTree} onDemoSolve={onDemoSolve} onOpenOverview={onOpenOverview} /></ReactFlowProvider>
}

function RoadmapContent({ session, demoTree, onDemoSolve, onOpenOverview }: { session: Session | null; demoTree?: ChallengeTree; onDemoSolve?: (topic: string, tier: string) => void; onOpenOverview: () => void }) {
  const [tree, setTree] = useState<ChallengeTree | null>(demoTree ?? null)
  const [selected, setSelected] = useState<string | null>(demoTree?.recommended_key ?? null)
  const [query, setQuery] = useState('')
  const [instance, setInstance] = useState<ReactFlowInstance<SkillNode, Edge> | null>(null)
  const [loading, setLoading] = useState(!demoTree)
  const [syncing, setSyncing] = useState(false)
  const [saved, setSaved] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  useEffect(() => { window.addEventListener('algomentor:sync', refresh); return () => window.removeEventListener('algomentor:sync', refresh) }, [refresh])
  useEffect(() => {
    if (demoTree) { setTree(demoTree); setLoading(false); return }
    if (!session) return
    let active = true
    setLoading(true)
    setError(null)
    getChallengeTree(session.access_token).then((result) => { if (active) { setTree(result); setSelected((current) => current ?? result.recommended_key ?? result.nodes[0]?.key ?? null) } }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load roadmap.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session, demoTree, revision])
  const graph = useMemo(() => layout(tree?.nodes ?? [], selected), [tree, selected])
  const topic = tree?.nodes.find((item) => item.key === selected)
  const demoTarget = (topic?.state === 'ready' ? topic : tree?.nodes.find((item) => item.state === 'ready' && item.challenges.some((challenge) => !challenge.verified)))
  const nextDemoChallenge = demoTarget?.challenges.find((challenge) => !challenge.verified)
  function focus(key: string) {
    setSelected(key)
    const node = graph.nodes.find((item) => item.id === key)
    if (node) instance?.setCenter(node.position.x + 118, node.position.y + 55, { zoom: 1.05, duration: 450 })
  }
  async function syncProgress() {
    if (demoTree) {
      if (!demoTarget || !nextDemoChallenge) return
      onDemoSolve?.(demoTarget.key, nextDemoChallenge.tier)
      setNotice(`${nextDemoChallenge.title} marked accepted in this browser-only demonstration.`)
      return
    }
    if (!session) return
    if (!tree?.handle) return
    setSyncing(true); setError(null); setSaved(0)
    try {
      const result = await syncLinkedCodeforcesHistory(session.access_token, tree.handle, 'refresh', setSaved)
      setNotice(`${result.new_submissions} submissions saved. ${result.has_more ? 'Older pages remain; sync again.' : 'Available history is complete.'}`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Progress sync failed.') }
    finally { window.dispatchEvent(new Event('algomentor:sync')); setSyncing(false) }
  }
  return <div className="mt-8 space-y-5">
    {notice && <Toast message={notice} onDismiss={() => setNotice(null)} />}
    <section className="ui-card flex flex-wrap items-center justify-between gap-4 p-6 sm:p-8"><div><p className="ui-eyebrow">{demoTree ? 'Demo skill tree · sample progress' : 'Verified skill tree'}</p><h2 className="mt-2 text-2xl font-semibold">{demoTree ? 'Explore how skills unlock' : 'A path built from real solves'}</h2><p className="mt-2 max-w-2xl text-sm text-slate-400">{demoTree ? 'These public Codeforces problem links are genuine. Acceptance and progress shown here are illustrative and remain in this browser session.' : 'Complete the three assigned Codeforces challenges in a topic to unlock connected skills. Historical accepted submissions count automatically.'}</p></div><button type="button" disabled={demoTree ? !nextDemoChallenge : !tree?.handle || syncing} onClick={syncProgress} className="ui-button ui-button-primary disabled:opacity-50"><RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />{demoTree ? 'Simulate Accepted Submission' : syncing ? `Syncing · ${saved} saved` : 'Sync Progress'}</button></section>
    {error && <div role="alert" className="ui-card flex items-center gap-3 border-rose-400/25 p-4 text-sm text-rose-200"><CircleAlert size={17} />{error}<button type="button" onClick={refresh} className="ml-auto text-violet-200">Retry</button></div>}
    {loading && <div role="status" className="ui-skeleton h-[600px]"><span className="sr-only">Loading skill tree</span></div>}
    {!loading && tree && <>
      {!demoTree && !tree.handle && <div className="ui-card p-6 text-sm text-slate-300">Connect and sync your Codeforces account to assign verified challenges. <button type="button" onClick={onOpenOverview} className="ml-2 text-violet-300 underline">Open dashboard</button></div>}
      <section className="grid gap-3 sm:grid-cols-4">{[['Topics complete', `${tree.completed_count}/${tree.total_count}`], ['Verified challenges', tree.verified_challenges], ['Total XP', tree.xp], ['Current streak', `${tree.streak_days} days`]].map(([label, value]) => <div key={String(label)} className="ui-card p-4"><p className="ui-eyebrow">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>)}</section>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]"><section className="ui-card min-w-0 overflow-hidden p-3 sm:p-4"><div className="mb-3 flex flex-wrap items-center gap-2"><label className="relative min-w-[180px] flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><span className="sr-only">Find topic</span><input className="ui-input pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a skill" /></label><button type="button" onClick={() => { const found = tree.nodes.find((item) => item.title.toLowerCase().includes(query.toLowerCase())); if (found) focus(found.key) }} className="ui-button ui-button-secondary"><Focus size={15} /> Focus</button><button type="button" onClick={() => instance?.fitView({ padding: 0.2, duration: 400 })} className="ui-button ui-button-secondary">Fit tree</button></div><div className="h-[500px] overflow-hidden rounded-xl border border-white/10 bg-[#10111c] sm:h-[560px]" aria-label="Interactive roadmap graph"><ReactFlow<SkillNode, Edge> className="roadmap-flow" colorMode="dark" nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} onInit={setInstance} onNodeClick={(_, node) => setSelected(node.id)} defaultViewport={window.innerWidth < 640 ? { x: 18, y: 140, zoom: 0.65 } : { x: 52, y: 140, zoom: 0.82 }} minZoom={0.2} maxZoom={1.8} nodesDraggable={false} proOptions={{ hideAttribution: true }}><Background color="#313148" gap={25} size={1} /><Controls showInteractive={false} /><MiniMap pannable zoomable nodeColor={(node) => node.id === selected ? '#a78bfa' : (node.data as SkillNode['data'])?.topic?.state === 'completed' ? '#43cfae' : (node.data as SkillNode['data'])?.topic?.state === 'ready' ? '#8b7de0' : '#596074'} nodeStrokeColor="#171827" nodeStrokeWidth={2} nodeBorderRadius={3} bgColor="#151522" maskColor="rgba(8, 8, 17, 0.52)" maskStrokeColor="#a78bfa" style={{ width: 140, height: 94 }} /></ReactFlow></div><p className="mt-3 text-xs text-slate-500">Drag to pan, scroll to zoom, or select a node to inspect challenges. Use Fit tree to see every branch.</p></section>
      <aside className="ui-card h-fit p-5 sm:p-6">{topic ? <><p className="ui-eyebrow">{topic.pathway}</p><h3 className="mt-2 text-xl font-semibold">{topic.title}</h3><p className="mt-2 text-sm capitalize text-violet-200">{topic.state} · {topic.rank} · {topic.xp} XP</p><div className="ui-progress mt-4"><span style={{ width: `${100 * topic.verified_count / topic.required_count}%` }} /></div><p className="mt-2 text-xs text-slate-400">{topic.verified_count} of {topic.required_count} required challenges verified</p>{topic.missing_prerequisites.length > 0 && <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">Locked until {topic.missing_prerequisites.map((key) => tree.nodes.find((item) => item.key === key)?.title ?? key).join(' and ')} is complete.</p>}<p className="mt-4 text-xs text-slate-500">Codeforces tag: {topic.codeforces_tag}. Some DSA topics use a broader platform tag.</p><div className="mt-5 space-y-3">{topic.challenges.map((challenge) => <a key={challenge.tier} href={challenge.url} target="_blank" rel="noreferrer" className="block rounded-xl border border-white/10 bg-white/[0.025] p-3 transition hover:border-violet-400/50"><div className="flex items-center justify-between gap-2"><span className="ui-badge capitalize">{challenge.tier}</span>{challenge.verified ? <span className="flex items-center gap-1 text-xs text-emerald-300"><Check size={14} /> Verified</span> : <span className="text-xs text-slate-500">To solve</span>}</div><p className="mt-3 text-sm font-semibold text-white">{challenge.title} <ArrowUpRight size={13} className="inline text-violet-300" /></p><p className="mt-1 text-xs text-slate-400">{challenge.contest_id}{challenge.problem_index} · {challenge.rating ?? 'Unrated'} · {challenge.tags.slice(0, 2).join(', ')}</p></a>)}{topic.challenges.length < topic.required_count && <p className="text-xs text-amber-200">The stored Codeforces catalog has not supplied all three rated challenges for this topic yet. Sync again after catalog refresh.</p>}</div></> : <div className="text-sm text-slate-400"><Target size={23} className="text-violet-300" /><p className="mt-3">Select a topic to inspect its verified challenges.</p></div>}</aside></div>
      {tree.achievements.length > 0 && <section className="ui-card p-5"><p className="ui-eyebrow">Achievements</p><div className="mt-3 flex flex-wrap gap-2">{tree.achievements.map((badge) => <span key={badge.key} className="ui-badge flex items-center gap-1"><Sparkles size={12} /> {badge.title}</span>)}</div></section>}
    </>}
  </div>
}
