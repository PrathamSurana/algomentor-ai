import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export default function TopicChart({ data }: { data: { topic: string; solved_count: number }[] }) {
  return <div className="mt-6 h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ left: 10, right: 12 }}><CartesianGrid stroke="#263044" horizontal={false} /><XAxis type="number" allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} /><YAxis type="category" dataKey="topic" width={105} tick={{ fill: '#cbd5e1', fontSize: 11 }} /><Tooltip contentStyle={{ background: '#101827', border: '1px solid #334155', borderRadius: 10 }} /><Bar dataKey="solved_count" fill="#818cf8" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer></div>
}
