// api/tasks.js - Vercel Function
// Handle task claiming with channel verification

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export default async function handler(req, res) {
  const { method } = req;

  try {
    // GET - Get task config with link
    if (method === 'GET') {
      const { taskId } = req.query;

      if (!taskId) {
        // Return all tasks
        const { data: tasks } = await supabase
          .from('task_config')
          .select('*')
          .order('id');

        return res.status(200).json({
          success: true,
          tasks: tasks || []
        });
      }

      // Return specific task
      const { data: task } = await supabase
        .from('task_config')
        .select('*')
        .eq('id', taskId)
        .single();

      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      return res.status(200).json({
        success: true,
        task: task
      });
    }

    // POST - Claim task reward
    if (method === 'POST') {
      const { userId, taskType, verifyChannel } = req.body;

      if (!userId || !taskType) {
        return res.status(400).json({ error: 'User ID and task type required' });
      }

      // Get task config from database
      const { data: taskConfig } = await supabase
        .from('task_config')
        .select('*')
        .eq('id', taskType)
        .single();

      if (!taskConfig) {
        return res.status(400).json({ error: 'Invalid task type' });
      }

      const reward = parseFloat(taskConfig.reward);

      // If task has a link, verify channel membership
      if (taskConfig.link && verifyChannel !== false) {
        try {
          // Verify user is member of channel
          const verifyRes = await fetch('https://gram-drop.vercel.app/api/verify-channel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: userId,
              channelId: taskConfig.link
            })
          });

          const verifyData = await verifyRes.json();

          if (!verifyData.isMember) {
            return res.status(400).json({
              error: 'Please join the channel first',
              requiresVerification: true,
              channelLink: taskConfig.link
            });
          }
        } catch (verifyError) {
          console.error('Verification error:', verifyError);
          return res.status(400).json({
            error: 'Could not verify channel membership',
            requiresVerification: true
          });
        }
      }

      // Check if task already claimed
      const { data: existingTask } = await supabase
        .from('tasks')
        .select('id, claimed')
        .eq('user_id', userId)
        .eq('task_type', taskType)
        .single();

      if (existingTask && existingTask.claimed) {
        return res.status(400).json({ error: 'Task already claimed' });
      }

      // Create or update task record
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

      // Add reward to user balance
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

      // Log task analytics
      await supabase.from('task_analytics').insert({
        user_id: userId,
        task_id: taskType,
        claimed: true,
        reward: reward,
        clicked_at: new Date().toISOString()
      });

      // Distribute referral earnings (15%, 5%, 1%)
      const { data: referrals } = await supabase
        .from('referrals')
        .select('referrer_id, level, commission_rate, is_active')
        .eq('referred_id', userId)
        .eq('is_active', true);

      if (referrals && referrals.length > 0) {
        for (const ref of referrals) {
          const commissionRate = ref.commission_rate / 100;
          const commission = reward * commissionRate;

          // Update referrer balance
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

          // Update referral earnings
          await supabase
            .from('referrals')
            .update({
              earnings: commission
            })
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
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Task error:', error);
    return res.status(500).json({ error: error.message });
  }
}
