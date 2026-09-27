// api/withdraw.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MIN_WITHDRAWAL = 0.03; // TON

export default async function handler(req, res) {
  const { method } = req;
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'User ID required' });
  }

  // REQUEST WITHDRAWAL
  if (method === 'POST') {
    try {
      const { tonWalletAddress, amountInGram } = req.body;

      if (!tonWalletAddress || !amountInGram) {
        return res.status(400).json({ error: 'Wallet and amount required' });
      }

      const amount = parseFloat(amountInGram);

      if (amount < MIN_WITHDRAWAL) {
        return res.status(400).json({
          error: `Minimum withdrawal is ${MIN_WITHDRAWAL} TON`
        });
      }

      const { data: user, error: userError } = await supabase
        .from('users')
        .select('balance')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (parseFloat(user.balance) < amount) {
        return res.status(400).json({
          error: 'Insufficient balance',
          balance: user.balance,
          requested: amount
        });
      }

      // Create withdrawal request (PENDING - manual approval)
      const { data: withdrawal, error: createError } = await supabase
        .from('withdrawals')
        .insert({
          user_id: userId,
          amount: amount,
          ton_wallet_address: tonWalletAddress,
          status: 'pending'
        })
        .select()
        .single();

      if (createError) {
        return res.status(500).json({ error: 'Failed to create withdrawal' });
      }

      // Deduct from balance immediately
      const newBalance = parseFloat(user.balance) - amount;
      await supabase
        .from('users')
        .update({ balance: newBalance })
        .eq('id', userId);

      return res.status(200).json({
        success: true,
        withdrawal_id: withdrawal.id,
        amount: amount,
        status: 'pending',
        message: 'Withdrawal request created. Waiting for approval.',
        new_balance: newBalance.toFixed(5)
      });
    } catch (error) {
      console.error('Withdrawal error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // GET WITHDRAWAL HISTORY
  if (method === 'GET') {
    try {
      const { data: withdrawals, error: fetchError } = await supabase
        .from('withdrawals')
        .select('id, amount, status, created_at, ton_wallet_address')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (fetchError) {
        return res.status(500).json({ error: 'Failed to fetch withdrawals' });
      }

      return res.status(200).json({
        withdrawals: withdrawals,
        total: withdrawals.length
      });
    } catch (error) {
      console.error('Fetch error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
