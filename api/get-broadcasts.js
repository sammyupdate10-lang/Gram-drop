// api/get-broadcasts.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const now = new Date().toISOString();

    // Get active broadcasts
    const { data: broadcasts, error: fetchError } = await supabase
      .from('broadcasts')
      .select('id, title, message, emoji, created_at')
      .lte('created_at', now)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('created_at', { ascending: false })
      .limit(5);

    if (fetchError) {
      return res.status(500).json({ error: 'Failed to fetch broadcasts' });
    }

    return res.status(200).json({
      broadcasts: broadcasts || [],
      total: broadcasts ? broadcasts.length : 0
    });
  } catch (error) {
    console.error('Fetch error:', error);
    return res.status(500).json({ error: error.message });
  }
      }
