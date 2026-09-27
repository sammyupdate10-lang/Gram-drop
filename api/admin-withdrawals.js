// api/admin-withdrawals.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'gramdrop123';

export default async function handler(req, res) {
  const { method } = req;
  
  // Verify admin
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.includes(ADMIN_PASSWORD)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  // GET PENDING WITHDRAWALS
  if (method === 'GET') {
    try {
      const { data: withdrawals, error } = await supabase
        .from('withdrawals')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (error) throw error;

      return res.status(200).json({
        withdrawals: withdrawals || [],
        total: withdrawals ? withdrawals.length : 0
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // UPDATE WITHDRAWAL STATUS
  if (method === 'PUT') {
    try {
      const { withdrawalId } = req.query;
      const { status, tonTxHash } = req.body;

      if (!withdrawalId || !status) {
        return res.status(400).json({ error: 'Withdrawal ID and status required' });
      }

      const updateData = {
        status: status,
        processed_at: new Date().toISOString()
      };

      if (tonTxHash) {
        updateData.ton_tx_hash = tonTxHash;
      }

      const { error: updateError } = await supabase
        .from('withdrawals')
        .update(updateData)
        .eq('id', withdrawalId);

      if (updateError) throw updateError;

      // If rejected, refund the balance
      if (status === 'rejected') {
        const { data: withdrawal } = await supabase
          .from('withdrawals')
          .select('user_id, amount')
          .eq('id', withdrawalId)
          .single();

        if (withdrawal) {
          const { data: user } = await supabase
            .from('users')
            .select('balance')
            .eq('id', withdrawal.user_id)
            .single();

          const refundedBalance = parseFloat(user.balance) + withdrawal.amount;

          await supabase
            .from('users')
            .update({ balance: refundedBalance })
            .eq('id', withdrawal.user_id);
        }
      }

      return res.status(200).json({
        success: true,
        message: `Withdrawal ${status}`
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
            }
