import { useState, useEffect, useCallback } from 'react'
import { Trash2, Search, NotebookPen, Tag } from 'lucide-react'
import { supabase } from './supabase'
import { AREAS, areaMeta, localDateStr, turnoActual } from './constants'

const TURNOS = ['mañana', 'tarde', 'noche']

function fechaLegible(f) {
  const d = new Date(f + 'T00:00:00')
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: '2-digit', month: 'long' })
}

export default function BitacoraView() {
  const [entradas, setEntradas] = useState([])
  const [loading, setLoading] = useState(true)
  const [texto, setTexto] = useState('')
  const [turno, setTurno] = useState(turnoActual())
  const [area, setArea] = useState('')
  const [busqueda, setBusqueda] = useState('')

  const load = useCallback(async () => {
    if (typeof window !== 'undefined' && window.location.search.includes('demo')) {
      setEntradas([
        { id: 'b1', fecha: localDateStr(), turno: 'tarde', area: 'paqueteo', texto: 'Se cayó SAP cerca de 2 horas (10:15–12:00). Se retrasó el cierre de guías ALDIA.', created_at: new Date().toISOString() },
        { id: 'b2', fecha: localDateStr(), turno: 'mañana', area: 'picking', texto: 'Faltaron 2 operarios en picking, se reasignó personal de inventario.', created_at: new Date().toISOString() },
      ])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('bitacora')
      .select('*')
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200)
    setEntradas(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const ch = supabase.channel('bitacora-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bitacora' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  async function agregar(e) {
    e.preventDefault()
    if (!texto.trim()) return
    await supabase.from('bitacora').insert({
      texto: texto.trim(),
      turno,
      area: area || null,
      fecha: localDateStr(),
    })
    setTexto(''); setArea('')
    load()
  }

  async function eliminar(id) {
    await supabase.from('bitacora').delete().eq('id', id)
    load()
  }

  const filtradas = entradas.filter(e => {
    if (!busqueda.trim()) return true
    const q = busqueda.toLowerCase()
    return (e.texto || '').toLowerCase().includes(q) || (areaMeta(e.area)?.label || '').toLowerCase().includes(q)
  })

  // group by date
  const grupos = filtradas.reduce((acc, e) => {
    (acc[e.fecha] = acc[e.fecha] || []).push(e)
    return acc
  }, {})
  const fechas = Object.keys(grupos).sort((a, b) => b.localeCompare(a))

  return (
    <div>
      <form onSubmit={agregar} style={styles.capture}>
        <textarea
          style={styles.textarea}
          placeholder="Anota una novedad del turno… (ej. caída de SAP, falta de personal, incidencia con transportadora)"
          value={texto}
          onChange={e => setTexto(e.target.value)}
          rows={2}
        />
        <div style={styles.captureRow}>
          <select style={styles.select} value={turno} onChange={e => setTurno(e.target.value)}>
            {TURNOS.map(t => <option key={t} value={t}>Turno: {t}</option>)}
          </select>
          <select style={styles.select} value={area} onChange={e => setArea(e.target.value)}>
            <option value="">Área…</option>
            {AREAS.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
          <button type="submit" style={styles.addBtn}>Registrar</button>
        </div>
      </form>

      <div style={styles.searchWrap}>
        <Search size={14} color="var(--text-faint)" strokeWidth={2.25} />
        <input style={styles.search} placeholder="Buscar en la bitácora…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </div>

      {loading ? (
        <div style={styles.loading}>Cargando bitácora…</div>
      ) : fechas.length === 0 ? (
        <div style={styles.empty}>
          <NotebookPen size={22} strokeWidth={1.5} color="var(--text-faint)" style={{ marginBottom: 8 }} />
          <div>{busqueda ? 'Sin resultados para esa búsqueda.' : 'Sin novedades registradas. Anota lo que pase en el turno para tener respaldo después.'}</div>
        </div>
      ) : (
        <div style={styles.timeline}>
          {fechas.map(fecha => (
            <div key={fecha} style={styles.dayGroup}>
              <div style={styles.dayHeader}>{fechaLegible(fecha)}</div>
              {grupos[fecha].map((e, idx) => {
                const am = areaMeta(e.area)
                return (
                  <div key={e.id} style={{ ...styles.entry, animationDelay: `${idx * 40}ms` }} className="row-in">
                    <div style={styles.entryBar} />
                    <div style={styles.entryBody}>
                      <div style={styles.entryMeta}>
                        {e.turno && <span style={styles.turnoChip}>{e.turno.toUpperCase()}</span>}
                        {am && <span style={{ ...styles.areaChip, color: am.color, borderColor: am.color }}><Tag size={9} strokeWidth={2.5} /> {am.label}</span>}
                      </div>
                      <div style={styles.entryText}>{e.texto}</div>
                    </div>
                    <button style={styles.del} onClick={() => eliminar(e.id)}><Trash2 size={13} strokeWidth={2} /></button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const styles = {
  capture: { background: 'linear-gradient(180deg, var(--panel-hi), var(--panel))', border: '1px solid var(--edge)', borderRadius: 12, padding: 14, marginBottom: 14 },
  textarea: { width: '100%', background: 'var(--void-2)', border: '1px solid var(--edge)', borderRadius: 9, padding: '11px 14px', color: 'var(--text)', fontSize: 14, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'var(--font-ui)' },
  captureRow: { display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  select: { background: 'var(--void-2)', border: '1px solid var(--edge)', borderRadius: 8, padding: '9px 10px', color: 'var(--text)', fontSize: 13 },
  addBtn: { marginLeft: 'auto', background: 'var(--accent)', border: 'none', borderRadius: 9, padding: '9px 20px', color: '#1a1200', fontSize: 14, fontWeight: 800, boxShadow: '0 0 18px rgba(255,182,46,0.25)' },

  searchWrap: { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--panel)', border: '1px solid var(--edge-soft)', borderRadius: 9, padding: '0 12px', marginBottom: 16 },
  search: { flex: 1, background: 'transparent', border: 'none', padding: '10px 0', color: 'var(--text)', fontSize: 13.5, outline: 'none' },

  loading: { color: 'var(--text-dim)', padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)' },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--text-faint)', padding: '44px 20px', textAlign: 'center', fontSize: 13.5 },

  timeline: { display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 20 },
  dayGroup: { display: 'flex', flexDirection: 'column', gap: 8 },
  dayHeader: { fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', paddingBottom: 4, borderBottom: '1px solid var(--edge-soft)', marginBottom: 2 },
  entry: { display: 'flex', gap: 11, background: 'linear-gradient(180deg, var(--panel), var(--void-2))', border: '1px solid var(--edge-soft)', borderRadius: 10, padding: '12px 14px', alignItems: 'flex-start' },
  entryBar: { width: 3, alignSelf: 'stretch', background: 'var(--edge)', borderRadius: 2, flexShrink: 0 },
  entryBody: { flex: 1 },
  entryMeta: { display: 'flex', gap: 7, marginBottom: 6, alignItems: 'center' },
  turnoChip: { fontSize: 9, fontWeight: 700, letterSpacing: 1, padding: '2px 7px', borderRadius: 5, background: 'var(--void-2)', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' },
  areaChip: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, padding: '2px 7px', border: '1px solid', borderRadius: 5, fontFamily: 'var(--font-mono)' },
  entryText: { fontSize: 14, lineHeight: 1.5, color: 'var(--text)', whiteSpace: 'pre-wrap' },
  del: { background: 'transparent', border: 'none', color: 'var(--text-faint)', padding: 4, display: 'flex' },
}
