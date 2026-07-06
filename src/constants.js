export const AREAS = [
  { key: 'paqueteo', label: 'Paqueteo', color: '#4fb8ff' },
  { key: 'inventario', label: 'Inventario', color: '#35d07f' },
  { key: 'facturacion', label: 'Facturación', color: '#ffb62e' },
  { key: 'picking', label: 'Picking', color: '#c084fc' },
  { key: 'transporte', label: 'Transporte', color: '#fb923c' },
  { key: 'otro', label: 'Otro', color: '#8b8676' },
]

export function areaMeta(key) {
  return AREAS.find(a => a.key === key) || null
}

export function localDateStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function turnoActual(hour = new Date().getHours()) {
  if (hour < 12) return 'mañana'
  if (hour < 18) return 'tarde'
  return 'noche'
}
