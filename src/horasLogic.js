// Cálculo de horas extra para turno base L-V 7:00–16:00.
// Reglas:
//   L-V: 07:00–16:00 => normal; 16:00–19:00 => extra diurna; 19:00–24:00 y 00:00–07:00 => extra nocturna
//   Sábado: todo extra. <19:00 => extra diurna; >=19:00 (o <07:00) => extra nocturna
//   Domingo/festivo: todo dominical. <19:00 => dominical diurna; >=19:00 (o <07:00) => dominical nocturna
//
// Trabajamos en minutos desde medianoche. Si la salida es <= entrada, se asume que cruzó
// la medianoche (turno que termina al día siguiente) y se suma 24h a la salida.

const NOCHE_INI = 19 * 60 // 19:00
const DIA_INI = 7 * 60    // 07:00
const BASE_INI = 7 * 60   // 07:00
const BASE_FIN = 16 * 60  // 16:00

// dow: 0=domingo ... 6=sábado (getDay local)
// Devuelve la categoría de un minuto dado del día [0..1440) según el tipo de día.
function categoriaMinuto(minutoDelDia, dow, esFestivo) {
  const m = ((minutoDelDia % 1440) + 1440) % 1440
  const esNocturno = m >= NOCHE_INI || m < DIA_INI // 19:00–07:00

  if (dow === 0 || esFestivo) {
    return esNocturno ? 'h_dominical_nocturna' : 'h_dominical_diurna'
  }
  if (dow === 6) {
    return esNocturno ? 'h_extra_nocturna' : 'h_extra_diurna'
  }
  // Lunes a viernes
  if (m >= BASE_INI && m < BASE_FIN) return 'h_normal'
  return esNocturno ? 'h_extra_nocturna' : 'h_extra_diurna'
}

// fechaStr: 'YYYY-MM-DD'; entrada/salida: 'HH:MM'
export function calcularHoras(fechaStr, entrada, salida, esFestivo = false) {
  const acc = { h_normal: 0, h_extra_diurna: 0, h_extra_nocturna: 0, h_dominical_diurna: 0, h_dominical_nocturna: 0 }
  if (!fechaStr || !entrada || !salida) return acc

  const [eh, em] = entrada.split(':').map(Number)
  const [sh, sm] = salida.split(':').map(Number)
  const ini = eh * 60 + em
  let fin = sh * 60 + sm
  if (fin <= ini) fin += 24 * 60 // cruza medianoche

  // dow del día de entrada
  const base = new Date(fechaStr + 'T00:00:00')
  const dowEntrada = base.getDay()

  // recorremos minuto a minuto (máx 24h => 1440 iteraciones, barato y exacto)
  for (let m = ini; m < fin; m++) {
    // si pasamos de 1440, es el día siguiente => dow+1 y (para festivo) ya no aplica el flag del día anterior
    const diaSiguiente = m >= 1440
    const dow = diaSiguiente ? (dowEntrada + 1) % 7 : dowEntrada
    const festivo = diaSiguiente ? false : esFestivo
    const cat = categoriaMinuto(m, dow, festivo)
    acc[cat] += 1 / 60
  }

  // redondear a 2 decimales
  for (const k of Object.keys(acc)) acc[k] = Math.round(acc[k] * 100) / 100
  return acc
}

export const TIPOS_HORA = [
  { key: 'h_normal', label: 'Normal', short: 'NORM', color: 'var(--text-dim)' },
  { key: 'h_extra_diurna', label: 'Extra diurna', short: 'E. DIU', color: '#4fb8ff' },
  { key: 'h_extra_nocturna', label: 'Extra nocturna', short: 'E. NOC', color: '#c084fc' },
  { key: 'h_dominical_diurna', label: 'Dominical diurna', short: 'DOM DIU', color: '#ffb62e' },
  { key: 'h_dominical_nocturna', label: 'Dominical nocturna', short: 'DOM NOC', color: '#ff5757' },
]

// tipos que suman como "extra" (todo menos normal)
export const TIPOS_EXTRA = TIPOS_HORA.filter(t => t.key !== 'h_normal')
