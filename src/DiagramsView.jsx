import { useState, useEffect, useCallback, useRef } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { Plus, Trash2, PenLine } from 'lucide-react'
import { supabase } from './supabase'

const SAVE_DEBOUNCE_MS = 1200

export default function DiagramsView() {
  const [diagrams, setDiagrams] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const saveTimer = useRef(null)
  const excalidrawApiRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('diagrams')
      .select('id, name, updated_at, position')
      .eq('archived', false)
      .order('position', { ascending: true })
    setDiagrams(data || [])
    if (data && data.length > 0) {
      setActiveId(prev => (prev && data.some(d => d.id === prev) ? prev : data[0].id))
    } else {
      setActiveId(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const active = diagrams.find(d => d.id === activeId)

  async function createDiagram() {
    const maxPos = diagrams.reduce((m, d) => Math.max(m, d.position || 0), 0)
    const { data, error } = await supabase
      .from('diagrams')
      .insert({ name: `Diagrama ${diagrams.length + 1}`, scene: {}, position: maxPos + 1 })
      .select('id, name, updated_at, position')
      .single()
    if (!error && data) {
      setDiagrams(prev => [...prev, data])
      setActiveId(data.id)
    }
  }

  async function deleteDiagram(id) {
    await supabase.from('diagrams').update({ archived: true }).eq('id', id)
    load()
  }

  async function renameDiagram(id) {
    const name = renameValue.trim()
    setRenamingId(null)
    if (!name) return
    await supabase.from('diagrams').update({ name }).eq('id', id)
    setDiagrams(prev => prev.map(d => (d.id === id ? { ...d, name } : d)))
  }

  const scheduleSave = useCallback((id, elements, appState) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const scene = {
        elements,
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor,
          zoom: appState.zoom,
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
        },
      }
      await supabase.from('diagrams').update({ scene, updated_at: new Date().toISOString() }).eq('id', id)
    }, SAVE_DEBOUNCE_MS)
  }, [])

  async function loadScene(id) {
    const { data } = await supabase.from('diagrams').select('scene').eq('id', id).single()
    return data?.scene || {}
  }

  const [activeScene, setActiveScene] = useState(null)
  useEffect(() => {
    if (!activeId) { setActiveScene(null); return }
    let cancelled = false
    loadScene(activeId).then(scene => { if (!cancelled) setActiveScene(scene) })
    return () => { cancelled = true }
  }, [activeId])

  return (
    <div style={styles.wrap} className="diagrams-wrap">
      <div style={styles.sidebar}>
        <button style={styles.newBtn} onClick={createDiagram}>
          <Plus size={14} strokeWidth={2.5} style={{ verticalAlign: -2, marginRight: 4 }} />Nuevo
        </button>
        <div style={styles.diagList}>
          {diagrams.map(d => (
            <div
              key={d.id}
              style={{ ...styles.diagRow, ...(d.id === activeId ? styles.diagRowActive : {}) }}
              onClick={() => setActiveId(d.id)}
            >
              <PenLine size={12} strokeWidth={2} color={d.id === activeId ? 'var(--led-green)' : 'var(--text-faint)'} />
              {renamingId === d.id ? (
                <input
                  autoFocus
                  style={styles.renameInput}
                  value={renameValue}
                  onClick={e => e.stopPropagation()}
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={() => renameDiagram(d.id)}
                  onKeyDown={e => { if (e.key === 'Enter') renameDiagram(d.id); if (e.key === 'Escape') setRenamingId(null) }}
                />
              ) : (
                <span
                  style={styles.diagName}
                  onDoubleClick={e => { e.stopPropagation(); setRenamingId(d.id); setRenameValue(d.name) }}
                  title="Doble clic para renombrar"
                >
                  {d.name}
                </span>
              )}
              <button style={styles.diagDelete} onClick={e => { e.stopPropagation(); deleteDiagram(d.id) }}>
                <Trash2 size={12} strokeWidth={2} />
              </button>
            </div>
          ))}
          {!loading && diagrams.length === 0 && (
            <div style={styles.emptySidebar}>Sin diagramas aún.</div>
          )}
        </div>
      </div>

      <div style={styles.canvasPane}>
        {loading ? (
          <div style={styles.canvasEmpty}>Cargando…</div>
        ) : !active ? (
          <div style={styles.canvasEmpty}>Crea un diagrama para empezar a dibujar.</div>
        ) : activeScene === null ? (
          <div style={styles.canvasEmpty}>Cargando diagrama…</div>
        ) : (
          <Excalidraw
            key={active.id}
            excalidrawAPI={api => { excalidrawApiRef.current = api }}
            theme="dark"
            initialData={{
              elements: activeScene.elements || [],
              appState: { ...(activeScene.appState || {}), collaborators: new Map() },
            }}
            onChange={(elements, appState) => scheduleSave(active.id, elements, appState)}
          />
        )}
      </div>
    </div>
  )
}

const styles = {
  wrap: { display: 'flex', gap: 12, height: '72vh', minHeight: 480 },
  sidebar: { width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  newBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--led-green)',
    border: 'none', borderRadius: 9, padding: '10px 12px', color: '#052013', fontSize: 13, fontWeight: 700,
  },
  diagList: { display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' },
  diagRow: {
    display: 'flex', alignItems: 'center', gap: 7, background: 'var(--steel-800)', border: '1px solid var(--steel-line)',
    borderRadius: 8, padding: '8px 10px', cursor: 'pointer', fontSize: 12.5,
  },
  diagRowActive: { borderColor: 'var(--led-green)', background: 'var(--steel-700)' },
  diagName: { flex: 1, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  renameInput: {
    flex: 1, fontSize: 12.5, background: 'var(--steel-600)', border: '1px solid var(--led-blue)',
    borderRadius: 5, padding: '2px 5px', color: 'var(--text)', outline: 'none', minWidth: 0,
  },
  diagDelete: { background: 'transparent', border: 'none', color: 'var(--text-faint)', padding: 2, display: 'flex' },
  emptySidebar: { fontSize: 12, color: 'var(--text-faint)', padding: '10px 4px' },
  canvasPane: {
    flex: 1, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--steel-line)',
    background: '#121212',
  },
  canvasEmpty: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-faint)', fontSize: 13.5 },
}
