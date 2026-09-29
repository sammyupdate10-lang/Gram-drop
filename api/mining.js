// api/mining.js - Improved Vercel Function
// Handle mining activation and earnings

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { method } = req;
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'User ID required' });
  }

  try {
    // GET MINING STATUS
    if (method === 'GET') {
      // First check if user exists, if not create them
      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('id, miner_activated, miner_start_time')
        .eq('id', userId)
        .single();

      // If user doesn't exist, create them
      if (!existingUser) {
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({
            id: userId,
            balance: 0,
            miner_activated: false,
            miner_start_time: null
          })
          .select()
          .single();

        if (createError) {
          console.error('Create user error:', createError);
        }

        return res.status(200).json({
          success: true,
          mining_active: false,
          earned: 0,
          progress: 0,
          timer_remaining: 0
        });
      }

      // User exists and has NOT activated miner
      if (!existingUser.miner_activated) {
        return res.status(200).json({
          success: true,
          mining_active: false,
          earned: 0,
          progress: 0,
          timer_remaining: 0
        });
      }

      // User has activated miner - calculate progress
      const MINING_CYCLE = 86400000; // 24 hours
      const MINING_REWARD = 0.0001;

      const now = Date.now();
      const started = new Date(existingUser.miner_start_time).getTime();
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
      // Check if user exists
      const { data: user, error: selectError } = await supabase
        .from('users')
        .select('id, miner_activated')
        .eq('id', userId)
        .single();

      // User doesn't exist - create and activate
      if (!user) {
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({
            id: userId,
            balance: 0,
            miner_activated: true,
            miner_start_time: new Date().toISOString()
          })
          .select()
          .single();

        if (createError) {
          console.error('Error creating user:', createError);
          return res.status(500).json({ 
            error: 'Failed to create user',
            details: createError.message 
          });
        }

        return res.status(200).json({
          success: true,
          message: 'Miner activated',
          miner_activated: true
        });
      }

      // User exists - check if already activated
      if (user.miner_activated) {
        return res.status(400).json({ 
          error: 'Miner already activated',
          miner_activated: true 
        });
      }

      // Activate miner
      const { error: updateError } = await supabase
        .from('users')
        .update({
          miner_activated: true,
          miner_start_time: new Date().toISOString()
        })
        .eq('id', userId);

      if (updateError) {
        console.error('Error activating miner:', updateError);
        return res.status(500).json({ 
          error: 'Failed to activate miner',
          details: updateError.message 
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Miner activated successfully',
        miner_activated: true
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Mining error:', error);
    return res.status(500).json({ 
      error: 'Server error',
      details: error.message 
    });
  }
        }
          
