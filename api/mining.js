// api/mining.js - Fixed Vercel Function
// Handle mining activation and earnings calculation

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MINING_REWARD = 0.0001;
const MINING_CYCLE = 86400000; // 24 hours

export default async function handler(req, res) {
  const { method } = req;
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'User ID required' });
  }

  try {
    // GET MINING STATUS
    if (method === 'GET') {
      const { data: user, error } = await supabase
        .from('users')
        .select('miner_activated, miner_start_time')
        .eq('id', userId)
        .single();

      if (error || !user) {
        return res.status(200).json({
          success: true,
          mining_active: false,
          earned: 0,
          progress: 0,
          timer_remaining: 0,
          message: 'Miner not activated'
        });
      }

      if (!user.miner_activated) {
        return res.status(200).json({
          success: true,
          mining_active: false,
          earned: 0,
          progress: 0,
          timer_remaining: 0
        });
      }

      const now = Date.now();
      const started = new Date(user.miner_start_time).getTime();
      const elapsed = now - started;
      const progress = Math.min(100, (elapsed / MINING_CYCLE) * 100);
      const earned = Math.min(MINING_REWARD, (progress / 100) * MINING_REWARD);
      const remaining = Math.max(0, MINING_CYCLE - elapsed);

      return res.status(200).json({
        success: true,
        mining_active: true,
        earned: earned.toFixed(6),
        progress: Math.round(progress),
        timer_remaining: remaining,
        cycle_end: new Date(started + MINING_CYCLE).toISOString()
      });
    }

    // ACTIVATE MINER (POST)
    if (method === 'POST') {
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('miner_activated')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (user.miner_activated) {
        return res.status(400).json({ error: 'Miner already active' });
      }

      const now = new Date().toISOString();

      const { error: updateError } = await supabase
        .from('users')
        .update({
          miner_activated: true,
          miner_start_time: now
        })
        .eq('id', userId);

      if (updateError) {
        return res.status(500).json({ error: 'Failed to activate miner' });
      }

      return res.status(200).json({
        success: true,
        message: 'Miner activated',
        miner_activated: true
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Mining error:', error);
    return res.status(500).json({ error: error.message });
  }
}
