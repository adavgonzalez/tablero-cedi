import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Trash2, Archive, Clock, User, ChevronDown, ChevronUp,
  ArrowRightCircle, Inbox as InboxIcon, AlertTriangle,
} from 'lucide-react'
import { supabase } from './supabase'

const PRIORIDADES = [
  { key: 'alta', label: 'Alta', color: 'var(--late)' },
  { key: 'media', label: 'Media', color: 'var(--accent)' },
  { key: 'baja', label: 'Baja', color: 'var(--text-dim)' },
]
const PRIO_RANK = { alta: 0, media: 1, baja: 2 }

function localDateStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function diasRestantes(fecha) {
  if (!fecha) return null
  const hoy = new Date(localDateStr())
  const f = new Date(fecha)
  return Math.round((f - hoy) / 86400000)
}

export default function InboxView({ onConverted }) {
  const [peticiones, setPeticiones] = useState([])
  const [loading, setLoading] = useState(true)
  const [orden, setOrden] = useState('prioridad') // 'prioridad' | 'fecha' | 'reciente'
  const [expandId, setExpandId] = useState(null)

  // form
  const [titulo, setTitulo] = useState('')
  const [solicitante, setSolicitante] = useState('')
  const [prioridad, setPrioridad] = useState('media')
  const [fechaLimite, setFechaLimite] = useState('')
  const [nota, setNota] = useState('')
  const [showDetails, setShowDetails] = useState(false)

  const load = useCallback(async () => {
    if (typeof window !== 'undefined' && window.location.search.includes('demo')) {
      setPeticiones([
        { id: 'p1', titulo: 'Reporte de devoluciones por transportadora', solicitante: 'Jefe de operaciones', prioridad: 'alta', fecha_limite: localDateStr(), nota: 'Lo necesita para el comité del viernes. Cruzar con motivos de devolución.', estado: 'abierta', created_at: new Date().toISOString() },
        { id: 'p2', titulo: 'Indicador de productividad por operario', solicitante: 'RRHH', prioridad: 'media', fecha_limite: null, nota: null, estado: 'abierta', created_at: new Date().toISOString() },
        { id: 'p3', titulo: 'Validar stock Sabaneta antes de facturar', solicitante: 'Comercial Grival', prioridad: 'baja', fecha_limite: '2026-07-01', nota: null, estado: 'abierta', created_at: new Date().toISOString() },
      ])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('peticiones')
      .select('*')
      .eq('estado', 'abierta')
      .order('created_at', { ascending: false })
    setPeticiones(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const ch = supabase
      .channel('peticiones-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'peticiones' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  async function addPeticion(e) {
    e.preventDefault()
    if (!titulo.trim()) return
    await supabase.from('peticiones').insert({
      titulo: titulo.trim(),
      solicitante: solicitante.trim() || null,
      prioridad,
      fecha_limite: fechaLimite || null,
      nota: nota.trim() || null,
    })
    setTitulo(''); setSolicitante(''); setPrioridad('media'); setFechaLimite(''); setNota(''); setShowDetails(false)
    load()
  }

  async function archivar(id) {
    await supabase.from('peticiones').update({ estado: 'archivada', updated_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  async function eliminar(id) {
    await supabase.from('peticiones').delete().eq('id', id)
    load()
  }

  async function convertir(pet, categoria) {
    // create the informes_items record from the request
    const { data: item } = await supabase
      .from('informes_items')
      .insert({
        name: pet.titulo,
        category: categoria,
        position: 999,
        target_weekday: categoria === 'semanal' ? 5 : null,
        status: 'backlog',
      })
      .select('id')
      .single()
    await supabase.from('peticiones').update({
      estado: 'convertida',
      convertido_a: categoria,
      item_id: item?.id || null,
      updated_at: new Date().toISOString(),
    }).eq('id', pet.id)
    setExpandId(null)
    load()
    onConverted?.()
  }

  const ordenadas = [...peticiones].sort((a, b) => {
    if (orden === 'prioridad') return (PRIO_RANK[a.prioridad] - PRIO_RANK[b.prioridad]) || (a.fecha_limite || '9999').localeCompare(b.fecha_limite || '9999')
    if (orden === 'fecha') return (a.fecha_limite || '9999-12-31').localeCompare(b.fecha_limite || '9999-12-31')
    return 0 // reciente = ya viene desc por created_at
  })

  return (
    <div>
      <form onSubmit={addPeticion} style={styles.capture}>
        <div style={styles.captureTop}>
          <input
            style={styles.captureInput}
            placeholder="¿Qué te pidieron? Escríbelo rápido…"
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
          />
          <button type="button" style={styles.detailsToggle} onClick={() => setShowDetails(s => !s)}>
            {showDetails ? <ChevronUp size={15} /> : <ChevronDown size={15} />} Detalles
          </button>
          <button type="submit" style={styles.captureBtn}>Capturar</button>
        </div>
        {showDetails && (
          <div style={styles.captureDetails}>
            <input style={styles.detailInput} placeholder="Quién lo pidió (jefe, área, cliente)…" value={solicitante} onChange={e => setSolicitante(e.target.value)} />
            <select style={styles.detailSelect} value={prioridad} onChange={e => setPrioridad(e.target.value)}>
              {PRIORIDADES.map(p => <option key={p.key} value={p.key}>Prioridad: {p.label}</option>)}
            </select>
            <input type="date" style={{ ...styles.detailSelect, colorScheme: 'dark' }} value={fechaLimite} onChange={e => setFechaLimite(e.target.value)} title="Fecha límite" />
            <input style={styles.detailInput} placeholder="Nota (opcional)…" value={nota} onChange={e => setNota(e.target.value)} />
          </div>
        )}
      </form>

      <div style={styles.toolbar}>
        <span style={styles.count}>
          <InboxIcon size={13} strokeWidth={2.25} style={{ verticalAlign: -2, marginRight: 5 }} />
          {peticiones.length} {peticiones.length === 1 ? 'petición abierta' : 'peticiones abiertas'}
        </span>
        <div style={styles.orderTabs}>
          {[['prioridad', 'Prioridad'], ['fecha', 'Fecha límite'], ['reciente', 'Recientes']].map(([k, l]) => (
            <button key={k} onClick={() => setOrden(k)} style={{ ...styles.orderTab, ...(orden === k ? styles.orderTabActive : {}) }}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={styles.loading}>Cargando bandeja…</div>
      ) : ordenadas.length === 0 ? (
        <div style={styles.empty}>
          <InboxIcon size={22} strokeWidth={1.5} color="var(--text-faint)" style={{ marginBottom: 8 }} />
          <div>Bandeja vacía. Cuando te pidan algo, captúralo aquí en 2 segundos.</div>
        </div>
      ) : (
        <div style={styles.list}>
          {ordenadas.map((pet, idx) => {
            const prio = PRIORIDADES.find(p => p.key === pet.prioridad) || PRIORIDADES[1]
            const dr = diasRestantes(pet.fecha_limite)
            const vencido = dr !== null && dr < 0
            const hoy = dr === 0
            const expanded = expandId === pet.id
            return (
              <div key={pet.id} style={{ ...styles.card, animationDelay: `${idx * 40}ms`, borderLeftColor: prio.color }} className="row-in">
                <div style={styles.cardMain} onClick={() => setExpandId(expanded ? null : pet.id)}>
                  <div style={styles.cardHead}>
                    <span style={{ ...styles.prioDot, background: prio.color, boxShadow: `0 0 7px ${prio.color}` }} />
                    <span style={styles.cardTitle}>{pet.titulo}</span>
                  </div>
                  <div style={styles.cardMeta}>
                    {pet.solicitante && <span style={styles.metaChip}><User size={10} strokeWidth={2.5} /> {pet.solicitante}</span>}
                    {pet.fecha_limite && (
                      <span style={{ ...styles.metaChip, color: vencido ? 'var(--late)' : hoy ? 'var(--accent)' : 'var(--text-dim)' }}>
                        <Clock size={10} strokeWidth={2.5} />
                        {vencido ? `Vencida hace ${Math.abs(dr)}d` : hoy ? 'Vence hoy' : dr === 1 ? 'Vence mañana' : `${dr}d restantes`}
                      </span>
                    )}
                    <span style={{ ...styles.prioTag, color: prio.color, borderColor: prio.color }}>{prio.label.toUpperCase()}</span>
                  </div>
                  {expanded && pet.nota && <div style={styles.nota}>{pet.nota}</div>}
                </div>

                <div style={styles.cardActions}>
                  <div style={styles.convertGroup}>
                    <span style={styles.convertLabel}><ArrowRightCircle size={12} strokeWidth={2.25} /> Convertir en:</span>
                    <button style={styles.convBtn} onClick={() => convertir(pet, 'diario')}>Diario</button>
                    <button style={styles.convBtn} onClick={() => convertir(pet, 'semanal')}>Semanal</button>
                    <button style={styles.convBtn} onClick={() => convertir(pet, 'tarea')}>Tarea</button>
                  </div>
                  <div style={styles.endActions}>
                    <button style={styles.iconBtn} title="Archivar" onClick={() => archivar(pet.id)}><Archive size={14} strokeWidth={2} /></button>
                    <button style={styles.iconBtn} title="Eliminar" onClick={() => eliminar(pet.id)}><Trash2 size={14} strokeWidth={2} /></button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const styles = {
  capture: { background: 'linear-gradient(180deg, var(--panel-hi), var(--panel))', border: '1px solid var(--edge)', borderRadius: 12, padding: 14, marginBottom: 16 },
  captureTop: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  captureInput: { flex: 1, minWidth: 200, background: 'var(--void-2)', border: '1px solid var(--edge)', borderRadius: 9, padding: '11px 14px', color: 'var(--text)', fontSize: 14.5, outline: 'none' },
  detailsToggle: { display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: '1px solid var(--edge)', color: 'var(--text-dim)', borderRadius: 9, padding: '0 12px', fontSize: 12.5, fontWeight: 600 },
  captureBtn: { background: 'var(--accent)', border: 'none', borderRadius: 9, padding: '11px 20px', color: '#1a1200', fontSize: 14, fontWeight: 800, boxShadow: '0 0 18px rgba(255,182,46,0.25)' },
  captureDetails: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 },
  detailInput: { flex: 1, minWidth: 180, background: 'var(--void-2)', border: '1px solid var(--edge)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' },
  detailSelect: { background: 'var(--void-2)', border: '1px solid var(--edge)', borderRadius: 8, padding: '9px 10px', color: 'var(--text)', fontSize: 13 },

  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 },
  count: { fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: 0.3 },
  orderTabs: { display: 'flex', gap: 5 },
  orderTab: { background: 'var(--panel)', border: '1px solid var(--edge-soft)', color: 'var(--text-faint)', borderRadius: 7, padding: '5px 11px', fontSize: 11.5, fontWeight: 600 },
  orderTabActive: { borderColor: 'var(--accent-deep)', color: 'var(--accent)' },

  loading: { color: 'var(--text-dim)', padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)' },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--text-faint)', padding: '44px 20px', textAlign: 'center', fontSize: 13.5 },

  list: { display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 20 },
  card: { background: 'linear-gradient(180deg, var(--panel), var(--void-2))', border: '1px solid var(--edge-soft)', borderLeft: '3px solid', borderRadius: 10, padding: '13px 15px' },
  cardMain: { cursor: 'pointer' },
  cardHead: { display: 'flex', alignItems: 'center', gap: 9 },
  prioDot: { width: 9, height: 9, borderRadius: '50%', flexShrink: 0 },
  cardTitle: { fontSize: 14.5, fontWeight: 600 },
  cardMeta: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, marginLeft: 18, alignItems: 'center' },
  metaChip: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' },
  prioTag: { fontSize: 9, fontWeight: 700, letterSpacing: 1, padding: '2px 7px', border: '1px solid', borderRadius: 5, fontFamily: 'var(--font-mono)' },
  nota: { marginTop: 10, marginLeft: 18, padding: '9px 12px', background: 'var(--void-2)', borderRadius: 8, fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5, whiteSpace: 'pre-wrap' },

  cardActions: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 12, marginLeft: 18, flexWrap: 'wrap' },
  convertGroup: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  convertLabel: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' },
  convBtn: { background: 'transparent', border: '1px solid var(--accent-deep)', color: 'var(--accent)', borderRadius: 6, padding: '4px 11px', fontSize: 11.5, fontWeight: 700 },
  endActions: { display: 'flex', gap: 4 },
  iconBtn: { background: 'transparent', border: '1px solid var(--edge)', color: 'var(--text-faint)', borderRadius: 6, padding: '5px 7px', display: 'flex' },
}
