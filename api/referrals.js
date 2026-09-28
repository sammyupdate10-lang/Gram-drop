// api/referrals.js - Vercel Function
// Handle referral tracking and milestone rewards

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const COMMISSION_RATES = {
  1: 15, // Level 1: 15%
  2: 5,  // Level 2: 5%
  3: 1   // Level 3: 1%
};

const MILESTONE_REWARDS = {
  5: 0.01,
  20: 0.05,
  50: 0.15,
  100: 0.40,
  500: 1.00,
  1000: 5.00
};

export default async function handler(req, res) {
  const { method } = req;
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'User ID required' });
  }

  // GET REFERRAL STATUS
  if (method === 'GET') {
    try {
      // Get user's active referrals
      const { data: activeReferrals } = await supabase
        .from('referrals')
        .select('id')
        .eq('referrer_id', userId)
        .eq('is_active', true);

      const activeCount = activeReferrals ? activeReferrals.length : 0;

      // Get milestone data
      const { data: milestone } = await supabase
        .from('milestones')
        .select('*')
        .eq('user_id', userId)
        .single();

      // Get referral earnings
      const { data: earnings } = await supabase
        .from('referrals')
        .select('earnings')
        .eq('referrer_id', userId);

      const totalEarnings = earnings
        ? earnings.reduce((sum, r) => sum + parseFloat(r.earnings || 0), 0)
        : 0;

      return res.status(200).json({
        active_referrals: activeCount,
        total_referral_earnings: totalEarnings.toFixed(5),
        milestones: {
          5: milestone?.level_5_claimed || false,
          20: milestone?.level_20_claimed || false,
          50: milestone?.level_50_claimed || false,
          100: milestone?.level_100_claimed || false,
          500: milestone?.level_500_claimed || false,
          1000: milestone?.level_1000_claimed || false
        }
      });
    } catch (error) {
      console.error('Fetch error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // CREATE REFERRAL LINK (when user registers via referral)
  if (method === 'POST') {
    try {
      const { referrer_id, referred_id } = req.body;

      if (!referrer_id || !referred_id) {
        return res.status(400).json({ error: 'Referrer and referred IDs required' });
      }

      // Check if referral already exists
      const { data: existing } = await supabase
        .from('referrals')
        .select('id')
        .eq('referrer_id', referrer_id)
        .eq('referred_id', referred_id)
        .single();

      if (existing) {
        return res.status(400).json({ error: 'Referral already exists' });
      }

      // Determine referral level based on depth
      const { data: parentReferral } = await supabase
        .from('referrals')
        .select('level')
        .eq('referred_id', referrer_id)
        .single();

      const level = parentReferral ? Math.min(parentReferral.level + 1, 3) : 1;
      const commissionRate = COMMISSION_RATES[level];

      // Create referral record
      const { data: referral, error: createError } = await supabase
        .from('referrals')
        .insert({
          referrer_id: referrer_id,
          referred_id: referred_id,
          level: level,
          commission_rate: commissionRate,
          is_active: false // Becomes active when referred user activates miner
        })
        .select()
        .single();

      if (createError) {
        return res.status(500).json({ error: 'Failed to create referral' });
      }

      // Send notification to referrer
      try {
        const notifyRes = await fetch('https://gram-drop.vercel.app/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: referrer_id,
            type: 'referral',
            data: {
              referrerName: 'New User',
              level: level
            }
          })
        });
        
        if (!notifyRes.ok) {
          console.error('Failed to send referral notification');
        }
      } catch (notifyError) {
        console.error('Notification error:', notifyError);
      }

      return res.status(200).json({
        success: true,
        referral_id: referral.id,
        level: level,
        commission_rate: commissionRate
      });
    } catch (error) {
      console.error('Create error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // CLAIM MILESTONE REWARD
  if (method === 'PUT') {
    try {
      const { milestone } = req.body;

      if (!milestone || !MILESTONE_REWARDS[milestone]) {
        return res.status(400).json({ error: 'Invalid milestone' });
      }

      const reward = MILESTONE_REWARDS[milestone];

      // Get current milestone data
      const { data: milestoneData } = await supabase
        .from('milestones')
        .select('active_referrals')
        .eq('user_id', userId)
        .single();

      // Check if user has enough referrals
      if (!milestoneData || milestoneData.active_referrals < milestone) {
        return res.status(400).json({
          error: `Need ${milestone} active referrals, have ${milestoneData?.active_referrals || 0}`
        });
      }

      // Check if milestone already claimed
      const fieldName = `level_${milestone}_claimed`;
      if (milestoneData[fieldName]) {
        return res.status(400).json({ error: 'Milestone already claimed' });
      }

      // Update milestone record
      const updateData = { [fieldName]: true };
      await supabase
        .from('milestones')
        .update(updateData)
        .eq('user_id', userId);

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

      return res.status(200).json({
        success: true,
        reward: reward,
        new_balance: newBalance.toFixed(5),
        message: `Milestone ${milestone} claimed! +${reward} GRAM`
      });
    } catch (error) {
      console.error('Claim error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
                              }
