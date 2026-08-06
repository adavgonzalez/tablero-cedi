import { useState, useEffect, useCallback, useRef } from 'react'
import { Excalidraw, MainMenu } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import {
  Plus, Trash2, PenLine, Maximize2, Minimize2, Library, X, Check,
  Download, Search, Sparkles, PanelLeftClose, PanelLeft, Loader2,
} from 'lucide-react'
import { supabase } from './supabase'
import LibraryPanel from './LibraryPanel'

const SAVE_DEBOUNCE_MS = 1200
const LIB_RAW = 'https://raw.githubusercontent.com/excalidraw/excalidraw-libraries/main/libraries/'
const LIB_INDEX = 'https://raw.githubusercontent.com/excalidraw/excalidraw-libraries/main/libraries.json'

// Categorías derivadas por palabras clave del nombre/descripción de cada librería.
const CATEGORIAS = [
  { key: 'todas', label: 'Todas', match: () => true },
  { key: 'flujos', label: 'Flujos y procesos', match: t => /flow|process|uml|er |diagram|decision|swimlane|bpmn|sequence|architecture|system/i.test(t) },
  { key: 'iconos', label: 'Íconos y logos', match: t => /icon|logo|symbol|emoji|sticker|avatar/i.test(t) },
  { key: 'datos', label: 'Datos y gráficos', match: t => /chart|graph|data|viz|plot|statistic|analytics/i.test(t) },
  { key: 'gestion', label: 'Gestión', match: t => /gantt|scrum|kanban|board|roadmap|planning|project|canvas|retro/i.test(t) },
  { key: 'interfaz', label: 'Interfaz', match: t => /wireframe|ui |ux|web|mobile|form|dropdown|kit|device|screen|button/i.test(t) },
  { key: 'nube', label: 'Nube e infra', match: t => /aws|azure|gcp|cloud|kubernetes|docker|network|server|devops|database/i.test(t) },
  { key: 'personas', label: 'Personas', match: t => /people|person|stick|figure|human|team|user|character/i.test(t) },
  { key: 'formas', label: 'Formas básicas', match: t => /shape|basic|arrow|line|geometric|polygon|star|post-it|sticky/i.test(t) },
  { key: 'otras', label: 'Otras', match: () => false },
]

function categoriaDe(lib) {
  const t = `${lib.name} ${lib.description || ''}`
  for (const c of CATEGORIAS) {
    if (c.key !== 'todas' && c.match(t)) return c.key
  }
  return 'otras'
}

// Plantillas rápidas: elementos precreados que se insertan en el lienzo.
function rect(id, x, y, w, h, text, bg = 'transparent', stroke = '#1e1e1e') {
  return {
    type: 'rectangle', version: 1, versionNonce: Math.floor(Math.random() * 1e9), isDeleted: false,
    id, fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid', roughness: 1, opacity: 100,
    angle: 0, x, y, strokeColor: stroke, backgroundColor: bg, width: w, height: h, seed: Math.floor(Math.random() * 1e9),
    groupIds: [], frameId: null, roundness: { type: 3 }, boundElements: [], updated: 1, link: null, locked: false,
  }
}
function texto(id, x, y, t, size = 16) {
  return {
    type: 'text', version: 1, versionNonce: Math.floor(Math.random() * 1e9), isDeleted: false,
    id, fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid', roughness: 1, opacity: 100,
    angle: 0, x, y, strokeColor: '#1e1e1e', backgroundColor: 'transparent',
    width: t.length * size * 0.55, height: size * 1.25, seed: Math.floor(Math.random() * 1e9),
    groupIds: [], frameId: null, roundness: null, boundElements: [], updated: 1, link: null, locked: false,
    fontSize: size, fontFamily: 1, text: t, textAlign: 'center', verticalAlign: 'top',
    containerId: null, originalText: t, lineHeight: 1.25,
  }
}
function flecha(id, x, y, dx, dy) {
  return {
    type: 'arrow', version: 1, versionNonce: Math.floor(Math.random() * 1e9), isDeleted: false,
    id, fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid', roughness: 1, opacity: 100,
    angle: 0, x, y, strokeColor: '#1e1e1e', backgroundColor: 'transparent',
    width: Math.abs(dx), height: Math.abs(dy), seed: Math.floor(Math.random() * 1e9),
    groupIds: [], frameId: null, roundness: { type: 2 }, boundElements: [], updated: 1, link: null, locked: false,
    points: [[0, 0], [dx, dy]], lastCommittedPoint: null, startBinding: null, endBinding: null,
    startArrowhead: null, endArrowhead: 'arrow', elbowed: false,
  }
}

const PLANTILLAS = [
  {
    id: 'flujo',
    nombre: 'Flujo de proceso',
    desc: '4 pasos encadenados con flechas',
    build: () => {
      const els = []
      const pasos = ['Inicio', 'Paso 2', 'Paso 3', 'Fin']
      pasos.forEach((p, i) => {
        const x = 80 + i * 220
        els.push(rect(`fr${i}`, x, 160, 160, 80, p, '#e7f5ff', '#1971c2'))
        els.push(texto(`ft${i}`, x + 45, 190, p))
        if (i < pasos.length - 1) els.push(flecha(`fa${i}`, x + 170, 200, 40, 0))
      })
      return els
    },
  },
  {
    id: 'decision',
    nombre: 'Punto de decisión',
    desc: 'Rombo con salidas Sí / No',
    build: () => [
      rect('d1', 220, 60, 160, 70, '', '#fff3bf', '#e67700'),
      texto('dt1', 262, 85, '¿Condición?'),
      flecha('da1', 300, 135, 0, 60),
      rect('d2', 100, 200, 150, 70, '', '#d3f9d8', '#2f9e44'),
      texto('dt2', 158, 226, 'Sí'),
      rect('d3', 360, 200, 150, 70, '', '#ffe3e3', '#e03131'),
      texto('dt3', 420, 226, 'No'),
      flecha('da2', 290, 195, -110, 10),
      flecha('da3', 320, 195, 110, 10),
    ],
  },
  {
    id: 'sap',
    nombre: 'Flujo SAP (VT11→VL06F)',
    desc: 'Cadena típica de transacciones',
    build: () => {
      const els = []
      const tx = ['VT11', 'VL06F', 'ZSD', 'Salida']
      tx.forEach((t, i) => {
        const x = 70 + i * 210
        els.push(rect(`sr${i}`, x, 150, 150, 75, t, '#f3f0ff', '#6741d9'))
        els.push(texto(`st${i}`, x + 45, 178, t))
        if (i < tx.length - 1) els.push(flecha(`sa${i}`, x + 158, 188, 42, 0))
      })
      return els
    },
  },
  {
    id: 'carriles',
    nombre: 'Carriles (swimlanes)',
    desc: '3 carriles por área/responsable',
    build: () => {
      const els = []
      const lanes = ['Paqueteo', 'Inventario', 'Facturación']
      lanes.forEach((l, i) => {
        const y = 80 + i * 130
        els.push(rect(`lr${i}`, 60, y, 820, 110, '', 'transparent', '#adb5bd'))
        els.push(texto(`lt${i}`, 80, y + 12, l, 14))
      })
      return els
    },
  },
]

export default function DiagramsView({ focusId, onFocusConsumed }) {
  const [diagrams, setDiagrams] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [libOpen, setLibOpen] = useState(false)
  const [libTag, setLibTag] = useState('todas')
  const [libBusca, setLibBusca] = useState('')
  const [catalogo, setCatalogo] = useState([])
  const [catalogoCargando, setCatalogoCargando] = useState(false)
  const [instaladas, setInstaladas] = useState([]) // [{lib_id, nombre, activa}]
  const [cargandoLib, setCargandoLib] = useState(null)
  const [libError, setLibError] = useState(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const [activeScene, setActiveScene] = useState(null)
  const saveTimer = useRef(null)
  const apiRef = useRef(null)
  const wrapRef = useRef(null)
  const sceneLoadedFor = useRef(null)

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

  useEffect(() => {
    if (focusId) { setActiveId(focusId); onFocusConsumed?.() }
  }, [focusId, onFocusConsumed])

  // Salir de pantalla completa con Escape
  useEffect(() => {
    if (!fullscreen) return
    const onKey = e => { if (e.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [fullscreen])

  const active = diagrams.find(d => d.id === activeId) || (activeId ? { id: activeId, name: '' } : null)

  async function createDiagram(nombre = null, elements = null) {
    const maxPos = diagrams.reduce((m, d) => Math.max(m, d.position || 0), 0)
    const scene = elements ? { elements } : { elements: [] }
    const { data, error } = await supabase
      .from('diagrams')
      .insert({
        name: nombre || `Diagrama ${diagrams.length + 1}`,
        scene,
        position: maxPos + 1,
      })
      .select('id, name, updated_at, position')
      .single()
    if (error || !data) {
      console.error('No se pudo crear el diagrama', error)
      return
    }
    setDiagrams(prev => [...prev, data])
    sceneLoadedFor.current = data.id
    setActiveScene(scene)
    setActiveId(data.id)
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
          zoom: appState.zoom, scrollX: appState.scrollX, scrollY: appState.scrollY,
        },
      }
      await supabase.from('diagrams').update({ scene, updated_at: new Date().toISOString() }).eq('id', id)
    }, SAVE_DEBOUNCE_MS)
  }, [])

  useEffect(() => {
    if (!activeId) { setActiveScene(null); sceneLoadedFor.current = null; return }
    if (sceneLoadedFor.current === activeId) return // ya la tenemos (p.ej. recién creada)
    let cancel = false
    setActiveScene(null)
    supabase.from('diagrams').select('scene').eq('id', activeId).single()
      .then(({ data }) => {
        if (cancel) return
        sceneLoadedFor.current = activeId
        setActiveScene(data?.scene || { elements: [] })
      })
    return () => { cancel = true }
  }, [activeId])

  // --- Librerías ---
  // Las librerías se muestran en nuestro panel propio (LibraryPanel), que las
  // agrupa en secciones desplegables. Aquí solo gestionamos qué hay guardado.

  const instaladasRef = useRef([])
  const [instaladasListas, setInstaladasListas] = useState(false)
  const cargarInstaladas = useCallback(async () => {
    const { data } = await supabase.from('diagram_libraries').select('lib_id, nombre, activa').order('nombre')
    const lista = data || []
    instaladasRef.current = lista
    setInstaladas(lista)
    setInstaladasListas(true)
    return lista
  }, [])

  useEffect(() => { cargarInstaladas() }, [cargarInstaladas])

  async function instalarLib(lib) {
    setCargandoLib(lib.source)
    setLibError(null)
    try {
      // Verificar que la librería se pueda descargar antes de guardarla.
      const res = await fetch(LIB_RAW + lib.source, { cache: 'force-cache' })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const json = await res.json()
      const n = (json.libraryItems?.length) || (json.library?.length) || 0
      if (!n) throw new Error('La librería llegó vacía')

      await supabase.from('diagram_libraries')
        .upsert({ lib_id: lib.source, nombre: lib.name, activa: true }, { onConflict: 'lib_id' })
      await cargarInstaladas()
      setLibOpen(false)
      setPanelOpen(true)
    } catch (e) {
      console.error('Error cargando librería', e)
      setLibError(`No se pudo cargar "${lib.name}". Revisa tu conexión e intenta de nuevo.`)
    } finally {
      setCargandoLib(null)
    }
  }

  async function quitarLib(libId) {
    await supabase.from('diagram_libraries').delete().eq('lib_id', libId)
    await cargarInstaladas()
  }

  // Catálogo completo desde el repositorio oficial (231 librerías).
  const cargarCatalogo = useCallback(async () => {
    if (catalogo.length || catalogoCargando) return
    setCatalogoCargando(true)
    try {
      const res = await fetch(LIB_INDEX, { cache: 'force-cache' })
      const json = await res.json()
      setCatalogo(Array.isArray(json) ? json : [])
    } catch (e) {
      setLibError('No se pudo cargar el catálogo de librerías.')
    } finally {
      setCatalogoCargando(false)
    }
  }, [catalogo.length, catalogoCargando])

  useEffect(() => { if (libOpen) cargarCatalogo() }, [libOpen, cargarCatalogo])

  function insertarPlantilla(pl) {
    if (!apiRef.current) return
    const actuales = apiRef.current.getSceneElements()

    // Calcular dónde empieza el espacio libre: debajo de todo lo dibujado.
    let offsetY = 0
    let offsetX = 0
    const vivos = actuales.filter(e => !e.isDeleted)
    if (vivos.length) {
      let maxY = -Infinity
      let minX = Infinity
      for (const e of vivos) {
        const bottom = (e.y || 0) + (e.height || 0)
        if (bottom > maxY) maxY = bottom
        if ((e.x || 0) < minX) minX = e.x || 0
      }
      offsetY = maxY + 120 // margen de aire entre bloques
      offsetX = minX
    }

    // Las plantillas se construyen con coordenadas propias; las trasladamos
    // y les damos ids únicos para no chocar con elementos existentes.
    const sufijo = Math.random().toString(36).slice(2, 8)
    const base = pl.build()
    const minTplX = Math.min(...base.map(e => e.x || 0))
    const minTplY = Math.min(...base.map(e => e.y || 0))

    const nuevos = base.map(e => ({
      ...e,
      id: `${e.id}-${sufijo}`,
      x: (e.x || 0) - minTplX + offsetX,
      y: (e.y || 0) - minTplY + offsetY,
    }))

    apiRef.current.updateScene({ elements: [...actuales, ...nuevos] })
    apiRef.current.scrollToContent(nuevos, { fitToContent: true, animate: true })
  }

  const instaladasIds = new Set(instaladas.map(l => l.lib_id))
  const libsFiltradas = catalogo.filter(l => {
    const okTag = libTag === 'todas' || categoriaDe(l) === libTag
    const q = libBusca.trim().toLowerCase()
    const okQ = !q || `${l.name} ${l.description || ''}`.toLowerCase().includes(q)
    return okTag && okQ
  })

  const contenido = (
    <div style={fullscreen ? styles.wrapFull : styles.wrap} className="diagrams-wrap" ref={wrapRef}>
      {sidebarOpen && (
        <aside style={styles.sidebar}>
          <button style={styles.newBtn} onClick={() => createDiagram()}>
            <Plus size={14} strokeWidth={2.5} /> Nuevo diagrama
          </button>

          <div style={styles.sideSection}>
            <span style={styles.sideLabel}>Mis diagramas</span>
            <div style={styles.diagList}>
              {diagrams.map(d => (
                <div
                  key={d.id}
                  style={{ ...styles.diagRow, ...(d.id === activeId ? styles.diagRowActive : {}) }}
                  onClick={() => setActiveId(d.id)}
                >
                  <PenLine size={12} strokeWidth={2} color={d.id === activeId ? 'var(--accent)' : 'var(--text-faint)'} />
                  {renamingId === d.id ? (
                    <input
                      autoFocus style={styles.renameInput} value={renameValue}
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
                    >{d.name}</span>
                  )}
                  <button style={styles.diagDelete} onClick={e => { e.stopPropagation(); deleteDiagram(d.id) }}>
                    <Trash2 size={12} strokeWidth={2} />
                  </button>
                </div>
              ))}
              {!loading && diagrams.length === 0 && <div style={styles.emptySide}>Sin diagramas aún.</div>}
            </div>
          </div>

          <div style={styles.sideSection}>
            <span style={styles.sideLabel}>Plantillas rápidas</span>
            <div style={styles.tplList}>
              {PLANTILLAS.map(pl => (
                <button key={pl.id} style={styles.tplBtn} onClick={() => insertarPlantilla(pl)} disabled={!active} title={pl.desc}>
                  <Sparkles size={11} strokeWidth={2.25} color="var(--accent)" />
                  <span>{pl.nombre}</span>
                </button>
              ))}
            </div>
          </div>

          <button style={styles.libBtn} onClick={() => setLibOpen(true)} disabled={!active}>
            <Library size={13} strokeWidth={2.25} /> Explorar librerías
            {instaladas.length > 0 && <span style={styles.libCount}>{instaladas.length}</span>}
          </button>
        </aside>
      )}

      <div style={styles.canvasPane}>
        <div style={styles.canvasBar}>
          <button style={styles.barBtn} onClick={() => setSidebarOpen(s => !s)} title={sidebarOpen ? 'Ocultar panel' : 'Mostrar panel'}>
            {sidebarOpen ? <PanelLeftClose size={14} strokeWidth={2} /> : <PanelLeft size={14} strokeWidth={2} />}
          </button>
          <span style={styles.barTitle}>{active?.name || 'Sin diagrama'}</span>
          <button style={{ ...styles.barBtn, ...(panelOpen ? styles.barBtnOn : {}) }} onClick={() => setPanelOpen(p => !p)} disabled={!active} title="Panel de íconos">
            <Library size={14} strokeWidth={2} />
          </button>
          <button style={styles.barBtn} onClick={() => setFullscreen(f => !f)} title={fullscreen ? 'Salir de pantalla completa (Esc)' : 'Pantalla completa'}>
            {fullscreen ? <Minimize2 size={14} strokeWidth={2} /> : <Maximize2 size={14} strokeWidth={2} />}
          </button>
        </div>

        <div style={styles.canvasInner}>
          {loading ? (
            <div style={styles.canvasEmpty}>Cargando…</div>
          ) : !active ? (
            <div style={styles.canvasEmpty}>
              <PenLine size={24} strokeWidth={1.5} color="var(--text-faint)" style={{ marginBottom: 10 }} />
              <div>Crea un diagrama para empezar a dibujar.</div>
              <button style={{ ...styles.newBtn, marginTop: 14, width: 'auto' }} onClick={() => createDiagram()}>
                <Plus size={14} strokeWidth={2.5} /> Nuevo diagrama
              </button>
            </div>
          ) : activeScene === null ? (
            <div style={styles.canvasEmpty}>Cargando diagrama…</div>
          ) : (
            <Excalidraw
              key={active.id}
              excalidrawAPI={api => { apiRef.current = api }}
              theme="dark"
              langCode="es-ES"
              initialData={{
                elements: activeScene.elements || [],
                appState: { ...(activeScene.appState || {}), collaborators: new Map() },
              }}
              onChange={(elements, appState) => scheduleSave(active.id, elements, appState)}
              UIOptions={{ canvasActions: { loadScene: false } }}
            >
              <MainMenu>
                <MainMenu.DefaultItems.ToggleTheme />
                <MainMenu.DefaultItems.ChangeCanvasBackground />
                <MainMenu.DefaultItems.SaveAsImage />
                <MainMenu.DefaultItems.Export />
              </MainMenu>
            </Excalidraw>
          )}
        </div>
      </div>

      {panelOpen && active && (
        <LibraryPanel
          librerias={instaladas}
          apiRef={apiRef}
          onClose={() => setPanelOpen(false)}
          onExplorar={() => setLibOpen(true)}
        />
      )}

      {/* Modal de librerías */}
      {libOpen && (
        <div style={styles.modalOverlay} onClick={() => setLibOpen(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHead}>
              <div>
                <div style={styles.modalTitle}>Explorar librerías</div>
                <div style={styles.modalSub}>
                  {catalogoCargando ? 'Cargando catálogo…' : `${catalogo.length} librerías públicas disponibles. Al agregar una, sus elementos aparecen en el panel de librería del lienzo.`}
                </div>
              </div>
              <button style={styles.modalClose} onClick={() => setLibOpen(false)}><X size={17} strokeWidth={2.25} /></button>
            </div>

            <div style={styles.modalTools}>
              <div style={styles.searchWrap}>
                <Search size={13} color="var(--text-faint)" strokeWidth={2.25} />
                <input style={styles.searchInput} placeholder="Buscar entre todas las librerías…" value={libBusca} onChange={e => setLibBusca(e.target.value)} />
              </div>
              <div style={styles.tagRow}>
                {CATEGORIAS.map(c => (
                  <button key={c.key} style={{ ...styles.tagBtn, ...(libTag === c.key ? styles.tagBtnActive : {}) }} onClick={() => setLibTag(c.key)}>{c.label}</button>
                ))}
              </div>
              {libError && <div style={styles.libError}>{libError}</div>}
            </div>

            <div style={styles.libGrid}>
              {catalogoCargando && <div style={styles.emptySide}>Cargando catálogo…</div>}
              {libsFiltradas.map(l => {
                const yaEsta = instaladasIds.has(l.source)
                const cargando = cargandoLib === l.source
                return (
                  <div key={l.source} style={styles.libCard}>
                    <div style={styles.libCardTop}>
                      <span style={styles.libNombre}>{l.name}</span>
                    </div>
                    <p style={styles.libDesc}>{(l.description || '').slice(0, 110)}</p>
                    <button
                      style={{ ...styles.libAdd, ...(yaEsta ? styles.libAddDone : {}) }}
                      onClick={() => (yaEsta ? quitarLib(l.source) : instalarLib(l))}
                      disabled={cargando}
                    >
                      {cargando ? <><Loader2 size={12} strokeWidth={2.5} className="spin" /> Cargando…</>
                        : yaEsta ? <><Check size={12} strokeWidth={3} /> Agregada · quitar</>
                        : <><Download size={12} strokeWidth={2.5} /> Agregar</>}
                    </button>
                  </div>
                )
              })}
              {!catalogoCargando && libsFiltradas.length === 0 && <div style={styles.emptySide}>Sin resultados.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )

  return contenido
}

const styles = {
  wrap: { display: 'flex', gap: 12, height: '74vh', minHeight: 500, position: 'relative' },
  wrapFull: {
    display: 'flex', gap: 12, position: 'fixed', inset: 0, zIndex: 9999,
    background: 'var(--void)', padding: 12,
  },

  sidebar: { width: 210, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' },
  newBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'var(--accent)',
    border: 'none', borderRadius: 9, padding: '10px 12px', color: '#1a1200', fontSize: 12.5, fontWeight: 800, width: '100%',
  },
  sideSection: { display: 'flex', flexDirection: 'column', gap: 7 },
  sideLabel: { fontSize: 9.5, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'var(--font-mono)', fontWeight: 700 },
  diagList: { display: 'flex', flexDirection: 'column', gap: 5 },
  diagRow: {
    display: 'flex', alignItems: 'center', gap: 7, background: 'var(--panel)', border: '1px solid var(--edge-soft)',
    borderRadius: 8, padding: '8px 10px', cursor: 'pointer', fontSize: 12.5,
  },
  diagRowActive: { borderColor: 'var(--accent-deep)', background: 'rgba(255,182,46,0.07)' },
  diagName: { flex: 1, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  renameInput: { flex: 1, fontSize: 12.5, background: 'var(--void-2)', border: '1px solid var(--accent)', borderRadius: 5, padding: '2px 5px', color: 'var(--text)', outline: 'none', minWidth: 0 },
  diagDelete: { background: 'transparent', border: 'none', color: 'var(--text-faint)', padding: 2, display: 'flex' },
  emptySide: { fontSize: 11.5, color: 'var(--text-faint)', padding: '8px 4px' },

  tplList: { display: 'flex', flexDirection: 'column', gap: 5 },
  tplBtn: {
    display: 'flex', alignItems: 'center', gap: 6, background: 'var(--panel)', border: '1px solid var(--edge-soft)',
    color: 'var(--text-dim)', borderRadius: 8, padding: '7px 10px', fontSize: 11.5, fontWeight: 600, textAlign: 'left',
  },
  libList: { display: 'flex', flexDirection: 'column', gap: 4 },
  libRow: { display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px', background: 'var(--panel)', border: '1px solid var(--edge-soft)', borderRadius: 7 },
  libToggle: {
    width: 15, height: 15, flexShrink: 0, borderRadius: 4, border: '1px solid var(--edge)',
    background: 'transparent', color: '#1a1200', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  },
  libToggleOn: { background: 'var(--accent)', borderColor: 'var(--accent)' },
  libRowName: { flex: 1, fontSize: 11.5, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' },
  libHint: { fontSize: 10, color: 'var(--text-faint)', lineHeight: 1.4, marginTop: 2 },
  libBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 'auto',
    background: 'transparent', border: '1px solid var(--accent-deep)', color: 'var(--accent)',
    borderRadius: 9, padding: '9px 12px', fontSize: 12, fontWeight: 700,
  },
  libCount: { background: 'var(--accent)', color: '#1a1200', borderRadius: 8, padding: '0 6px', fontSize: 10, fontWeight: 800 },

  canvasPane: { flex: 1, display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--edge)', minWidth: 0 },
  canvasBar: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--panel)', borderBottom: '1px solid var(--edge)' },
  barTitle: { flex: 1, fontSize: 12.5, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  barBtn: { background: 'transparent', border: '1px solid var(--edge)', color: 'var(--text-dim)', borderRadius: 7, padding: '5px 7px', display: 'flex' },
  barBtnOn: { borderColor: 'var(--accent-deep)', color: 'var(--accent)', background: 'rgba(255,182,46,0.08)' },
  canvasInner: { flex: 1, background: '#121212', minHeight: 0 },
  canvasEmpty: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-faint)', fontSize: 13.5, textAlign: 'center', padding: 20 },

  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(3px)' },
  modal: { width: '100%', maxWidth: 720, maxHeight: '84vh', display: 'flex', flexDirection: 'column', background: 'var(--panel)', border: '1px solid var(--edge)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' },
  modalHead: { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 20px', borderBottom: '1px solid var(--edge-soft)' },
  modalTitle: { fontSize: 16, fontWeight: 800, color: 'var(--text)' },
  modalSub: { fontSize: 12, color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.5 },
  modalClose: { marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--text-faint)', display: 'flex', padding: 2 },
  modalTools: { display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--edge-soft)' },
  searchWrap: { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--void-2)', border: '1px solid var(--edge)', borderRadius: 9, padding: '0 12px' },
  searchInput: { flex: 1, background: 'transparent', border: 'none', padding: '9px 0', color: 'var(--text)', fontSize: 13, outline: 'none' },
  tagRow: { display: 'flex', gap: 5, flexWrap: 'wrap' },
  tagBtn: { background: 'transparent', border: '1px solid var(--edge)', color: 'var(--text-faint)', borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 600 },
  tagBtnActive: { borderColor: 'var(--accent-deep)', color: 'var(--accent)', background: 'rgba(255,182,46,0.08)' },
  libError: { fontSize: 12, color: 'var(--late)', background: 'rgba(255,87,87,0.1)', border: '1px solid rgba(255,87,87,0.35)', borderRadius: 8, padding: '8px 11px', lineHeight: 1.45 },

  libGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10, padding: 20, overflowY: 'auto' },
  libCard: { display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--void-2)', border: '1px solid var(--edge-soft)', borderRadius: 10, padding: 12 },
  libCardTop: { display: 'flex', alignItems: 'center', gap: 8 },
  libNombre: { flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text)' },
  libTag: { fontSize: 8.5, fontWeight: 700, letterSpacing: 0.6, color: 'var(--text-faint)', border: '1px solid var(--edge)', borderRadius: 4, padding: '1px 6px', fontFamily: 'var(--font-mono)' },
  libDesc: { fontSize: 11.5, color: 'var(--text-dim)', lineHeight: 1.45, margin: 0, flex: 1 },
  libAdd: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: 'var(--accent)', border: 'none', borderRadius: 7, padding: '7px 10px', color: '#1a1200', fontSize: 11.5, fontWeight: 800 },
  libAddDone: { background: 'transparent', border: '1px solid var(--go)', color: 'var(--go)' },
}
