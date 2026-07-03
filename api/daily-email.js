import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://btcobmoqjzlnxbvggrnk.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y29ibW9xanpsbnhidmdncm5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MzE5MjUsImV4cCI6MjA5NDEwNzkyNX0.ennIwd6WM8Ilkwl82ZyapKlw6M43pnKTyiboM-bU7DY'

const WEEKDAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000 // UTC-5, no DST

function bogotaNow() {
  return new Date(Date.now() - BOGOTA_OFFSET_MS)
}

function rowsHtml(items, emptyText) {
  if (!items.length) {
    return `<tr><td style="padding:14px 24px;color:#8b93a7;font-family:Arial,sans-serif;font-size:13px;">${emptyText}</td></tr>`
  }
  return items.map(i => `
    <tr>
      <td style="padding:10px 24px;border-bottom:1px solid #1b1f2a;color:#eef1f6;font-family:Arial,sans-serif;font-size:14px;">${escapeHtml(i.name)}</td>
      <td style="padding:10px 24px;border-bottom:1px solid #1b1f2a;color:#8b93a7;font-family:'Courier New',monospace;font-size:12px;text-align:right;white-space:nowrap;">${i.target_time ? i.target_time.slice(0, 5) : ''}</td>
    </tr>`).join('')
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

export default async function handler(req, res) {
  // Vercel automatically sends Authorization: Bearer $CRON_SECRET on scheduled invocations
  if (process.env.CRON_SECRET) {
    const auth = req.headers['authorization']
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'unauthorized' })
    }
  }

  const now = bogotaNow()
  const dow = now.getUTCDay() // using UTC getters on the shifted date == Bogotá local weekday

  if (dow === 0 || dow === 6) {
    return res.status(200).json({ skipped: 'weekend' })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: items, error } = await supabase
    .from('informes_items')
    .select('*')
    .eq('archived', false)
    .in('category', ['diario', 'semanal'])
    .order('position', { ascending: true })

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  const daily = (items || [])
    .filter(i => i.category === 'diario')
    .sort((a, b) => (a.target_time || '99:99').localeCompare(b.target_time || '99:99'))
  const weeklyToday = (items || []).filter(i => i.category === 'semanal' && i.target_weekday === dow)

  if (daily.length === 0 && weeklyToday.length === 0) {
    return res.status(200).json({ skipped: 'no-items' })
  }

  const dateLabel = `${WEEKDAYS_ES[dow]} ${now.getUTCDate()} de ${now.toLocaleDateString('es-CO', { month: 'long', timeZone: 'UTC' })}`
  const appUrl = process.env.APP_URL || 'https://tablero-cedi.vercel.app'

  const html = `
  <div style="background:#08090c;padding:32px 16px;font-family:Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#14171f;border:1px solid #2e3544;border-radius:14px;overflow:hidden;">
      <div style="padding:22px 24px;border-bottom:1px solid #2e3544;">
        <div style="color:#3ee08a;font-family:'Courier New',monospace;font-size:11px;letter-spacing:2px;font-weight:700;">TABLERO CEDI</div>
        <div style="color:#eef1f6;font-size:20px;font-weight:800;margin-top:4px;text-transform:capitalize;">${dateLabel}</div>
      </div>
      <div style="padding:8px 0 0;">
        <div style="padding:14px 24px 6px;color:#8b93a7;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Informes diarios</div>
        <table style="width:100%;border-collapse:collapse;">${rowsHtml(daily, 'Sin informes diarios configurados.')}</table>
        ${weeklyToday.length ? `
        <div style="padding:18px 24px 6px;color:#8b93a7;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Semanales de hoy</div>
        <table style="width:100%;border-collapse:collapse;">${rowsHtml(weeklyToday, '')}</table>` : ''}
      </div>
      <div style="padding:18px 24px 22px;">
        <a href="${appUrl}" style="display:inline-block;background:#3ee08a;color:#052013;font-weight:700;font-size:13px;padding:10px 18px;border-radius:8px;text-decoration:none;">Abrir tablero →</a>
      </div>
    </div>
  </div>`

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Tablero CEDI <onboarding@resend.dev>',
      to: [process.env.NOTIFY_EMAIL],
      subject: `Informes de hoy — ${dateLabel}`,
      html,
    }),
  })

  const result = await resendRes.json()
  if (!resendRes.ok) {
    return res.status(502).json({ error: result })
  }

  return res.status(200).json({ sent: true, id: result.id, daily: daily.length, weekly: weeklyToday.length })
}
