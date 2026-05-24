// supabase.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = 'https://your-project-id.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVheWR1bXZ3bGF0YndjcWR0bHV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MzM0NTUsImV4cCI6MjA5NTAwOTQ1NX0.nolSdxlP-esK3x8-oEq_e9Ruk8QY-DfULA2BJySd3UY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);