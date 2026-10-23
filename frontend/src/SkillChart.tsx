import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export default function SkillChart({ data }: { data: { topic: string; score: number }[] }) {
  return <div role="img" aria-label="Estimated topic skill scores from zero to one hundred" className="mt-6 h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ left: 12, right: 20 }}><CartesianGrid stroke="#263044" horizontal={false} /><XAxis type="number" domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} /><YAxis type="category" dataKey="topic" width={120} tick={{ fill: '#cbd5e1', fontSize: 11 }} /><Tooltip contentStyle={{ background: '#101827', border: '1px solid #334155', borderRadius: 10 }} /><Bar dataKey="score" fill="#34d399" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer></div>
}
