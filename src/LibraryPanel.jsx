import { useState, useEffect, useRef, useCallback } from 'react'
import { exportToSvg } from '@excalidraw/excalidraw'
import { ChevronDown, ChevronRight, Loader2, Search, X } from 'lucide-react'

const LIB_RAW = 'https://raw.githubusercontent.com/excalidraw/excalidraw-libraries/main/libraries/'

// Cache en memoria para no re-descargar librerías al plegar/desplegar.
const cacheItems = new Map()

async function traerItems(src) {
  if (cacheItems.has(src)) return cacheItems.get(src)
  const res = await fetch(LIB_RAW + src, { cache: 'force-cache' })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const json = await res.json()
  let items = []
  if (Array.isArray(json.libraryItems) && json.libraryItems.length) items = json.libraryItems
  else if (Array.isArray(json.library)) items = json.library.map((elements, i) => ({ id: `${src}-${i}`, elements }))
  cacheItems.set(src, items)
  return items
}

function Miniatura({ elements, onInsert }) {
  const box = useRef(null)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        const svg = await exportToSvg({
          elements,
          appState: { exportBackground: false, viewBackgroundColor: 'transparent', exportWithDarkMode: true },
          files: null,
          exportPadding: 4,
        })
        if (cancel || !box.current) return
        svg.setAttribute('width', '100%')
        svg.setAttribute('height', '100%')
        svg.style.maxWidth = '100%'
        svg.style.maxHeight = '100%'
        box.current.innerHTML = ''
        box.current.appendChild(svg)
        setListo(true)
      } catch { /* si falla una miniatura, se deja el placeholder */ }
    })()
    return () => { cancel = true }
  }, [elements])

  return (
    <button style={styles.thumb} onClick={onInsert} title="Clic para insertar en el lienzo">
      <div ref={box} style={styles.thumbInner} />
      {!listo && <span style={styles.thumbDot} />}
    </button>
  )
}

function Seccion({ lib, abierta, onToggle, onInsert, filtro }) {
  const [items, setItems] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!abierta || items || cargando) return
    setCargando(true)
    traerItems(lib.lib_id)
      .then(setItems)
      .catch(() => setError(true))
      .finally(() => setCargando(false))
  }, [abierta, items, cargando, lib.lib_id])

  const visibles = items && filtro
    ? items.filter(it => (it.name || '').toLowerCase().includes(filtro.toLowerCase()))
    : items

  return (
    <div style={styles.seccion}>
      <button style={styles.secHead} onClick={onToggle}>
        {abierta ? <ChevronDown size={13} strokeWidth={2.5} /> : <ChevronRight size={13} strokeWidth={2.5} />}
        <span style={styles.secNombre}>{lib.nombre}</span>
        {items && <span style={styles.secCount}>{items.length}</span>}
      </button>

      {abierta && (
        <div style={styles.secBody}>
          {cargando && <div style={styles.secMsg}><Loader2 size={13} className="spin" strokeWidth={2.5} /> Cargando…</div>}
          {error && <div style={styles.secMsg}>No se pudo cargar.</div>}
          {visibles && visibles.length === 0 && <div style={styles.secMsg}>Sin elementos.</div>}
          {visibles && visibles.length > 0 && (
            <div style={styles.grid}>
              {visibles.map((it, i) => (
                <Miniatura key={it.id || i} elements={it.elements} onInsert={() => onInsert(it.elements)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function LibraryPanel({ librerias, apiRef, onClose, onExplorar }) {
  const [abiertas, setAbiertas] = useState(() => new Set())
  const [filtro, setFiltro] = useState('')

  const toggle = useCallback(id => {
    setAbiertas(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }, [])

  // Insertar un elemento de librería en el centro de la vista actual.
  const insertar = useCallback(elements => {
    const api = apiRef.current
    if (!api || !elements?.length) return
    const st = api.getAppState()
    const cx = (-st.scrollX + st.width / 2) / st.zoom.value
    const cy = (-st.scrollY + st.height / 2) / st.zoom.value

    const minX = Math.min(...elements.map(e => e.x || 0))
    const minY = Math.min(...elements.map(e => e.y || 0))
    const maxX = Math.max(...elements.map(e => (e.x || 0) + (e.width || 0)))
    const maxY = Math.max(...elements.map(e => (e.y || 0) + (e.height || 0)))
    const dx = cx - (minX + maxX) / 2
    const dy = cy - (minY + maxY) / 2

    const sufijo = Math.random().toString(36).slice(2, 8)
    const mapaIds = {}
    elements.forEach(e => { mapaIds[e.id] = `${e.id}-${sufijo}` })

    const nuevos = elements.map(e => ({
      ...e,
      id: mapaIds[e.id] || `${e.id}-${sufijo}`,
      x: (e.x || 0) + dx,
      y: (e.y || 0) + dy,
      seed: Math.floor(Math.random() * 1e9),
      versionNonce: Math.floor(Math.random() * 1e9),
      groupIds: (e.groupIds || []).map(g => `${g}-${sufijo}`),
      // remapear vínculos entre elementos del mismo grupo
      boundElements: (e.boundElements || []).map(b => ({ ...b, id: mapaIds[b.id] || b.id })),
      containerId: e.containerId ? (mapaIds[e.containerId] || e.containerId) : e.containerId,
    }))

    const actuales = api.getSceneElements()
    api.updateScene({ elements: [...actuales, ...nuevos] })
  }, [apiRef])

  return (
    <aside style={styles.panel}>
      <div style={styles.head}>
        <span style={styles.titulo}>Íconos y formas</span>
        <button style={styles.close} onClick={onClose}><X size={15} strokeWidth={2.25} /></button>
      </div>

      <div style={styles.buscaWrap}>
        <Search size={12} color="var(--text-faint)" strokeWidth={2.25} />
        <input style={styles.busca} placeholder="Filtrar…" value={filtro} onChange={e => setFiltro(e.target.value)} />
      </div>

      <div style={styles.lista}>
        {librerias.length === 0 ? (
          <div style={styles.vacio}>
            Aún no has agregado librerías.
            <button style={styles.explorarBtn} onClick={onExplorar}>Explorar librerías</button>
          </div>
        ) : (
          librerias.map(l => (
            <Seccion
              key={l.lib_id}
              lib={l}
              abierta={abiertas.has(l.lib_id)}
              onToggle={() => toggle(l.lib_id)}
              onInsert={insertar}
              filtro={filtro}
            />
          ))
        )}
      </div>

      {librerias.length > 0 && (
        <button style={styles.explorarBtnFooter} onClick={onExplorar}>+ Agregar más librerías</button>
      )}
    </aside>
  )
}

const styles = {
  panel: {
    width: 250, flexShrink: 0, display: 'flex', flexDirection: 'column',
    background: 'var(--panel)', border: '1px solid var(--edge)', borderRadius: 12, overflow: 'hidden',
  },
  head: { display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', borderBottom: '1px solid var(--edge-soft)' },
  titulo: { flex: 1, fontSize: 12.5, fontWeight: 800, color: 'var(--text)' },
  close: { background: 'transparent', border: 'none', color: 'var(--text-faint)', display: 'flex', padding: 2 },

  buscaWrap: { display: 'flex', alignItems: 'center', gap: 7, margin: '10px 12px 6px', padding: '0 10px', background: 'var(--void-2)', border: '1px solid var(--edge)', borderRadius: 8 },
  busca: { flex: 1, background: 'transparent', border: 'none', padding: '7px 0', color: 'var(--text)', fontSize: 12, outline: 'none' },

  lista: { flex: 1, overflowY: 'auto', padding: '4px 8px 8px' },
  vacio: { display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', padding: '28px 12px', fontSize: 12, color: 'var(--text-faint)', textAlign: 'center' },
  explorarBtn: { background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 14px', color: '#1a1200', fontSize: 12, fontWeight: 800 },
  explorarBtnFooter: { margin: 10, background: 'transparent', border: '1px solid var(--accent-deep)', color: 'var(--accent)', borderRadius: 8, padding: '8px 12px', fontSize: 11.5, fontWeight: 700 },

  seccion: { marginBottom: 3 },
  secHead: {
    display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: 'transparent', border: 'none',
    color: 'var(--text-dim)', padding: '8px 6px', fontSize: 11.5, fontWeight: 700, textAlign: 'left', borderRadius: 7,
  },
  secNombre: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  secCount: { fontSize: 9.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', background: 'var(--void-2)', borderRadius: 5, padding: '1px 5px' },
  secBody: { paddingBottom: 6 },
  secMsg: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-faint)', padding: '8px 10px' },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, padding: '2px 4px' },
  thumb: {
    position: 'relative', aspectRatio: '1', background: 'var(--void-2)', border: '1px solid var(--edge-soft)',
    borderRadius: 7, padding: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  thumbInner: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  thumbDot: { position: 'absolute', width: 5, height: 5, borderRadius: '50%', background: 'var(--edge)' },
}
