// api/user.js
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
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { data: tasks } = await supabase
      .from('tasks')
      .select('count')
      .eq('user_id', userId)
      .eq('claimed', true);

    const { data: referrals } = await supabase
      .from('referrals')
      .select('count')
      .eq('referrer_id', userId)
      .eq('is_active', true);

    const { data: withdrawals } = await supabase
      .from('withdrawals')
      .select('amount, status, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    const { data: milestones } = await supabase
      .from('milestones')
      .select('*')
      .eq('user_id', userId)
      .single();

    return res.status(200).json({
      user: {
        id: user.id,
        telegram_id: user.telegram_id,
        username: user.telegram_username,
        balance: user.balance,
        wallet_address: user.wallet_address,
        miner_activated: user.miner_activated,
        created_at: user.created_at
      },
      stats: {
        tasks_completed: tasks?.[0]?.count || 0,
        active_referrals: referrals?.[0]?.count || 0,
        milestones: milestones || {}
      },
      recent_withdrawals: withdrawals || [],
      message: 'User data retrieved successfully'
    });
  } catch (error) {
    console.error('User error:', error);
    return res.status(500).json({ error: error.message });
  }
}
