import { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react'
import {
  Sun, CalendarDays, LayoutGrid, Flame, Trash2, Pencil,
  Plus, Clock, CheckCircle2, Radio, ChevronRight, Circle, PenLine, Link2, Inbox,
  ListChecks, NotebookPen, Tag, ChevronDown, StickyNote, Timer,
} from 'lucide-react'
import { supabase } from './supabase'
import SplitFlap from './SplitFlap'
import { AREAS, areaMeta } from './constants'

const DiagramsView = lazy(() => import('./DiagramsView'))
const InboxView = lazy(() => import('./InboxView'))
const BitacoraView = lazy(() => import('./BitacoraView'))
const HorasView = lazy(() => import('./HorasView'))

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
  { key: 'hoy', label: 'Hoy', Icon: ListChecks },
  { key: 'bandeja', label: 'Bandeja', Icon: Inbox },
  { key: 'diario', label: 'Diario', Icon: Sun },
  { key: 'semanal', label: 'Semanal', Icon: CalendarDays },
  { key: 'tarea', label: 'Tareas', Icon: LayoutGrid },
  { key: 'diagramas', label: 'Diagramas', Icon: PenLine },
  { key: 'horas', label: 'Horas extra', Icon: Timer },
  { key: 'bitacora', label: 'Bitácora', Icon: NotebookPen },
]

export default function App() {
  const [tab, setTab] = useState('hoy')
  const [items, setItems] = useState([])
  const [completions, setCompletions] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newWeekday, setNewWeekday] = useState('1')
  const [newTime, setNewTime] = useState('')
  const [now, setNow] = useState(new Date())
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [diagrams, setDiagrams] = useState([])
  const [diagramFocusId, setDiagramFocusId] = useState(null)
  const [peticionesCount, setPeticionesCount] = useState(0)
  const [peticionesUrgentes, setPeticionesUrgentes] = useState([])
  const [expandedItemId, setExpandedItemId] = useState(null)

  const today = localDateStr()
  const { start: weekStart, end: weekEnd } = weekRange()

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const load = useCallback(async () => {
    if (typeof window !== 'undefined' && window.location.search.includes('demo')) {
      const t = localDateStr()
      const y = localDateStr(addDays(new Date(), -1))
      const d2 = localDateStr(addDays(new Date(), -2))
      setItems([
        { id: 'd1', name: 'Inventario cíclico EWM', category: 'diario', position: 1, target_time: '08:00', status: 'backlog', diagram_id: 'g1' },
        { id: 'd2', name: 'MB52 stock valorizado', category: 'diario', position: 2, target_time: '10:30', status: 'backlog' },
        { id: 'd3', name: 'Avance de picking paqueteo', category: 'diario', position: 3, target_time: '14:00', status: 'backlog' },
        { id: 'w1', name: 'Ocupación CEDI semanal', category: 'semanal', position: 1, target_weekday: 5, status: 'backlog' },
        { id: 'w2', name: 'Indicadores modulación', category: 'semanal', position: 2, target_weekday: 2, status: 'backlog' },
        { id: 't1', name: 'Refactor M_Plan_ERP', category: 'tarea', position: 1, status: 'en_progreso', diagram_id: 'g1' },
        { id: 't2', name: 'Documentar flujo VT11→VL06F', category: 'tarea', position: 2, status: 'backlog' },
        { id: 't3', name: 'Cierre remesas TCC', category: 'tarea', position: 3, status: 'hecho' },
      ])
      setCompletions([
        { id: 'c1', item_id: 'd1', completed_date: t },
        { id: 'c2', item_id: 'd1', completed_date: y },
        { id: 'c3', item_id: 'd1', completed_date: d2 },
        { id: 'c4', item_id: 'd2', completed_date: y },
      ])
      setDiagrams([{ id: 'g1', name: 'Pipeline SAP' }])
      setPeticionesCount(3)
      setPeticionesUrgentes([
        { id: 'p1', titulo: 'Reporte de devoluciones por transportadora', prioridad: 'alta', area: 'facturacion', fecha_limite: localDateStr() },
      ])
      setLoading(false)
      return
    }
    setLoading(true)
    const cutoff = localDateStr(addDays(new Date(), -HISTORY_DAYS))
    const today2 = localDateStr()
    const [{ data: itemsData }, { data: compData }, { data: diagramsData }, { count: petCount }, { data: urgentes }] = await Promise.all([
      supabase.from('informes_items').select('*').eq('archived', false).order('position', { ascending: true }),
      supabase.from('informes_completions').select('*').gte('completed_date', cutoff),
      supabase.from('diagrams').select('id, name').eq('archived', false).order('position', { ascending: true }),
      supabase.from('peticiones').select('id', { count: 'exact', head: true }).eq('estado', 'abierta'),
      supabase.from('peticiones').select('id, titulo, prioridad, area, fecha_limite').eq('estado', 'abierta').or(`prioridad.eq.alta,fecha_limite.lte.${today2}`).order('fecha_limite', { ascending: true }),
    ])
    setItems(itemsData || [])
    setCompletions(compData || [])
    setDiagrams(diagramsData || [])
    setPeticionesCount(petCount || 0)
    setPeticionesUrgentes(urgentes || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const channel = supabase
      .channel('informes-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'informes_items' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'informes_completions' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'diagrams' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'peticiones' }, load)
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

  async function saveItemMeta(id, patch) {
    await supabase.from('informes_items').update(patch).eq('id', id)
    load()
  }

  async function linkDiagram(itemId, diagramId) {
    await supabase.from('informes_items').update({ diagram_id: diagramId }).eq('id', itemId)
    load()
  }

  async function createDiagramForItem(item) {
    const maxPos = diagrams.reduce((m, d) => Math.max(m, d.position || 0), 0)
    const { data, error } = await supabase
      .from('diagrams')
      .insert({ name: item.name, scene: {}, position: maxPos + 1 })
      .select('id, name')
      .single()
    if (error || !data) return
    await supabase.from('informes_items').update({ diagram_id: data.id }).eq('id', item.id)
    setDiagramFocusId(data.id)
    setTab('diagramas')
    load()
  }

  function jumpToDiagram(diagramId) {
    setDiagramFocusId(diagramId)
    setTab('diagramas')
  }

  const daily = items.filter(i => i.category === 'diario')
  const weekly = items.filter(i => i.category === 'semanal')
  const tasks = items.filter(i => i.category === 'tarea')

  const dailyDone = daily.filter(i => completions.some(c => c.item_id === i.id && c.completed_date === today)).length
  const weeklyDone = weekly.filter(i => completions.some(c => c.item_id === i.id && c.completed_date >= weekStart && c.completed_date <= weekEnd)).length
  const boardClean = daily.length > 0 && dailyDone === daily.length

  const todayDow = new Date().getDay()
  const dailyPendientes = daily.filter(i => !completions.some(c => c.item_id === i.id && c.completed_date === today)).length
  const weeklyHoy = weekly.filter(i => i.target_weekday === todayDow && !completions.some(c => c.item_id === i.id && c.completed_date >= weekStart && c.completed_date <= weekEnd)).length
  const urgentesHoy = peticionesUrgentes.length

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
    <div style={{ ...styles.app, maxWidth: tab === 'diagramas' ? 1400 : 920 }}>
      <Header now={now} dailyDone={dailyDone} dailyTotal={daily.length} streak={streak} />

      <nav style={styles.tabsWrap} className="boot-tabs">
        <div style={styles.tabs}>
          {TABS.map(t => {
            const active = tab === t.key
            let badge = null
            if (t.key === 'hoy' && (dailyPendientes + weeklyHoy + urgentesHoy) > 0) badge = { n: dailyPendientes + weeklyHoy + urgentesHoy, tone: 'var(--accent)' }
            if (t.key === 'bandeja' && peticionesCount > 0) badge = { n: peticionesCount, tone: 'var(--late)' }
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{ ...styles.tabBtn, ...(active ? styles.tabBtnActive : {}) }}
              >
                <t.Icon size={15} strokeWidth={active ? 2.5 : 2} />
                <span>{t.label}</span>
                {badge && <span style={{ ...styles.tabDot, background: badge.tone }}>{badge.n}</span>}
              </button>
            )
          })}
        </div>
      </nav>

      <main style={styles.main}>
        {loading && tab !== 'diagramas' && tab !== 'bandeja' && tab !== 'bitacora' && tab !== 'horas' ? (
          <div style={styles.loading}>Cargando tablero…</div>
        ) : tab === 'hoy' ? (
          <HoyView
            daily={daily} weekly={weekly} tasks={tasks} completions={completions}
            today={today} weekStart={weekStart} weekEnd={weekEnd} todayDow={todayDow}
            peticionesUrgentes={peticionesUrgentes} now={now}
            onToggle={toggleCompletion} goTo={setTab}
          />
        ) : tab === 'bandeja' ? (
          <Suspense fallback={<div style={styles.loading}>Cargando bandeja…</div>}>
            <InboxView onConverted={() => { load() }} />
          </Suspense>
        ) : tab === 'bitacora' ? (
          <Suspense fallback={<div style={styles.loading}>Cargando bitácora…</div>}>
            <BitacoraView />
          </Suspense>
        ) : tab === 'horas' ? (
          <Suspense fallback={<div style={styles.loading}>Cargando horas…</div>}>
            <HorasView />
          </Suspense>
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
              diagrams={diagrams} onLinkDiagram={linkDiagram} onCreateDiagram={createDiagramForItem} onJumpDiagram={jumpToDiagram}
              expandedItemId={expandedItemId} setExpandedItemId={setExpandedItemId} onSaveMeta={saveItemMeta}
            />
          </>
        ) : tab === 'semanal' ? (
          <WeeklyView
            items={weekly} completions={completions} weekStart={weekStart} weekEnd={weekEnd}
            onToggle={toggleCompletion} onRemove={removeItem}
            renamingId={renamingId} renameValue={renameValue}
            setRenamingId={setRenamingId} setRenameValue={setRenameValue} onRename={renameItem}
            diagrams={diagrams} onLinkDiagram={linkDiagram} onCreateDiagram={createDiagramForItem} onJumpDiagram={jumpToDiagram}
            expandedItemId={expandedItemId} setExpandedItemId={setExpandedItemId} onSaveMeta={saveItemMeta}
          />
        ) : tab === 'tarea' ? (
          <KanbanView items={tasks} onMove={moveTask} onRemove={removeItem}
            renamingId={renamingId} renameValue={renameValue}
            setRenamingId={setRenamingId} setRenameValue={setRenameValue} onRename={renameItem}
            diagrams={diagrams} onLinkDiagram={linkDiagram} onCreateDiagram={createDiagramForItem} onJumpDiagram={jumpToDiagram}
            expandedItemId={expandedItemId} setExpandedItemId={setExpandedItemId} onSaveMeta={saveItemMeta}
          />
        ) : (
          <Suspense fallback={<div style={styles.loading}>Cargando lienzo…</div>}>
            <DiagramsView focusId={diagramFocusId} onFocusConsumed={() => setDiagramFocusId(null)} />
          </Suspense>
        )}

        {tab !== 'diagramas' && tab !== 'bandeja' && tab !== 'bitacora' && tab !== 'hoy' && tab !== 'horas' && (
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
        )}
      </main>
    </div>
  )
}

function Header({ now, dailyDone, dailyTotal, streak }) {
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  const dayName = WEEKDAYS[now.getDay()].toUpperCase()
  const dateStr = now.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }).replace('.', '').toUpperCase()
  const clean = dailyTotal > 0 && dailyDone === dailyTotal

  return (
    <header style={styles.header} className="boot-header">
      <div style={styles.headerBezel} className="header-bezel">
        {/* rivets */}
        <span style={{ ...styles.rivet, top: 9, left: 9 }} />
        <span style={{ ...styles.rivet, top: 9, right: 9 }} />
        <span style={{ ...styles.rivet, bottom: 9, left: 9 }} />
        <span style={{ ...styles.rivet, bottom: 9, right: 9 }} />

        <div style={styles.headerLeft}>
          <div style={styles.liveRow}>
            <span className="led-live flicker" style={{ ...styles.led, width: 9, height: 9, background: 'var(--online)', '--gc': 'var(--go-glow)' }} />
            <span style={styles.liveText}>OPERANDO EN LÍNEA</span>
            <span style={styles.destChip}>CEDI MADRID</span>
          </div>
          <h1 style={styles.title} className="board-title">TABLERO&nbsp;DE&nbsp;DESPACHO</h1>
          <p style={styles.subtitle}>Operaciones · Paqueteo · {dayName} {dateStr}</p>
        </div>

        <div style={styles.headerRight} className="header-right">
          <div style={styles.clockBlock} className="clock-block">
            <div style={styles.clockRow}>
              <SplitFlap text={hh} size={{ h: 40, w: 27, fs: 30, color: 'var(--accent)' }} />
              <span style={styles.colon}>:</span>
              <SplitFlap text={mm} size={{ h: 40, w: 27, fs: 30, color: 'var(--accent)' }} />
              <span style={styles.secBox}>
                <SplitFlap text={ss} size={{ h: 18, w: 12, fs: 12, color: 'var(--text-dim)' }} />
              </span>
            </div>
            <span style={styles.clockMeta}>{turnoLabel(now.getHours()).toUpperCase()}</span>
          </div>

          <div style={styles.boardStats}>
            <div style={styles.statCol}>
              <span style={styles.statLabel}>Enviados hoy</span>
              <span style={{ ...styles.statBig, color: clean ? 'var(--go)' : 'var(--text)' }}>
                {dailyDone}<span style={styles.statSlash}>/{dailyTotal}</span>
              </span>
            </div>
            <div style={styles.statDivider} />
            <div style={styles.statCol}>
              <span style={styles.statLabel}>Racha</span>
              <span style={styles.streakRow}>
                <SplitFlap text={String(streak).padStart(2, '0')} size={{ h: 24, w: 16, fs: 17, color: streak > 0 ? 'var(--accent)' : 'var(--text-faint)' }} />
                <Flame size={13} color={streak > 0 ? 'var(--accent)' : 'var(--text-faint)'} strokeWidth={2.5} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

function CleanBoardBanner() {
  return (
    <div style={styles.banner} className="banner-rise">
      <span className="led-live" style={{ ...styles.led, width: 9, height: 9, background: 'var(--go)', '--gc': 'var(--go-glow)' }} />
      <span style={{ fontWeight: 800, fontFamily: 'var(--font-sign)', fontSize: 17, letterSpacing: 0.5, color: 'var(--go)' }}>TABLERO LIMPIO</span>
      <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>Todos los informes de hoy están enviados.</span>
    </div>
  )
}

function Led({ state, live }) {
  const map = {
    done: ['var(--go)', 'var(--go-glow)'],
    late: ['var(--late)', 'var(--late-glow)'],
    pending: ['var(--wait)', 'var(--wait-glow)'],
  }
  const [color, glow] = map[state] || map.pending
  return (
    <span
      className={`led-ignite ${live ? 'led-live' : ''}`}
      style={{ ...styles.led, background: color, boxShadow: `0 0 8px ${glow}`, '--gc': glow }}
    />
  )
}

function StatusTag({ label, tone }) {
  const color = tone === 'done' ? 'var(--go)' : tone === 'late' ? 'var(--late)' : 'var(--text-dim)'
  const border = tone === 'done' ? 'var(--go)' : tone === 'late' ? 'var(--late)' : 'var(--edge)'
  const [display, setDisplay] = useState(label)
  const [anim, setAnim] = useState(false)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; setDisplay(label); return }
    if (label === display) return
    setAnim(true)
    const t1 = setTimeout(() => setDisplay(label), 180)
    const t2 = setTimeout(() => setAnim(false), 400)
    return () => { clearTimeout(t1); clearTimeout(t2) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label])
  return (
    <span className={anim ? 'tag-flip' : ''} style={{ ...styles.statusTag, color, borderColor: border }}>
      {display}
    </span>
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

function DiagramLink({ item, diagrams, onLinkDiagram, onCreateDiagram, onJumpDiagram }) {
  const linked = diagrams.find(d => d.id === item.diagram_id)
  return (
    <div style={styles.diagLinkWrap} onClick={e => e.stopPropagation()}>
      {linked && (
        <button style={styles.diagLinkBtn} onClick={() => onJumpDiagram(linked.id)} title={`Abrir diagrama: ${linked.name}`}>
          <PenLine size={11} strokeWidth={2.25} />
          <span style={styles.diagLinkName}>{linked.name}</span>
        </button>
      )}
      {!linked && <Link2 size={12} strokeWidth={2} color="var(--text-faint)" />}
      <select
        style={{ ...styles.diagSelect, ...(linked ? styles.diagSelectLinked : {}) }}
        value=""
        title={linked ? 'Cambiar diagrama vinculado' : 'Vincular un diagrama'}
        onChange={e => {
          const v = e.target.value
          if (v === '__new__') onCreateDiagram(item)
          else if (v === '__unlink__') onLinkDiagram(item.id, null)
          else if (v) onLinkDiagram(item.id, v)
          e.target.value = ''
        }}
      >
        <option value="">{linked ? '⋯' : 'Vincular'}</option>
        {diagrams.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        <option value="__new__">+ Crear nuevo…</option>
        {linked && <option value="__unlink__">Quitar vínculo</option>}
      </select>
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

function HoyView({ daily, weekly, tasks, completions, today, weekStart, weekEnd, todayDow, peticionesUrgentes, now, onToggle, goTo }) {
  const nowMin = now.getHours() * 60 + now.getMinutes()

  const dailyPend = daily
    .filter(i => !completions.some(c => c.item_id === i.id && c.completed_date === today))
    .sort((a, b) => (a.target_time || '99:99').localeCompare(b.target_time || '99:99'))
  const weeklyPend = weekly.filter(i => i.target_weekday === todayDow && !completions.some(c => c.item_id === i.id && c.completed_date >= weekStart && c.completed_date <= weekEnd))
  const tareasActivas = tasks.filter(t => t.status !== 'hecho')

  const totalHoy = dailyPend.length + weeklyPend.length + peticionesUrgentes.length
  const allClear = totalHoy === 0 && daily.length > 0

  return (
    <div>
      {allClear ? (
        <div style={styles.hoyClear} className="banner-rise">
          <span className="led-live" style={{ ...styles.led, width: 10, height: 10, background: 'var(--go)', '--gc': 'var(--go-glow)' }} />
          <div>
            <div style={{ fontFamily: 'var(--font-sign)', fontSize: 22, fontWeight: 800, color: 'var(--go)', letterSpacing: 0.5 }}>DÍA AL DÍA</div>
            <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No tienes pendientes urgentes para hoy. Buen trabajo.</div>
          </div>
        </div>
      ) : (
        <div style={styles.hoyIntro}>
          <span style={styles.hoyIntroBig}>{totalHoy}</span>
          <span style={styles.hoyIntroLabel}>{totalHoy === 1 ? 'cosa pendiente para hoy' : 'cosas pendientes para hoy'}</span>
        </div>
      )}

      {peticionesUrgentes.length > 0 && (
        <HoySection title="Peticiones urgentes" count={peticionesUrgentes.length} tone="var(--late)" onVerMas={() => goTo('bandeja')}>
          {peticionesUrgentes.map(p => (
            <div key={p.id} style={styles.hoyRow} onClick={() => goTo('bandeja')}>
              <span style={{ ...styles.hoyDot, background: 'var(--late)', boxShadow: '0 0 7px var(--late-glow)' }} />
              <span style={styles.hoyRowText}>{p.titulo}</span>
              {areaMeta(p.area) && <ItemAreaChip area={p.area} />}
              <span style={styles.hoyRowMeta}>{p.prioridad === 'alta' ? 'ALTA' : (p.fecha_limite === today ? 'VENCE HOY' : '')}</span>
            </div>
          ))}
        </HoySection>
      )}

      {dailyPend.length > 0 && (
        <HoySection title="Informes diarios por enviar" count={dailyPend.length} tone="var(--accent)" onVerMas={() => goTo('diario')}>
          {dailyPend.map(item => {
            let late = false
            if (item.target_time) { const [h, m] = item.target_time.split(':').map(Number); late = nowMin > h * 60 + m }
            return (
              <div key={item.id} style={styles.hoyRow} onClick={() => onToggle(item.id, today)} title="Marcar como enviado">
                <span style={{ ...styles.hoyCheck, borderColor: late ? 'var(--late)' : 'var(--wait)' }} />
                <span style={styles.hoyRowText}>{item.name}</span>
                <ItemAreaChip area={item.area} />
                <span style={{ ...styles.hoyRowMeta, color: late ? 'var(--late)' : 'var(--text-faint)' }}>
                  {item.target_time ? item.target_time.slice(0, 5) : ''}{late ? ' · VENCIDO' : ''}
                </span>
              </div>
            )
          })}
        </HoySection>
      )}

      {weeklyPend.length > 0 && (
        <HoySection title="Semanales que vencen hoy" count={weeklyPend.length} tone="var(--accent)" onVerMas={() => goTo('semanal')}>
          {weeklyPend.map(item => (
            <div key={item.id} style={styles.hoyRow} onClick={() => onToggle(item.id, today)} title="Marcar como completado">
              <span style={{ ...styles.hoyCheck, borderColor: 'var(--wait)' }} />
              <span style={styles.hoyRowText}>{item.name}</span>
              <ItemAreaChip area={item.area} />
            </div>
          ))}
        </HoySection>
      )}

      {tareasActivas.length > 0 && (
        <HoySection title="Tareas en curso" count={tareasActivas.length} tone="var(--text-dim)" onVerMas={() => goTo('tarea')}>
          {tareasActivas.slice(0, 5).map(item => (
            <div key={item.id} style={styles.hoyRow} onClick={() => goTo('tarea')}>
              <span style={{ ...styles.hoyDot, background: item.status === 'en_progreso' ? 'var(--accent)' : 'var(--text-faint)' }} />
              <span style={styles.hoyRowText}>{item.name}</span>
              <ItemAreaChip area={item.area} />
              <span style={styles.hoyRowMeta}>{item.status === 'en_progreso' ? 'EN PROGRESO' : 'BACKLOG'}</span>
            </div>
          ))}
        </HoySection>
      )}
    </div>
  )
}

function HoySection({ title, count, tone, onVerMas, children }) {
  return (
    <div style={styles.hoySection}>
      <div style={styles.hoySectionHead}>
        <span style={{ ...styles.hoySectionBar, background: tone }} />
        <span style={styles.hoySectionTitle}>{title}</span>
        <span style={{ ...styles.hoySectionCount, color: tone, borderColor: tone }}>{count}</span>
        <button style={styles.hoyVerMas} onClick={onVerMas}>Ver todo <ChevronRight size={12} strokeWidth={2.5} style={{ verticalAlign: -2 }} /></button>
      </div>
      <div style={styles.hoySectionBody}>{children}</div>
    </div>
  )
}

function ItemAreaChip({ area }) {
  const am = areaMeta(area)
  if (!am) return null
  return (
    <span style={{ ...styles.itemAreaChip, color: am.color, borderColor: am.color }}>
      <Tag size={9} strokeWidth={2.5} /> {am.label}
    </span>
  )
}

function NoteToggle({ item, expandedItemId, setExpandedItemId }) {
  const has = item.nota || item.area
  const open = expandedItemId === item.id
  return (
    <button
      style={{ ...styles.noteToggle, color: open || has ? 'var(--accent)' : 'var(--text-faint)', borderColor: open || has ? 'var(--accent-deep)' : 'var(--edge)' }}
      title={has ? 'Ver/editar nota y área' : 'Agregar nota y área'}
      onClick={e => { e.stopPropagation(); setExpandedItemId(open ? null : item.id) }}
    >
      <StickyNote size={13} strokeWidth={2} />
    </button>
  )
}

function ItemEditor({ item, onSaveMeta, onClose }) {
  const [nota, setNota] = useState(item.nota || '')
  const [area, setArea] = useState(item.area || '')
  return (
    <div style={styles.itemEditor} onClick={e => e.stopPropagation()}>
      <div style={styles.itemEditorRow}>
        <select style={styles.itemEditorSelect} value={area} onChange={e => { setArea(e.target.value); onSaveMeta(item.id, { area: e.target.value || null }) }}>
          <option value="">Sin área</option>
          {AREAS.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
        </select>
      </div>
      <textarea
        style={styles.itemEditorNota}
        placeholder="Nota / contexto (ej. hoy no salió por caída de SAP)…"
        value={nota}
        rows={2}
        onChange={e => setNota(e.target.value)}
        onBlur={() => onSaveMeta(item.id, { nota: nota.trim() || null })}
      />
    </div>
  )
}

function DailyView({ items, completions, today, now, onToggle, onRemove, expandedItemId, setExpandedItemId, onSaveMeta, ...extraProps }) {
  if (items.length === 0) return <EmptyState text="Sin informes diarios. Agrega el primero abajo." />
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const sorted = [...items].sort((a, b) => (a.target_time || '99:99').localeCompare(b.target_time || '99:99'))
  return (
    <div style={styles.list}>
      {sorted.map((item, idx) => {
        const done = completions.some(c => c.item_id === item.id && c.completed_date === today)
        let state = 'pending'
        if (done) state = 'done'
        else if (item.target_time) {
          const [h, m] = item.target_time.split(':').map(Number)
          if (nowMin > h * 60 + m) state = 'late'
        }
        return (
          <div key={item.id} style={{ animationDelay: `${idx * 45}ms` }} className="row-in">
            <div style={styles.row} onClick={() => onToggle(item.id, today)}>
              <Led state={state} live={state !== 'done'} />
              <div style={styles.rowMain}>
                <span style={styles.rowLabelLine}>
                  <ItemLabel item={item} done={done} {...extraProps} />
                  <ItemAreaChip area={item.area} />
                </span>
                <HistoryDots itemId={item.id} completions={completions} />
              </div>
              <span style={{ ...styles.rowMeta, color: state === 'late' ? 'var(--late)' : 'var(--text-faint)' }}>
                {item.target_time && <><Clock size={11} strokeWidth={2.5} style={{ verticalAlign: -2, marginRight: 3 }} />{item.target_time.slice(0, 5)}</>}
              </span>
              <StatusTag label={done ? 'ENVIADO' : state === 'late' ? 'VENCIDO' : 'PENDIENTE'} tone={done ? 'done' : state === 'late' ? 'late' : 'pending'} />
              <NoteToggle item={item} expandedItemId={expandedItemId} setExpandedItemId={setExpandedItemId} />
              <DiagramLink item={item} {...extraProps} />
              <button style={styles.deleteBtn} onClick={e => { e.stopPropagation(); onRemove(item.id) }}><Trash2 size={13} strokeWidth={2} /></button>
            </div>
            {expandedItemId === item.id && <ItemEditor item={item} onSaveMeta={onSaveMeta} />}
          </div>
        )
      })}
    </div>
  )
}

function WeeklyView({ items, completions, weekStart, weekEnd, onToggle, onRemove, expandedItemId, setExpandedItemId, onSaveMeta, ...extraProps }) {
  const todayDow = new Date().getDay()
  if (items.length === 0) return <EmptyState text="Sin informes semanales. Agrega el primero abajo." />
  return (
    <div style={styles.list}>
      {items.map((item, idx) => {
        const done = completions.some(c => c.item_id === item.id && c.completed_date >= weekStart && c.completed_date <= weekEnd)
        const isLate = !done && item.target_weekday !== null && (
          item.target_weekday === 0 ? todayDow !== 0 : todayDow > item.target_weekday || todayDow === 0
        )
        const state = done ? 'done' : isLate ? 'late' : 'pending'
        return (
          <div key={item.id} style={{ animationDelay: `${idx * 45}ms` }} className="row-in">
            <div style={styles.row} onClick={() => onToggle(item.id, localDateStr())}>
              <Led state={state} live={state !== 'done'} />
              <div style={styles.rowMain}>
                <span style={styles.rowLabelLine}>
                  <ItemLabel item={item} done={done} {...extraProps} />
                  <ItemAreaChip area={item.area} />
                </span>
              </div>
              <span style={{ ...styles.rowMeta, color: state === 'late' ? 'var(--late)' : 'var(--text-faint)' }}>
                {item.target_weekday !== null ? `META ${WEEKDAYS_SHORT[item.target_weekday].toUpperCase()}` : 'CUALQUIER DÍA'}
              </span>
              <StatusTag label={done ? 'COMPLETADO' : isLate ? 'VENCIDO' : 'PENDIENTE'} tone={done ? 'done' : isLate ? 'late' : 'pending'} />
              <NoteToggle item={item} expandedItemId={expandedItemId} setExpandedItemId={setExpandedItemId} />
              <DiagramLink item={item} {...extraProps} />
              <button style={styles.deleteBtn} onClick={e => { e.stopPropagation(); onRemove(item.id) }}><Trash2 size={13} strokeWidth={2} /></button>
            </div>
            {expandedItemId === item.id && <ItemEditor item={item} onSaveMeta={onSaveMeta} />}
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

function KanbanView({ items, onMove, onRemove, expandedItemId, setExpandedItemId, onSaveMeta, ...extraProps }) {
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
                <span style={styles.rowLabelLine}>
                  <ItemLabel item={item} done={col.key === 'hecho'} {...extraProps} />
                  <ItemAreaChip area={item.area} />
                </span>
                {item.nota && <div style={styles.kanbanNota}>{item.nota}</div>}
                <div style={styles.kanbanCardActions}>
                  {KANBAN_COLS.filter(c => c.key !== col.key).map(c => (
                    <button key={c.key} style={styles.kanbanMoveBtn} onClick={() => onMove(item.id, c.key)}>
                      <ChevronRight size={11} strokeWidth={2.5} style={{ verticalAlign: -2 }} />{c.label}
                    </button>
                  ))}
                  <NoteToggle item={item} expandedItemId={expandedItemId} setExpandedItemId={setExpandedItemId} />
                  <DiagramLink item={item} {...extraProps} />
                  <button style={styles.deleteBtnSmall} onClick={() => onRemove(item.id)}><Trash2 size={12} strokeWidth={2} /></button>
                </div>
                {expandedItemId === item.id && <ItemEditor item={item} onSaveMeta={onSaveMeta} />}
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

  header: { marginBottom: 20 },
  headerBezel: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20,
    background: 'linear-gradient(180deg, var(--panel-hi), var(--panel))',
    border: '1px solid var(--edge)', borderRadius: 'var(--radius-lg)',
    padding: '22px 26px', position: 'relative', overflow: 'hidden',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), inset 0 0 60px rgba(0,0,0,0.4), 0 10px 30px rgba(0,0,0,0.45)',
  },
  rivet: {
    position: 'absolute', width: 5, height: 5, borderRadius: '50%',
    background: 'radial-gradient(circle at 35% 35%, #4a4754, #16151b)', boxShadow: 'inset 0 0 1px rgba(255,255,255,0.3)',
  },
  headerLeft: { position: 'relative', zIndex: 1 },
  liveRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 },
  led: { width: 11, height: 11, borderRadius: '50%', flexShrink: 0, display: 'inline-block' },
  liveText: { fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.6, color: 'var(--online)', fontWeight: 700 },
  destChip: {
    fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: 1.4, color: 'var(--accent)',
    border: '1px solid var(--accent-deep)', borderRadius: 4, padding: '2px 7px', fontWeight: 700,
  },
  title: {
    fontFamily: 'var(--font-sign)', fontSize: 42, fontWeight: 800, margin: 0,
    letterSpacing: 1.5, lineHeight: 0.92, color: 'var(--text)',
    textShadow: '0 2px 0 rgba(0,0,0,0.5), 0 0 30px rgba(255,182,46,0.12)',
  },
  subtitle: { color: 'var(--text-dim)', margin: '7px 0 0', fontSize: 11.5, fontFamily: 'var(--font-mono)', letterSpacing: 1, fontWeight: 500 },

  headerRight: { display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap', position: 'relative', zIndex: 1 },
  clockBlock: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, paddingRight: 22, borderRight: '1px solid var(--edge)' },
  clockRow: { display: 'flex', alignItems: 'center', gap: 2 },
  colon: { fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: 'var(--accent)', margin: '0 1px', animation: 'ledPulse 1s steps(1) infinite' },
  secBox: { marginLeft: 6, alignSelf: 'flex-end', marginBottom: 4, opacity: 0.85 },
  clockMeta: { fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', letterSpacing: 1.5, fontWeight: 600 },

  boardStats: { display: 'flex', alignItems: 'center', gap: 16 },
  statCol: { display: 'flex', flexDirection: 'column', gap: 5 },
  statLabel: { fontSize: 9.5, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'var(--font-mono)', fontWeight: 600 },
  statBig: { fontFamily: 'var(--font-sign)', fontSize: 30, fontWeight: 800, lineHeight: 1 },
  statSlash: { fontSize: 16, color: 'var(--text-faint)', fontWeight: 600 },
  statDivider: { width: 1, height: 34, background: 'var(--edge)' },
  streakRow: { display: 'flex', alignItems: 'center', gap: 6 },

  tabsWrap: { marginBottom: 20, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none', borderBottom: '1px solid var(--edge-soft)' },
  tabs: { display: 'flex', gap: 2, paddingBottom: 8, minWidth: 'min-content' },
  tabBtn: {
    display: 'flex', alignItems: 'center', gap: 7, background: 'transparent', border: 'none',
    color: 'var(--text-faint)', padding: '8px 13px', borderRadius: 8, fontSize: 13, fontWeight: 600,
    letterSpacing: 0.2, whiteSpace: 'nowrap', transition: 'color .15s, background .15s',
  },
  tabBtnActive: { background: 'rgba(255,182,46,0.1)', color: 'var(--accent)' },
  tabDot: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 17, height: 17,
    padding: '0 5px', borderRadius: 9, fontSize: 10, fontWeight: 700, color: '#1a1200', fontFamily: 'var(--font-mono)',
  },

  main: { position: 'relative' },
  loading: { color: 'var(--text-dim)', padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)', letterSpacing: 1 },

  banner: {
    display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14, padding: '13px 18px',
    background: 'linear-gradient(90deg, rgba(53,208,127,0.12), transparent)',
    border: '1px solid rgba(53,208,127,0.3)', borderRadius: 10,
  },

  list: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 },
  row: {
    display: 'flex', alignItems: 'center', gap: 13, background: 'linear-gradient(180deg, var(--panel), var(--void-2))',
    border: '1px solid var(--edge-soft)', borderRadius: 10, padding: '13px 16px', cursor: 'pointer',
    transition: 'border-color .16s, transform .12s, box-shadow .16s',
  },
  rowMain: { flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
  rowLabelLine: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rowLabel: { fontSize: 14.5, fontWeight: 500 },

  itemAreaChip: { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 700, letterSpacing: 0.5, padding: '1px 6px', border: '1px solid', borderRadius: 4, fontFamily: 'var(--font-mono)', flexShrink: 0 },
  noteToggle: { background: 'transparent', border: '1px solid', borderRadius: 6, padding: '5px 6px', display: 'flex', flexShrink: 0 },
  itemEditor: { background: 'var(--void-2)', border: '1px solid var(--edge)', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '11px 14px', marginTop: -4, display: 'flex', flexDirection: 'column', gap: 8 },
  itemEditorRow: { display: 'flex', gap: 8 },
  itemEditorSelect: { background: 'var(--panel)', border: '1px solid var(--edge)', borderRadius: 7, padding: '7px 10px', color: 'var(--text)', fontSize: 12.5 },
  itemEditorNota: { width: '100%', background: 'var(--panel)', border: '1px solid var(--edge)', borderRadius: 7, padding: '8px 11px', color: 'var(--text)', fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'var(--font-ui)' },

  hoyIntro: { display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 22, paddingBottom: 16, borderBottom: '1px solid var(--edge-soft)' },
  hoyIntroBig: { fontFamily: 'var(--font-sign)', fontSize: 52, fontWeight: 900, color: 'var(--accent)', lineHeight: 1, textShadow: '0 0 30px rgba(255,182,46,0.2)' },
  hoyIntroLabel: { fontSize: 14, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', letterSpacing: 0.5 },
  hoyClear: { display: 'flex', alignItems: 'center', gap: 14, padding: '20px 22px', marginBottom: 20, background: 'linear-gradient(90deg, rgba(53,208,127,0.1), transparent)', border: '1px solid rgba(53,208,127,0.3)', borderRadius: 12 },

  hoySection: { marginBottom: 22 },
  hoySectionHead: { display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 },
  hoySectionBar: { width: 4, height: 16, borderRadius: 2 },
  hoySectionTitle: { fontSize: 13, fontWeight: 700, color: 'var(--text)', letterSpacing: 0.3 },
  hoySectionCount: { fontSize: 10.5, fontWeight: 700, fontFamily: 'var(--font-mono)', border: '1px solid', borderRadius: 5, padding: '0 6px' },
  hoyVerMas: { marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--text-faint)', fontSize: 11.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 2 },
  hoySectionBody: { display: 'flex', flexDirection: 'column', gap: 6 },
  hoyRow: { display: 'flex', alignItems: 'center', gap: 11, background: 'linear-gradient(180deg, var(--panel), var(--void-2))', border: '1px solid var(--edge-soft)', borderRadius: 9, padding: '11px 14px', cursor: 'pointer' },
  hoyDot: { width: 9, height: 9, borderRadius: '50%', flexShrink: 0 },
  hoyCheck: { width: 15, height: 15, borderRadius: 5, border: '2px solid', flexShrink: 0 },
  hoyRowText: { flex: 1, fontSize: 14, fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  hoyRowMeta: { fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: 0.5, whiteSpace: 'nowrap' },

  kanbanNota: { fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.4, marginTop: 7, padding: '7px 9px', background: 'var(--void-2)', borderRadius: 7, whiteSpace: 'pre-wrap' },
  rowLabelDone: { color: 'var(--text-dim)', textDecoration: 'line-through' },
  rowMeta: { fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', letterSpacing: 0.5, fontWeight: 600 },

  statusTag: {
    fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 700, letterSpacing: 1, padding: '3px 8px',
    border: '1px solid', borderRadius: 5, whiteSpace: 'nowrap', flexShrink: 0, textAlign: 'center', minWidth: 82,
    transformStyle: 'preserve-3d',
  },

  historyRow: { display: 'flex', gap: 4 },
  historyDot: { width: 6, height: 6, borderRadius: '50%' },

  renameInput: {
    fontSize: 14.5, fontWeight: 500, background: 'var(--void-2)', border: '1px solid var(--accent)',
    borderRadius: 5, padding: '2px 6px', color: 'var(--text)', outline: 'none', width: '90%',
  },

  deleteBtn: { background: 'transparent', border: 'none', color: 'var(--text-faint)', padding: 4, display: 'flex' },
  deleteBtnSmall: { background: 'transparent', border: 'none', color: 'var(--text-faint)', padding: '2px 4px', marginLeft: 'auto', display: 'flex' },

  diagLinkWrap: { display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, position: 'relative' },
  diagLinkBtn: {
    display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,182,46,0.08)',
    border: '1px solid var(--accent-deep)', borderRadius: 6, padding: '3px 7px', color: 'var(--accent)',
    fontSize: 11, maxWidth: 120,
  },
  diagLinkName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  diagSelect: {
    background: 'transparent', border: '1px solid var(--edge)', borderRadius: 6, color: 'var(--text-faint)',
    fontSize: 11, padding: '3px 4px', maxWidth: 26, appearance: 'none', textAlign: 'center', cursor: 'pointer',
  },
  diagSelectLinked: { maxWidth: 20, opacity: 0.7 },

  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--text-faint)', padding: '44px 0', textAlign: 'center', fontSize: 13.5, marginBottom: 20 },

  addForm: { display: 'flex', gap: 8, position: 'sticky', bottom: 16, flexWrap: 'wrap' },
  input: { flex: 1, minWidth: 160, background: 'var(--panel-hi)', border: '1px solid var(--edge)', borderRadius: 9, padding: '11px 14px', color: 'var(--text)', fontSize: 14, outline: 'none' },
  select: { background: 'var(--panel-hi)', border: '1px solid var(--edge)', borderRadius: 9, padding: '11px 10px', color: 'var(--text)', fontSize: 13.5 },
  addBtn: { display: 'flex', alignItems: 'center', background: 'var(--accent)', border: 'none', borderRadius: 9, padding: '11px 18px', color: '#1a1200', fontSize: 14, fontWeight: 800, boxShadow: '0 0 18px rgba(255,182,46,0.25)' },

  kanban: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 },
  kanbanCol: { background: 'linear-gradient(180deg, var(--panel), var(--void-2))', border: '1px solid var(--edge-soft)', borderRadius: 12, padding: 12, minHeight: 200 },
  kanbanColHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-dim)', marginBottom: 12, fontFamily: 'var(--font-mono)' },
  kanbanCount: { background: 'var(--void-2)', borderRadius: 6, padding: '1px 7px', fontFamily: 'var(--font-mono)' },
  kanbanColBody: { display: 'flex', flexDirection: 'column', gap: 8 },
  kanbanEmpty: { fontSize: 11, color: 'var(--text-faint)', textAlign: 'center', padding: '16px 0', fontFamily: 'var(--font-mono)', letterSpacing: 1 },
  kanbanCard: { background: 'var(--panel-hi)', border: '1px solid var(--edge)', borderRadius: 9, padding: 11 },
  kanbanCardActions: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 9 },
  kanbanMoveBtn: { display: 'flex', alignItems: 'center', gap: 2, background: 'transparent', border: '1px solid var(--edge)', color: 'var(--text-dim)', fontSize: 10.5, padding: '3px 7px', borderRadius: 6 },
}
