import { CheckCircle2, X } from 'lucide-react'

export default function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return <div role="status" className="ui-toast fade-in"><CheckCircle2 size={18} className="shrink-0 text-emerald-300" /><span className="min-w-0 flex-1">{message}</span><button type="button" onClick={onDismiss} aria-label="Dismiss notification" className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white"><X size={15} /></button></div>
}
