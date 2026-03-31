import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'https://fxshsfrixihheappkiuo.supabase.co',
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || ''
);

async function check() {
  const { data, error } = await supabase.from('license_keys').select('id, key_value, project_id, current_uses, hwid, expires_at, max_uses, is_active').order('created_at', { ascending: false }).limit(5);
  console.log(error || data);
}
check();
