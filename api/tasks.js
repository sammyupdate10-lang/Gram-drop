// api/tasks.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TASK_REWARDS = {
  channel: 0.001,
  community: 0.001,
  premium: 0.002,
  share: 0.0005
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, taskType } = req.body;

    if (!userId || !taskType) {
      return res.status(400).json({ error: 'User ID and task type required' });
    }

    if (!TASK_REWARDS[taskType]) {
      return res.status(400).json({ error: 'Invalid task type' });
    }

    const reward = TASK_REWARDS[taskType];

    const { data: existingTask } = await supabase
      .from('tasks')
      .select('id, claimed')
      .eq('user_id', userId)
      .eq('task_type', taskType)
      .single();

    if (existingTask && existingTask.claimed) {
      return res.status(400).json({ error: 'Task already claimed' });
    }

    if (existingTask) {
      await supabase
        .from('tasks')
        .update({ claimed: true, claimed_at: new Date().toISOString() })
        .eq('id', existingTask.id);
    } else {
      await supabase.from('tasks').insert({
        user_id: userId,
        task_type: taskType,
        reward: reward,
        claimed: true,
        claimed_at: new Date().toISOString()
      });
    }

    const { data: user } = await supabase
      .from('users')
      .select('balance')
      .eq('id', userId)
      .single();

    const newBalance = parseFloat(user.balance) + reward;

    await supabase
      .from('users')
      .update({ balance: newBalance })
      .eq('id', userId);

    const { data: referrals } = await supabase
      .from('referrals')
      .select('referrer_id, level, commission_rate, is_active')
      .eq('referred_id', userId)
      .eq('is_active', true);

    if (referrals && referrals.length > 0) {
      for (const ref of referrals) {
        const commissionRate = ref.commission_rate / 100;
        const commission = reward * commissionRate;

        const { data: referrer } = await supabase
          .from('users')
          .select('balance')
          .eq('id', ref.referrer_id)
          .single();

        const referrerNewBalance = parseFloat(referrer.balance) + commission;

        await supabase
          .from('users')
          .update({ balance: referrerNewBalance })
          .eq('id', ref.referrer_id);

        await supabase
          .from('referrals')
          .update({ earnings: commission })
          .eq('referrer_id', ref.referrer_id)
          .eq('referred_id', userId);
      }
    }

    return res.status(200).json({
      success: true,
      reward: reward,
      new_balance: newBalance.toFixed(5),
      message: `Task claimed! +${reward} GRAM`
    });
  } catch (error) {
    console.error('Task error:', error);
    return res.status(500).json({ error: error.message });
  }
          }
