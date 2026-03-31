
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const { data, error } = await supabase.from('obfuscated_scripts').select('obfuscated_content, projects (is_active)').limit(1);
console.log(JSON.stringify({ error, hasData: !!data }));

