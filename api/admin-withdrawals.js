// api/admin-withdrawals.js - Vercel Function
// Manage withdrawal approvals/rejections with notifications

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ADMIN_ID = process.env.ADMIN_ID;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE = 'https://gram-drop.vercel.app/api';

export default async function handler(req, res) {
  const { method } = req;
  const { adminId, adminPassword } = req.query;

  // Verify admin
  if (adminId !== ADMIN_ID || adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // GET PENDING WITHDRAWALS
    if (method === 'GET') {
      const { data: withdrawals, error } = await supabase
        .from('withdrawals')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({
        success: true,
        withdrawals: withdrawals || []
      });
    }

    // APPROVE OR REJECT WITHDRAWAL
    if (method === 'PUT') {
      const { withdrawal_id, action } = req.body;

      if (!withdrawal_id || !action) {
        return res.status(400).json({ error: 'Withdrawal ID and action required' });
      }

      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action' });
      }

      // Get withdrawal
      const { data: withdrawal } = await supabase
        .from('withdrawals')
        .select('*')
        .eq('id', withdrawal_id)
        .single();

      if (!withdrawal) {
        return res.status(404).json({ error: 'Withdrawal not found' });
      }

      let newStatus = action === 'approve' ? 'completed' : 'rejected';
      let txHash = null;

      // APPROVE
      if (action === 'approve') {
        // Generate fake TON tx hash (in production, integrate with actual TON blockchain)
        txHash = 'FAKE_' + Math.random().toString(36).substring(2, 15).toUpperCase();

        // Update withdrawal
        await supabase
          .from('withdrawals')
          .update({
            status: 'completed',
            ton_tx_hash: txHash,
            updated_at: new Date().toISOString()
          })
          .eq('id', withdrawal_id);

        // Send approval notification to user
        await fetch(`${API_BASE}/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: withdrawal.user_id,
            type: 'withdrawal_approved',
            data: {
              amount: withdrawal.amount,
              txHash: txHash
            }
          })
        });

        // Log to payment channel
        const { data: settings } = await supabase
          .from('settings')
          .select('payment_channel_id')
          .eq('id', 1)
          .single();

        if (settings && settings.payment_channel_id) {
          const message = `
✅ <b>Withdrawal Approved</b>

📊 <b>Details:</b>
👤 User ID: <code>${withdrawal.user_id}</code>
💰 Amount: ${withdrawal.amount} TON
🏦 Wallet: <code>${withdrawal.ton_wallet_address}</code>
🔗 TX: <code>${txHash}</code>
⏰ Time: ${new Date().toLocaleString()}

Status: ✅ Processed
          `.trim();

          await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: settings.payment_channel_id,
              text: message,
              parse_mode: 'HTML'
            })
          });
        }
      }

      // REJECT
      if (action === 'reject') {
        // Refund balance to user
        const { data: user } = await supabase
          .from('users')
          .select('balance')
          .eq('id', withdrawal.user_id)
          .single();

        const newBalance = parseFloat(user.balance) + parseFloat(withdrawal.amount);

        await supabase
          .from('users')
          .update({ balance: newBalance })
          .eq('id', withdrawal.user_id);

        // Update withdrawal
        await supabase
          .from('withdrawals')
          .update({
            status: 'rejected',
            updated_at: new Date().toISOString()
          })
          .eq('id', withdrawal_id);

        // Send rejection notification to user
        await fetch(`${API_BASE}/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: withdrawal.user_id,
            type: 'withdrawal_declined',
            data: {
              amount: withdrawal.amount,
              reason: 'Admin decision'
            }
          })
        });
      }

      return res.status(200).json({
        success: true,
        message: `Withdrawal ${action}ed successfully`,
        newStatus
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Admin withdrawals error:', error);
    return res.status(500).json({ error: error.message });
  }
        }
    
