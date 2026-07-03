import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function localDateStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function mondayOfWeek(d = new Date()) {
  const date = new Date(d)
  const dow = date.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function weekRange(d = new Date()) {
  const monday = mondayOfWeek(d)
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  return { start: localDateStr(monday), end: localDateStr(sunday) }
}

const TABS = [
  { key: 'diario', label: 'Diario', icon: '☀️' },
  { key: 'semanal', label: 'Semanal', icon: '📅' },
  { key: 'tarea', label: 'Tareas', icon: '🗂️' },
]

export default function App() {
  const [tab, setTab] = useState('diario')
  const [items, setItems] = useState([])
  const [completions, setCompletions] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newWeekday, setNewWeekday] = useState('1')

  const today = localDateStr()
  const { start: weekStart, end: weekEnd } = weekRange()

  const load = useCallback(async () => {
    setLoading(true)
    const cutoff = weekStart <= today ? weekStart : today
    const [{ data: itemsData }, { data: compData }] = await Promise.all([
      supabase.from('informes_items').select('*').eq('archived', false).order('position', { ascending: true }),
      supabase.from('informes_completions').select('*').gte('completed_date', cutoff),
    ])
    setItems(itemsData || [])
    setCompletions(compData || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const channel = supabase
      .channel('informes-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'informes_items' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'informes_completions' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [load])

  async function addItem(e) {
    e.preventDefault()
    if (!newName.trim()) return
    const maxPos = items.filter(i => i.category === tab).reduce((m, i) => Math.max(m, i.position), 0)
    const payload = {
      name: newName.trim(),
      category: tab,
      position: maxPos + 1,
      target_weekday: tab === 'semanal' ? Number(newWeekday) : null,
      status: 'backlog',
    }
    await supabase.from('informes_items').insert(payload)
    setNewName('')
    load()
  }

  async function removeItem(id) {
    await supabase.from('informes_items').update({ archived: true }).eq('id', id)
    load()
  }

  async function toggleCompletion(itemId, dateStr) {
    const existing = completions.find(c => c.item_id === itemId && c.completed_date === dateStr)
    if (existing) {
      await supabase.from('informes_completions').delete().eq('id', existing.id)
    } else {
      await supabase.from('informes_completions').insert({ item_id: itemId, completed_date: dateStr })
    }
    load()
  }

  async function moveTask(id, status) {
    await supabase.from('informes_items').update({ status }).eq('id', id)
    load()
  }

  const daily = items.filter(i => i.category === 'diario')
  const weekly = items.filter(i => i.category === 'semanal')
  const tasks = items.filter(i => i.category === 'tarea')

  const dailyDone = daily.filter(i => completions.some(c => c.item_id === i.id && c.completed_date === today)).length
  const weeklyDone = weekly.filter(i => completions.some(c => c.item_id === i.id && c.completed_date >= weekStart && c.completed_date <= weekEnd)).length

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Tablero CEDI</h1>
          <p style={styles.subtitle}>Operaciones CEDI Madrid — Paqueteo</p>
        </div>
        <div style={styles.headerStats}>
          <StatPill label="Diario" value={`${dailyDone}/${daily.length}`} color="var(--green)" />
          <StatPill label="Semanal" value={`${weeklyDone}/${weekly.length}`} color="var(--accent)" />
          <StatPill label="Tareas" value={`${tasks.filter(t => t.status === 'hecho').length}/${tasks.length}`} color="var(--amber)" />
        </div>
      </header>

      <nav style={styles.tabs}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{ ...styles.tabBtn, ...(tab === t.key ? styles.tabBtnActive : {}) }}
          >
            <span style={{ marginRight: 8 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </nav>

      <main style={styles.main}>
        {loading ? (
          <div style={styles.loading}>Cargando…</div>
        ) : tab === 'diario' ? (
          <DailyView items={daily} completions={completions} today={today} onToggle={toggleCompletion} onRemove={removeItem} />
        ) : tab === 'semanal' ? (
          <WeeklyView items={weekly} completions={completions} weekStart={weekStart} weekEnd={weekEnd} onToggle={toggleCompletion} onRemove={removeItem} />
        ) : (
          <KanbanView items={tasks} onMove={moveTask} onRemove={removeItem} />
        )}

        <form onSubmit={addItem} style={styles.addForm}>
          <input
            style={styles.input}
            placeholder={tab === 'tarea' ? 'Nueva tarea…' : `Nuevo informe ${tab}…`}
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          {tab === 'semanal' && (
            <select style={styles.select} value={newWeekday} onChange={e => setNewWeekday(e.target.value)}>
              {WEEKDAYS.map((w, idx) => (
                <option key={idx} value={idx}>{w}</option>
              ))}
            </select>
          )}
          <button type="submit" style={styles.addBtn}>+ Agregar</button>
        </form>
      </main>
    </div>
  )
}

function StatPill({ label, value, color }) {
  return (
    <div style={{ ...styles.statPill, borderColor: color }}>
      <span style={{ color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      <span style={{ color, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15 }}>{value}</span>
    </div>
  )
}

function Led({ state }) {
  const color = state === 'done' ? 'var(--green)' : state === 'late' ? 'var(--red)' : 'var(--amber)'
  const glow = state === 'done' ? 'var(--green-glow)' : state === 'late' ? 'var(--red-glow)' : 'var(--amber-glow)'
  return <span style={{ ...styles.led, background: color, boxShadow: `0 0 10px ${glow}` }} />
}

function DailyView({ items, completions, today, onToggle, onRemove }) {
  if (items.length === 0) return <EmptyState text="Sin informes diarios. Agrega el primero abajo." />
  return (
    <div style={styles.list}>
      {items.map(item => {
        const done = completions.some(c => c.item_id === item.id && c.completed_date === today)
        return (
          <div key={item.id} style={styles.row} onClick={() => onToggle(item.id, today)}>
            <Led state={done ? 'done' : 'pending'} />
            <span style={{ ...styles.rowLabel, ...(done ? styles.rowLabelDone : {}) }}>{item.name}</span>
            <span style={styles.rowMeta}>{done ? 'Enviado hoy' : 'Pendiente'}</span>
            <button style={styles.deleteBtn} onClick={e => { e.stopPropagation(); onRemove(item.id) }}>✕</button>
          </div>
        )
      })}
    </div>
  )
}

function WeeklyView({ items, completions, weekStart, weekEnd, onToggle, onRemove }) {
  const todayDow = new Date().getDay()
  if (items.length === 0) return <EmptyState text="Sin informes semanales. Agrega el primero abajo." />
  return (
    <div style={styles.list}>
      {items.map(item => {
        const done = completions.some(c => c.item_id === item.id && c.completed_date >= weekStart && c.completed_date <= weekEnd)
        const isLate = !done && item.target_weekday !== null && (
          item.target_weekday === 0 ? todayDow !== 0 : todayDow > item.target_weekday || todayDow === 0
        )
        const state = done ? 'done' : isLate ? 'late' : 'pending'
        return (
          <div key={item.id} style={styles.row} onClick={() => onToggle(item.id, localDateStr())}>
            <Led state={state} />
            <span style={{ ...styles.rowLabel, ...(done ? styles.rowLabelDone : {}) }}>{item.name}</span>
            <span style={styles.rowMeta}>
              {item.target_weekday !== null ? `Meta: ${WEEKDAYS_SHORT[item.target_weekday]}` : 'Cualquier día'}
              {' · '}{done ? 'Completado' : isLate ? 'Vencido' : 'Pendiente'}
            </span>
            <button style={styles.deleteBtn} onClick={e => { e.stopPropagation(); onRemove(item.id) }}>✕</button>
          </div>
        )
      })}
    </div>
  )
}

const KANBAN_COLS = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'en_progreso', label: 'En progreso' },
  { key: 'hecho', label: 'Hecho' },
]

function KanbanView({ items, onMove, onRemove }) {
  if (items.length === 0) return <EmptyState text="Sin tareas. Agrega la primera abajo." />
  return (
    <div style={styles.kanban}>
      {KANBAN_COLS.map(col => (
        <div key={col.key} style={styles.kanbanCol}>
          <div style={styles.kanbanColHeader}>
            {col.label}
            <span style={styles.kanbanCount}>{items.filter(i => i.status === col.key).length}</span>
          </div>
          <div style={styles.kanbanColBody}>
            {items.filter(i => i.status === col.key).map(item => (
              <div key={item.id} style={styles.kanbanCard}>
                <div style={styles.kanbanCardTitle}>{item.name}</div>
                <div style={styles.kanbanCardActions}>
                  {KANBAN_COLS.filter(c => c.key !== col.key).map(c => (
                    <button key={c.key} style={styles.kanbanMoveBtn} onClick={() => onMove(item.id, c.key)}>
                      → {c.label}
                    </button>
                  ))}
                  <button style={styles.deleteBtnSmall} onClick={() => onRemove(item.id)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ text }) {
  return <div style={styles.empty}>{text}</div>
}

const styles = {
  app: { maxWidth: 900, margin: '0 auto', padding: '32px 20px 80px', minHeight: '100%' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 28 },
  title: { fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: -0.5 },
  subtitle: { color: 'var(--text-dim)', margin: '4px 0 0', fontSize: 14 },
  headerStats: { display: 'flex', gap: 10 },
  statPill: { display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 14px', borderRadius: 10, background: 'var(--bg-panel)', border: '1px solid', minWidth: 84 },
  tabs: { display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid var(--border-soft)', paddingBottom: 12 },
  tabBtn: { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '9px 16px', borderRadius: 9, fontSize: 14, fontWeight: 600, transition: 'all .15s' },
  tabBtnActive: { background: 'var(--accent-dim)', borderColor: 'var(--accent)', color: 'var(--text)' },
  main: {},
  loading: { color: 'var(--text-dim)', padding: 40, textAlign: 'center' },
  list: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 },
  row: { display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-panel)', border: '1px solid var(--border-soft)', borderRadius: 10, padding: '13px 16px', cursor: 'pointer', transition: 'border-color .15s' },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: 500 },
  rowLabelDone: { color: 'var(--text-dim)', textDecoration: 'line-through' },
  rowMeta: { fontSize: 12, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' },
  led: { width: 11, height: 11, borderRadius: '50%', flexShrink: 0 },
  deleteBtn: { background: 'transparent', border: 'none', color: 'var(--text-faint)', fontSize: 14, padding: 4 },
  deleteBtnSmall: { background: 'transparent', border: 'none', color: 'var(--text-faint)', fontSize: 12, padding: '2px 6px', marginLeft: 'auto' },
  empty: { color: 'var(--text-faint)', padding: '40px 0', textAlign: 'center', fontSize: 14, marginBottom: 20 },
  addForm: { display: 'flex', gap: 8, position: 'sticky', bottom: 16 },
  input: { flex: 1, background: 'var(--bg-panel-2)', border: '1px solid var(--border)', borderRadius: 9, padding: '11px 14px', color: 'var(--text)', fontSize: 14, outline: 'none' },
  select: { background: 'var(--bg-panel-2)', border: '1px solid var(--border)', borderRadius: 9, padding: '11px 10px', color: 'var(--text)', fontSize: 14 },
  addBtn: { background: 'var(--accent)', border: 'none', borderRadius: 9, padding: '11px 18px', color: '#fff', fontSize: 14, fontWeight: 700 },
  kanban: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 },
  kanbanCol: { background: 'var(--bg-panel)', border: '1px solid var(--border-soft)', borderRadius: 12, padding: 12, minHeight: 200 },
  kanbanColHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-dim)', marginBottom: 12 },
  kanbanCount: { background: 'var(--bg-panel-2)', borderRadius: 6, padding: '1px 7px', fontFamily: 'var(--font-mono)' },
  kanbanColBody: { display: 'flex', flexDirection: 'column', gap: 8 },
  kanbanCard: { background: 'var(--bg-panel-2)', border: '1px solid var(--border)', borderRadius: 9, padding: 11 },
  kanbanCardTitle: { fontSize: 13.5, fontWeight: 500, marginBottom: 8 },
  kanbanCardActions: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  kanbanMoveBtn: { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', fontSize: 10.5, padding: '3px 7px', borderRadius: 6 },
}
