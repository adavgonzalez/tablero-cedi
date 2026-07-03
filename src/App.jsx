import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Sun, CalendarDays, LayoutGrid, Flame, Trash2, Pencil,
  Plus, Clock, CheckCircle2, Radio, ChevronRight, Circle,
} from 'lucide-react'
import { supabase } from './supabase'

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const HISTORY_DAYS = 30

function localDateStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(d, n) {
  const date = new Date(d)
  date.setDate(date.getDate() + n)
  return date
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
  const sunday = addDays(monday, 6)
  return { start: localDateStr(monday), end: localDateStr(sunday) }
}

function turnoLabel(hour) {
  if (hour < 12) return 'Turno Mañana'
  if (hour < 18) return 'Turno Tarde'
  return 'Turno Noche'
}

const TABS = [
  { key: 'diario', label: 'Diario', Icon: Sun },
  { key: 'semanal', label: 'Semanal', Icon: CalendarDays },
  { key: 'tarea', label: 'Tareas', Icon: LayoutGrid },
]

export default function App() {
  const [tab, setTab] = useState('diario')
  const [items, setItems] = useState([])
  const [completions, setCompletions] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newWeekday, setNewWeekday] = useState('1')
  const [newTime, setNewTime] = useState('')
  const [now, setNow] = useState(new Date())
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')

  const today = localDateStr()
  const { start: weekStart, end: weekEnd } = weekRange()

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(t)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const cutoff = localDateStr(addDays(new Date(), -HISTORY_DAYS))
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
      target_time: tab === 'diario' && newTime ? newTime : null,
      status: 'backlog',
    }
    await supabase.from('informes_items').insert(payload)
    setNewName('')
    setNewTime('')
    load()
  }

  async function removeItem(id) {
    await supabase.from('informes_items').update({ archived: true }).eq('id', id)
    load()
  }

  async function renameItem(id) {
    const name = renameValue.trim()
    setRenamingId(null)
    if (!name) return
    await supabase.from('informes_items').update({ name }).eq('id', id)
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
  const boardClean = daily.length > 0 && dailyDone === daily.length

  // Streak: consecutive days (ending today, or yesterday if today incomplete) where every daily item was completed.
  const streak = (() => {
    if (daily.length === 0) return 0
    let n = 0
    let cursor = boardClean ? new Date() : addDays(new Date(), -1)
    for (let i = 0; i < HISTORY_DAYS; i++) {
      const ds = localDateStr(cursor)
      const allDone = daily.every(item => completions.some(c => c.item_id === item.id && c.completed_date === ds))
      if (!allDone) break
      n++
      cursor = addDays(cursor, -1)
    }
    return n
  })()

  return (
    <div style={styles.app}>
      <Header now={now} dailyDone={dailyDone} dailyTotal={daily.length} streak={streak} />

      <nav style={styles.tabs}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{ ...styles.tabBtn, ...(tab === t.key ? styles.tabBtnActive : {}) }}
          >
            <t.Icon size={15} strokeWidth={2.25} style={{ marginRight: 8, verticalAlign: -3 }} />
            {t.label}
            {t.key === 'diario' && daily.length > 0 && (
              <span style={{ ...styles.tabCount, ...(dailyDone === daily.length ? styles.tabCountDone : {}) }}>{dailyDone}/{daily.length}</span>
            )}
            {t.key === 'semanal' && weekly.length > 0 && (
              <span style={{ ...styles.tabCount, ...(weeklyDone === weekly.length ? styles.tabCountDone : {}) }}>{weeklyDone}/{weekly.length}</span>
            )}
            {t.key === 'tarea' && tasks.length > 0 && (
              <span style={styles.tabCount}>{tasks.filter(x => x.status !== 'hecho').length}</span>
            )}
          </button>
        ))}
      </nav>

      <main style={styles.main}>
        {loading ? (
          <div style={styles.loading}>Cargando tablero…</div>
        ) : tab === 'diario' ? (
          <>
            {boardClean && <CleanBoardBanner />}
            <DailyView
              items={daily}
              completions={completions}
              today={today}
              now={now}
              onToggle={toggleCompletion}
              onRemove={removeItem}
              renamingId={renamingId} renameValue={renameValue}
              setRenamingId={setRenamingId} setRenameValue={setRenameValue} onRename={renameItem}
            />
          </>
        ) : tab === 'semanal' ? (
          <WeeklyView
            items={weekly} completions={completions} weekStart={weekStart} weekEnd={weekEnd}
            onToggle={toggleCompletion} onRemove={removeItem}
            renamingId={renamingId} renameValue={renameValue}
            setRenamingId={setRenamingId} setRenameValue={setRenameValue} onRename={renameItem}
          />
        ) : (
          <KanbanView items={tasks} onMove={moveTask} onRemove={removeItem}
            renamingId={renamingId} renameValue={renameValue}
            setRenamingId={setRenamingId} setRenameValue={setRenameValue} onRename={renameItem}
          />
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
          {tab === 'diario' && (
            <input
              type="time"
              style={{ ...styles.select, colorScheme: 'dark' }}
              value={newTime}
              title="Hora límite (opcional)"
              onChange={e => setNewTime(e.target.value)}
            />
          )}
          <button type="submit" style={styles.addBtn}><Plus size={15} strokeWidth={2.5} style={{ verticalAlign: -2, marginRight: 4 }} />Agregar</button>
        </form>
      </main>
    </div>
  )
}

function Header({ now, dailyDone, dailyTotal, streak }) {
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const dayName = WEEKDAYS[now.getDay()]
  const dateStr = now.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }).replace('.', '')

  return (
    <header style={styles.header} className="flap-in">
      <div style={styles.headerBezel} className="header-bezel">
        <div style={styles.headerLeft}>
          <div style={styles.liveRow}>
            <Radio size={11} className="blink-dot" color="var(--led-green)" strokeWidth={2.5} />
            <span style={styles.liveText}>EN LÍNEA</span>
          </div>
          <h1 style={styles.title} className="board-title">TABLERO&nbsp;CEDI</h1>
          <p style={styles.subtitle}>Operaciones CEDI Madrid — Paqueteo</p>
        </div>

        <div style={styles.headerRight} className="header-right">
          <div style={styles.clockBlock} className="clock-block">
            <span style={styles.clockDigits}>{hh}:{mm}</span>
            <span style={styles.clockMeta}>{dayName} {dateStr} · {turnoLabel(now.getHours())}</span>
          </div>
          <div style={styles.metricsRow}>
            <Metric label="Hoy" value={`${dailyDone}/${dailyTotal}`} color="var(--led-green)" />
            <Metric label="Racha" value={streak} icon={streak > 0 ? Flame : null} color="var(--led-amber)" />
          </div>
        </div>
      </div>
    </header>
  )
}

function Metric({ label, value, color, icon: Icon }) {
  return (
    <div style={{ ...styles.metric, borderColor: color }}>
      {Icon && <Icon size={13} color={color} strokeWidth={2.5} />}
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, color }}>{value}</span>
      <span style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</span>
    </div>
  )
}

function CleanBoardBanner() {
  return (
    <div style={styles.banner} className="pop-in">
      <CheckCircle2 size={17} color="var(--led-green)" strokeWidth={2.5} />
      <span style={{ fontWeight: 700 }}>Tablero limpio</span>
      <span style={{ color: 'var(--text-dim)' }}>— todos los informes de hoy están enviados.</span>
    </div>
  )
}

function Led({ state, live }) {
  const color = state === 'done' ? 'var(--led-green)' : state === 'late' ? 'var(--led-red)' : 'var(--led-amber)'
  const glow = state === 'done' ? 'var(--led-green-glow)' : state === 'late' ? 'var(--led-red-glow)' : 'var(--led-amber-glow)'
  return (
    <span
      className={live ? 'led-live' : ''}
      style={{ ...styles.led, background: color, boxShadow: `0 0 8px ${glow}`, '--glow-color': glow }}
    />
  )
}

function HistoryDots({ itemId, completions, days = 7 }) {
  const cells = []
  for (let i = days - 1; i >= 0; i--) {
    const ds = localDateStr(addDays(new Date(), -i))
    const done = completions.some(c => c.item_id === itemId && c.completed_date === ds)
    cells.push({ ds, done })
  }
  return (
    <div style={styles.historyRow} title="Últimos 7 días">
      {cells.map(c => (
        <span key={c.ds} style={{ ...styles.historyDot, background: c.done ? 'var(--led-green)' : 'var(--steel-600)' }} />
      ))}
    </div>
  )
}

function ItemLabel({ item, done, renamingId, renameValue, setRenamingId, setRenameValue, onRename }) {
  const inputRef = useRef(null)
  useEffect(() => { if (renamingId === item.id) inputRef.current?.focus() }, [renamingId, item.id])

  if (renamingId === item.id) {
    return (
      <input
        ref={inputRef}
        style={styles.renameInput}
        value={renameValue}
        onClick={e => e.stopPropagation()}
        onChange={e => setRenameValue(e.target.value)}
        onBlur={() => onRename(item.id)}
        onKeyDown={e => { if (e.key === 'Enter') onRename(item.id); if (e.key === 'Escape') setRenamingId(null) }}
      />
    )
  }
  return (
    <span
      style={{ ...styles.rowLabel, ...(done ? styles.rowLabelDone : {}) }}
      onDoubleClick={e => { e.stopPropagation(); setRenamingId(item.id); setRenameValue(item.name) }}
      title="Doble clic para renombrar"
    >
      {item.name}
    </span>
  )
}

function DailyView({ items, completions, today, now, onToggle, onRemove, ...renameProps }) {
  if (items.length === 0) return <EmptyState text="Sin informes diarios. Agrega el primero abajo." />
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const sorted = [...items].sort((a, b) => (a.target_time || '99:99').localeCompare(b.target_time || '99:99'))
  return (
    <div style={styles.list}>
      {sorted.map(item => {
        const done = completions.some(c => c.item_id === item.id && c.completed_date === today)
        let state = 'pending'
        if (done) state = 'done'
        else if (item.target_time) {
          const [h, m] = item.target_time.split(':').map(Number)
          if (nowMin > h * 60 + m) state = 'late'
        }
        return (
          <div key={item.id} style={styles.row} onClick={() => onToggle(item.id, today)}>
            <Led state={state} live={state !== 'done'} />
            <div style={styles.rowMain}>
              <ItemLabel item={item} done={done} {...renameProps} />
              <HistoryDots itemId={item.id} completions={completions} />
            </div>
            <span style={{ ...styles.rowMeta, color: state === 'late' ? 'var(--led-red)' : 'var(--text-faint)' }}>
              {item.target_time && <><Clock size={11} strokeWidth={2.5} style={{ verticalAlign: -2, marginRight: 3 }} />{item.target_time.slice(0, 5)}</>}
              {' '}{done ? 'Enviado' : state === 'late' ? 'Vencido' : 'Pendiente'}
            </span>
            <button style={styles.deleteBtn} onClick={e => { e.stopPropagation(); onRemove(item.id) }}><Trash2 size={13} strokeWidth={2} /></button>
          </div>
        )
      })}
    </div>
  )
}

function WeeklyView({ items, completions, weekStart, weekEnd, onToggle, onRemove, ...renameProps }) {
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
            <Led state={state} live={state !== 'done'} />
            <div style={styles.rowMain}>
              <ItemLabel item={item} done={done} {...renameProps} />
            </div>
            <span style={{ ...styles.rowMeta, color: state === 'late' ? 'var(--led-red)' : 'var(--text-faint)' }}>
              {item.target_weekday !== null ? `Meta ${WEEKDAYS_SHORT[item.target_weekday]}` : 'Cualquier día'}
              {' · '}{done ? 'Completado' : isLate ? 'Vencido' : 'Pendiente'}
            </span>
            <button style={styles.deleteBtn} onClick={e => { e.stopPropagation(); onRemove(item.id) }}><Trash2 size={13} strokeWidth={2} /></button>
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

function KanbanView({ items, onMove, onRemove, ...renameProps }) {
  if (items.length === 0) return <EmptyState text="Sin tareas. Agrega la primera abajo." />
  return (
    <div style={styles.kanban} className="kanban-grid">
      {KANBAN_COLS.map(col => (
        <div key={col.key} style={styles.kanbanCol}>
          <div style={styles.kanbanColHeader}>
            {col.label}
            <span style={styles.kanbanCount}>{items.filter(i => i.status === col.key).length}</span>
          </div>
          <div style={styles.kanbanColBody}>
            {items.filter(i => i.status === col.key).length === 0 && (
              <div style={styles.kanbanEmpty}>Vacío</div>
            )}
            {items.filter(i => i.status === col.key).map(item => (
              <div key={item.id} style={styles.kanbanCard}>
                <ItemLabel item={item} done={col.key === 'hecho'} {...renameProps} />
                <div style={styles.kanbanCardActions}>
                  {KANBAN_COLS.filter(c => c.key !== col.key).map(c => (
                    <button key={c.key} style={styles.kanbanMoveBtn} onClick={() => onMove(item.id, c.key)}>
                      <ChevronRight size={11} strokeWidth={2.5} style={{ verticalAlign: -2 }} />{c.label}
                    </button>
                  ))}
                  <button style={styles.deleteBtnSmall} onClick={() => onRemove(item.id)}><Trash2 size={12} strokeWidth={2} /></button>
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
  return (
    <div style={styles.empty}>
      <Circle size={20} strokeWidth={1.5} color="var(--text-faint)" style={{ marginBottom: 8 }} />
      <div>{text}</div>
    </div>
  )
}

const styles = {
  app: { maxWidth: 920, margin: '0 auto', padding: '24px 20px 80px', minHeight: '100%' },

  header: { marginBottom: 22 },
  headerBezel: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 18,
    background: 'linear-gradient(180deg, var(--steel-800), var(--steel-900))',
    border: '1px solid var(--steel-line)', borderRadius: 'var(--radius-lg)',
    padding: '20px 24px', position: 'relative', overflow: 'hidden',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 24px rgba(0,0,0,0.35)',
  },
  headerLeft: {},
  liveRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 },
  liveText: { fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 1.5, color: 'var(--led-green)', fontWeight: 700 },
  title: {
    fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 800, margin: 0,
    letterSpacing: 1, lineHeight: 0.95, color: 'var(--text)',
    textShadow: '0 0 24px rgba(62, 224, 138, 0.15)',
  },
  subtitle: { color: 'var(--text-dim)', margin: '6px 0 0', fontSize: 13, fontFamily: 'var(--font-mono)' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' },
  clockBlock: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', paddingRight: 18, borderRight: '1px solid var(--steel-line)' },
  clockDigits: { fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 700, color: 'var(--led-blue)', letterSpacing: 1, textShadow: '0 0 16px var(--led-blue-glow)' },
  clockMeta: { fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 0.5 },
  metricsRow: { display: 'flex', gap: 10 },
  metric: { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: '1px solid', background: 'var(--steel-700)' },

  tabs: { display: 'flex', gap: 8, marginBottom: 18 },
  tabBtn: {
    display: 'flex', alignItems: 'center', background: 'var(--steel-800)', border: '1px solid var(--steel-line)',
    color: 'var(--text-dim)', padding: '10px 16px', borderRadius: 9, fontSize: 13.5, fontWeight: 600,
    transition: 'all .15s',
  },
  tabBtnActive: { background: 'var(--steel-700)', borderColor: 'var(--led-green)', color: 'var(--text)', boxShadow: '0 0 0 1px rgba(62,224,138,0.15)' },
  tabCount: { marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--steel-600)', color: 'var(--text-dim)', borderRadius: 5, padding: '1px 6px' },
  tabCountDone: { background: 'var(--led-green-dim)', color: 'var(--led-green)' },

  main: {},
  loading: { color: 'var(--text-dim)', padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)' },

  banner: {
    display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14, padding: '11px 16px',
    background: 'linear-gradient(90deg, var(--led-green-dim), var(--steel-800))',
    border: '1px solid rgba(62,224,138,0.35)', borderRadius: 9, fontSize: 13.5,
  },

  list: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 },
  row: {
    display: 'flex', alignItems: 'center', gap: 13, background: 'var(--steel-800)',
    border: '1px solid var(--steel-line)', borderRadius: 10, padding: '13px 16px', cursor: 'pointer',
    transition: 'border-color .15s, transform .1s',
  },
  rowMain: { flex: 1, display: 'flex', flexDirection: 'column', gap: 5 },
  rowLabel: { fontSize: 14.5, fontWeight: 500 },
  rowLabelDone: { color: 'var(--text-dim)', textDecoration: 'line-through' },
  rowMeta: { fontSize: 11.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' },
  led: { width: 11, height: 11, borderRadius: '50%', flexShrink: 0 },

  historyRow: { display: 'flex', gap: 4 },
  historyDot: { width: 6, height: 6, borderRadius: '50%' },

  renameInput: {
    fontSize: 14.5, fontWeight: 500, background: 'var(--steel-600)', border: '1px solid var(--led-blue)',
    borderRadius: 5, padding: '2px 6px', color: 'var(--text)', outline: 'none', width: '90%',
  },

  deleteBtn: { background: 'transparent', border: 'none', color: 'var(--text-faint)', padding: 4, display: 'flex' },
  deleteBtnSmall: { background: 'transparent', border: 'none', color: 'var(--text-faint)', padding: '2px 4px', marginLeft: 'auto', display: 'flex' },

  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--text-faint)', padding: '44px 0', textAlign: 'center', fontSize: 13.5, marginBottom: 20 },

  addForm: { display: 'flex', gap: 8, position: 'sticky', bottom: 16, flexWrap: 'wrap' },
  input: { flex: 1, minWidth: 160, background: 'var(--steel-700)', border: '1px solid var(--steel-line)', borderRadius: 9, padding: '11px 14px', color: 'var(--text)', fontSize: 14, outline: 'none' },
  select: { background: 'var(--steel-700)', border: '1px solid var(--steel-line)', borderRadius: 9, padding: '11px 10px', color: 'var(--text)', fontSize: 13.5 },
  addBtn: { display: 'flex', alignItems: 'center', background: 'var(--led-green)', border: 'none', borderRadius: 9, padding: '11px 18px', color: '#052013', fontSize: 14, fontWeight: 700 },

  kanban: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 },
  kanbanCol: { background: 'var(--steel-800)', border: '1px solid var(--steel-line)', borderRadius: 12, padding: 12, minHeight: 200 },
  kanbanColHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--text-dim)', marginBottom: 12 },
  kanbanCount: { background: 'var(--steel-600)', borderRadius: 6, padding: '1px 7px', fontFamily: 'var(--font-mono)' },
  kanbanColBody: { display: 'flex', flexDirection: 'column', gap: 8 },
  kanbanEmpty: { fontSize: 11.5, color: 'var(--text-faint)', textAlign: 'center', padding: '16px 0' },
  kanbanCard: { background: 'var(--steel-700)', border: '1px solid var(--steel-line)', borderRadius: 9, padding: 11 },
  kanbanCardActions: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 9 },
  kanbanMoveBtn: { display: 'flex', alignItems: 'center', gap: 2, background: 'transparent', border: '1px solid var(--steel-line)', color: 'var(--text-dim)', fontSize: 10.5, padding: '3px 7px', borderRadius: 6 },
}
