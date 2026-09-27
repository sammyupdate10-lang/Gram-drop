// api/broadcast.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ADMIN_ID = process.env.ADMIN_ID; // Your Telegram ID

export default async function handler(req, res) {
  const { method } = req;

  // SEND BROADCAST (ADMIN ONLY)
  if (method === 'POST') {
    try {
      const { adminId, title, message, emoji } = req.body;

      // Verify admin
      if (adminId !== ADMIN_ID) {
        return res.status(403).json({ error: 'Unauthorized. Admin only.' });
      }

      if (!title || !message) {
        return res.status(400).json({ error: 'Title and message required' });
      }

      const { data: broadcast, error: createError } = await supabase
        .from('broadcasts')
        .insert({
          admin_id: adminId,
          title: title,
          message: message,
          emoji: emoji || '📢',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // Expires in 7 days
        })
        .select()
        .single();

      if (createError) {
        return res.status(500).json({ error: 'Failed to create broadcast' });
      }

      return res.status(200).json({
        success: true,
        broadcast_id: broadcast.id,
        message: `Broadcast sent to all users!`
      });
    } catch (error) {
      console.error('Broadcast error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
