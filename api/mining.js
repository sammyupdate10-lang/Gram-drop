// api/mining.js
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

  // ACTIVATE MINER
  if (method === 'POST') {
    try {
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, miner_activated, miner_start_time')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (user.miner_activated) {
        return res.status(400).json({ error: 'Miner already activated' });
      }

      const now = new Date();

      const { error: updateError } = await supabase
        .from('users')
        .update({
          miner_activated: true,
          miner_start_time: now.toISOString()
        })
        .eq('id', userId);

      if (updateError) {
        return res.status(500).json({ error: 'Failed to activate miner' });
      }

      const cycleEnd = new Date(now.getTime() + MINING_CYCLE);
      await supabase.from('mining').insert({
        user_id: userId,
        cycle_start: now.toISOString(),
        cycle_end: cycleEnd.toISOString(),
        earned: MINING_REWARD,
        claimed: false
      });

      return res.status(200).json({
        success: true,
        message: 'Miner activated',
        cycle_end: cycleEnd.toISOString()
      });
    } catch (error) {
      console.error('Activation error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // GET MINING STATUS
  if (method === 'GET') {
    try {
      const { data: user } = await supabase
        .from('users')
        .select('id, miner_activated, miner_start_time, balance')
        .eq('id', userId)
        .single();

      if (!user || !user.miner_activated) {
        return res.status(200).json({
          mining_active: false,
          earned: 0,
          timer_remaining: 0
        });
      }

      const now = Date.now();
      const started = new Date(user.miner_start_time).getTime();
      const elapsed = now - started;
      const progress = Math.min(1, elapsed / MINING_CYCLE);
      const earned = Math.min(MINING_REWARD, progress * MINING_REWARD);
      const remaining = Math.max(0, MINING_CYCLE - elapsed);

      return res.status(200).json({
        mining_active: true,
        earned: earned.toFixed(5),
        progress: (progress * 100).toFixed(1),
        timer_remaining: remaining,
        cycle_end: new Date(started + MINING_CYCLE).toISOString()
      });
    } catch (error) {
      console.error('Status error:', error);
      return res.status(500).json({ error: error.message });
    }
  }
}
