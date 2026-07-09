import { useState, useEffect, useCallback, useMemo } from 'react'
import { Trash2, Plus, Clock, CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from './supabase'
import { calcularHoras, TIPOS_HORA, TIPOS_EXTRA } from './horasLogic'
import { localDateStr } from './constants'

const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function fmtH(n) {
  if (!n) return '—'
  const h = Math.floor(n)
  const m = Math.round((n - h) * 60)
  if (m === 0) return `${h}h`
  return `${h}h${String(m).padStart(2, '0')}`
}

function mesLegible(ym) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
}

export default function HorasView() {
  const [registros, setRegistros] = useState([])
  const [loading, setLoading] = useState(true)
  const [mes, setMes] = useState(localDateStr().slice(0, 7)) // YYYY-MM

  // form
  const [fecha, setFecha] = useState(localDateStr())
  const [entrada, setEntrada] = useState('07:00')
  const [salida, setSalida] = useState('16:00')
  const [esFestivo, setEsFestivo] = useState(false)
  const [nota, setNota] = useState('')

  const load = useCallback(async () => {
    if (typeof window !== 'undefined' && window.location.search.includes('demo')) {
      setRegistros([
        { id: 'h1', fecha: '2026-07-06', hora_entrada: '07:00', hora_salida: '19:00', es_festivo: false, h_normal: 9, h_extra_diurna: 3, h_extra_nocturna: 0, h_dominical_diurna: 0, h_dominical_nocturna: 0, nota: null },
        { id: 'h2', fecha: '2026-07-08', hora_entrada: '07:00', hora_salida: '20:30', es_festivo: false, h_normal: 9, h_extra_diurna: 3, h_extra_nocturna: 1.5, h_dominical_diurna: 0, h_dominical_nocturna: 0, nota: 'Cierre de inventario' },
        { id: 'h3', fecha: '2026-07-11', hora_entrada: '08:00', hora_salida: '14:00', es_festivo: false, h_normal: 0, h_extra_diurna: 6, h_extra_nocturna: 0, h_dominical_diurna: 0, h_dominical_nocturna: 0, nota: null },
        { id: 'h4', fecha: '2026-07-12', hora_entrada: '08:00', hora_salida: '15:00', es_festivo: false, h_normal: 0, h_extra_diurna: 0, h_extra_nocturna: 0, h_dominical_diurna: 7, h_dominical_nocturna: 0, nota: 'Domingo' },
      ])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('horas_extra')
      .select('*')
      .gte('fecha', mes + '-01')
      .lte('fecha', mes + '-31')
      .order('fecha', { ascending: true })
    setRegistros(data || [])
    setLoading(false)
  }, [mes])

  useEffect(() => {
    load()
    const ch = supabase.channel('horas-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'horas_extra' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  // Vista previa en vivo del cálculo mientras llena el formulario
  const preview = useMemo(() => calcularHoras(fecha, entrada, salida, esFestivo), [fecha, entrada, salida, esFestivo])
  const previewTotal = Object.values(preview).reduce((a, b) => a + b, 0)

  async function agregar(e) {
    e.preventDefault()
    if (!fecha || !entrada || !salida) return
    const h = calcularHoras(fecha, entrada, salida, esFestivo)
    await supabase.from('horas_extra').insert({
      fecha, hora_entrada: entrada, hora_salida: salida, es_festivo: esFestivo, nota: nota.trim() || null, ...h,
    })
    setNota('')
    if (fecha.slice(0, 7) !== mes) setMes(fecha.slice(0, 7))
    load()
  }

  async function eliminar(id) {
    await supabase.from('horas_extra').delete().eq('id', id)
    load()
  }

  const totales = useMemo(() => {
    const t = { h_normal: 0, h_extra_diurna: 0, h_extra_nocturna: 0, h_dominical_diurna: 0, h_dominical_nocturna: 0 }
    for (const r of registros) for (const k of Object.keys(t)) t[k] += Number(r[k] || 0)
    return t
  }, [registros])

  const totalExtra = TIPOS_EXTRA.reduce((a, tp) => a + totales[tp.key], 0)

  function cambiarMes(delta) {
    const [y, m] = mes.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <div>
      {/* Formulario de registro */}
      <form onSubmit={agregar} style={styles.form}>
        <div style={styles.formRow}>
          <div style={styles.field}>
            <label style={styles.label}>Fecha</label>
            <input type="date" style={{ ...styles.input, colorScheme: 'dark' }} value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Entrada</label>
            <input type="time" style={{ ...styles.input, colorScheme: 'dark' }} value={entrada} onChange={e => setEntrada(e.target.value)} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Salida</label>
            <input type="time" style={{ ...styles.input, colorScheme: 'dark' }} value={salida} onChange={e => setSalida(e.target.value)} />
          </div>
          <label style={styles.festivoWrap} title="Marca si el día es festivo (se calcula como dominical)">
            <input type="checkbox" checked={esFestivo} onChange={e => setEsFestivo(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
            Festivo
          </label>
        </div>

        {/* preview en vivo */}
        {previewTotal > 0 && (
          <div style={styles.preview}>
            <span style={styles.previewLabel}>Se registrará:</span>
            {TIPOS_HORA.filter(tp => preview[tp.key] > 0).map(tp => (
              <span key={tp.key} style={{ ...styles.previewChip, color: tp.color, borderColor: tp.color }}>
                {fmtH(preview[tp.key])} {tp.short}
              </span>
            ))}
          </div>
        )}

        <div style={styles.formRow2}>
          <input style={styles.notaInput} placeholder="Nota (opcional)…" value={nota} onChange={e => setNota(e.target.value)} />
          <button type="submit" style={styles.addBtn}><Plus size={15} strokeWidth={2.5} style={{ verticalAlign: -2, marginRight: 4 }} />Registrar</button>
        </div>
      </form>

      {/* Selector de mes */}
      <div style={styles.monthBar}>
        <button style={styles.monthNav} onClick={() => cambiarMes(-1)}><ChevronLeft size={16} strokeWidth={2.5} /></button>
        <span style={styles.monthLabel}>{mesLegible(mes)}</span>
        <button style={styles.monthNav} onClick={() => cambiarMes(1)}><ChevronRight size={16} strokeWidth={2.5} /></button>
      </div>

      {/* Totales del mes */}
      <div style={styles.totalsGrid}>
        <div style={{ ...styles.totalCard, borderColor: 'var(--accent-deep)' }}>
          <span style={styles.totalBig}>{fmtH(totalExtra)}</span>
          <span style={styles.totalLbl}>TOTAL EXTRA</span>
        </div>
        {TIPOS_EXTRA.map(tp => (
          <div key={tp.key} style={{ ...styles.totalCard, borderColor: totales[tp.key] > 0 ? tp.color : 'var(--edge-soft)' }}>
            <span style={{ ...styles.totalNum, color: totales[tp.key] > 0 ? tp.color : 'var(--text-faint)' }}>{fmtH(totales[tp.key])}</span>
            <span style={styles.totalLbl}>{tp.label.toUpperCase()}</span>
          </div>
        ))}
      </div>

      {/* Tablero diario */}
      {loading ? (
        <div style={styles.loading}>Cargando registros…</div>
      ) : registros.length === 0 ? (
        <div style={styles.empty}>
          <CalendarClock size={22} strokeWidth={1.5} color="var(--text-faint)" style={{ marginBottom: 8 }} />
          <div>Sin registros en {mesLegible(mes)}. Registra tu primera jornada arriba.</div>
        </div>
      ) : (
        <div style={styles.board}>
          <div style={styles.boardHead}>
            <span style={{ ...styles.hCell, flex: 1.4 }}>Día</span>
            <span style={styles.hCell}>Jornada</span>
            {TIPOS_EXTRA.map(tp => <span key={tp.key} style={{ ...styles.hCell, color: tp.color }}>{tp.short}</span>)}
            <span style={styles.hCellDel} />
          </div>
          {registros.map((r, idx) => {
            const d = new Date(r.fecha + 'T00:00:00')
            const dow = d.getDay()
            const esDom = dow === 0 || r.es_festivo
            return (
              <div key={r.id} style={{ ...styles.boardRow, animationDelay: `${idx * 35}ms` }} className="row-in">
                <span style={{ ...styles.cell, flex: 1.4 }}>
                  <span style={{ ...styles.dayName, color: esDom ? 'var(--late)' : dow === 6 ? 'var(--accent)' : 'var(--text-dim)' }}>
                    {WEEKDAYS_SHORT[dow]}{r.es_festivo ? '★' : ''}
                  </span>
                  <span style={styles.dayNum}>{d.getDate()}</span>
                  {r.nota && <span style={styles.rowNota} title={r.nota}>· {r.nota}</span>}
                </span>
                <span style={{ ...styles.cell, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>
                  {r.hora_entrada?.slice(0, 5)}–{r.hora_salida?.slice(0, 5)}
                </span>
                {TIPOS_EXTRA.map(tp => (
                  <span key={tp.key} style={{ ...styles.cell, color: Number(r[tp.key]) > 0 ? tp.color : 'var(--text-faint)', fontWeight: Number(r[tp.key]) > 0 ? 700 : 400, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>
                    {Number(r[tp.key]) > 0 ? fmtH(Number(r[tp.key])) : '·'}
                  </span>
                ))}
                <button style={styles.delBtn} onClick={() => eliminar(r.id)}><Trash2 size={13} strokeWidth={2} /></button>
              </div>
            )
          })}
        </div>
      )}

      <p style={styles.footnote}>
        Turno base L–V 7:00–16:00 (normal). Después de las 16:00 cuenta extra; desde las 19:00, nocturna.
        Sábados todo extra; domingos y festivos, dominical.
      </p>
    </div>
  )
}

const styles = {
  form: { background: 'linear-gradient(180deg, var(--panel-hi), var(--panel))', border: '1px solid var(--edge)', borderRadius: 12, padding: 16, marginBottom: 16 },
  formRow: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' },
  field: { display: 'flex', flexDirection: 'column', gap: 5 },
  label: { fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'var(--font-mono)', fontWeight: 600 },
  input: { background: 'var(--void-2)', border: '1px solid var(--edge)', borderRadius: 8, padding: '9px 11px', color: 'var(--text)', fontSize: 13.5, outline: 'none' },
  festivoWrap: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--text-dim)', padding: '9px 0', cursor: 'pointer', fontWeight: 600 },

  preview: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 12, padding: '10px 12px', background: 'var(--void-2)', borderRadius: 9 },
  previewLabel: { fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', letterSpacing: 0.5 },
  previewChip: { fontSize: 11, fontWeight: 700, letterSpacing: 0.5, padding: '3px 9px', border: '1px solid', borderRadius: 6, fontFamily: 'var(--font-mono)' },

  formRow2: { display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  notaInput: { flex: 1, minWidth: 160, background: 'var(--void-2)', border: '1px solid var(--edge)', borderRadius: 9, padding: '10px 13px', color: 'var(--text)', fontSize: 13.5, outline: 'none' },
  addBtn: { display: 'flex', alignItems: 'center', background: 'var(--accent)', border: 'none', borderRadius: 9, padding: '10px 20px', color: '#1a1200', fontSize: 14, fontWeight: 800, boxShadow: '0 0 18px rgba(255,182,46,0.25)' },

  monthBar: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 14 },
  monthNav: { background: 'var(--panel)', border: '1px solid var(--edge)', color: 'var(--text-dim)', borderRadius: 8, padding: '6px 9px', display: 'flex' },
  monthLabel: { fontSize: 14, fontWeight: 700, color: 'var(--text)', textTransform: 'capitalize', minWidth: 160, textAlign: 'center', fontFamily: 'var(--font-mono)' },

  totalsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 18 },
  totalCard: { display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', background: 'linear-gradient(180deg, var(--panel), var(--void-2))', border: '1px solid', borderRadius: 11, padding: '13px 10px' },
  totalBig: { fontFamily: 'var(--font-sign)', fontSize: 26, fontWeight: 800, color: 'var(--accent)', lineHeight: 1 },
  totalNum: { fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, lineHeight: 1 },
  totalLbl: { fontSize: 8.5, color: 'var(--text-faint)', letterSpacing: 0.8, fontFamily: 'var(--font-mono)', fontWeight: 600, textAlign: 'center' },

  loading: { color: 'var(--text-dim)', padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)' },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--text-faint)', padding: '40px 20px', textAlign: 'center', fontSize: 13.5 },

  board: { border: '1px solid var(--edge-soft)', borderRadius: 12, overflow: 'hidden' },
  boardHead: { display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: 'var(--panel-hi)', borderBottom: '1px solid var(--edge)' },
  hCell: { flex: 1, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', textAlign: 'center' },
  hCellDel: { width: 26, flexShrink: 0 },
  boardRow: { display: 'flex', alignItems: 'center', gap: 6, padding: '11px 14px', borderBottom: '1px solid var(--edge-soft)', background: 'var(--panel)' },
  cell: { flex: 1, textAlign: 'center', fontSize: 13 },
  dayName: { fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, marginRight: 5 },
  dayNum: { fontWeight: 700, fontSize: 14 },
  rowNota: { display: 'block', fontSize: 10.5, color: 'var(--text-faint)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 },
  delBtn: { width: 26, flexShrink: 0, background: 'transparent', border: 'none', color: 'var(--text-faint)', display: 'flex', justifyContent: 'center' },

  footnote: { fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5, marginTop: 14, fontFamily: 'var(--font-mono)' },
}
