import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://btcobmoqjzlnxbvggrnk.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Y29ibW9xanpsbnhidmdncm5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MzE5MjUsImV4cCI6MjA5NDEwNzkyNX0.ennIwd6WM8Ilkwl82ZyapKlw6M43pnKTyiboM-bU7DY'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
