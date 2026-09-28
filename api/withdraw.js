// api/withdraw.js - Fixed Vercel Function
// Handle withdrawals

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
    // GET WITHDRAWAL HISTORY & STATUS
    if (method === 'GET') {
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('balance')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        return res.status(200).json({
          success: true,
          balance: 0,
          pending: 0,
          history: []
        });
      }

      // Get withdrawal requests
      const { data: withdrawals } = await supabase
        .from('withdrawals')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      const pending = withdrawals?.filter(w => w.status === 'pending').length || 0;

      return res.status(200).json({
        success: true,
        balance: user.balance,
        min_withdrawal: 0.03,
        pending: pending,
        withdrawals: withdrawals || []
      });
    }

    // CREATE WITHDRAWAL (POST)
    if (method === 'POST') {
      const { amount, ton_wallet_address } = req.body;

      if (!amount || !ton_wallet_address) {
        return res.status(400).json({ error: 'Amount and wallet address required' });
      }

      const { data: user } = await supabase
        .from('users')
        .select('balance')
        .eq('id', userId)
        .single();

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (parseFloat(user.balance) < parseFloat(amount)) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      if (amount < 0.03) {
        return res.status(400).json({ error: 'Minimum withdrawal is 0.03 TON' });
      }

      // Create withdrawal request
      const { data: withdrawal, error: createError } = await supabase
        .from('withdrawals')
        .insert({
          user_id: userId,
          amount: parseFloat(amount),
          ton_wallet_address: ton_wallet_address,
          status: 'pending',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        return res.status(500).json({ error: 'Failed to create withdrawal' });
      }

      // Deduct balance
      const newBalance = parseFloat(user.balance) - parseFloat(amount);
      await supabase
        .from('users')
        .update({ balance: newBalance })
        .eq('id', userId);

      return res.status(200).json({
        success: true,
        message: 'Withdrawal request created',
        withdrawal: withdrawal
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Withdraw error:', error);
    return res.status(500).json({ error: error.message });
  }
}
