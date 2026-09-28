// api/notify.js - Vercel Function
// Send Telegram notifications to users

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, type, data } = req.body;

    if (!userId || !type) {
      return res.status(400).json({ error: 'User ID and type required' });
    }

    let message = '';
    let parseMode = 'HTML';

    // REFERRAL NOTIFICATION
    if (type === 'referral') {
      const { referrerName, level } = data;
      message = `
🎉 <b>New Referral!</b>

Someone joined using your referral link!

👤 <b>Referrer Level:</b> ${level}
💰 <b>Commission:</b> ${level === 1 ? '15%' : level === 2 ? '5%' : '1%'}

Keep recruiting to earn more! 🚀
      `.trim();
    }

    // WITHDRAWAL APPROVED NOTIFICATION
    if (type === 'withdrawal_approved') {
      const { amount, txHash } = data;
      message = `
✅ <b>Withdrawal Approved!</b>

Your withdrawal has been approved and will be sent to your TON wallet shortly.

💰 <b>Amount:</b> ${amount} TON
🔗 <b>TX Hash:</b> <code>${txHash || 'Processing...'}</code>

Check your wallet in a few minutes.
      `.trim();
    }

    // WITHDRAWAL DECLINED NOTIFICATION
    if (type === 'withdrawal_declined') {
      const { amount, reason } = data;
      message = `
❌ <b>Withdrawal Declined</b>

Your withdrawal request was declined and your balance has been refunded.

💰 <b>Amount Refunded:</b> ${amount} TON
📝 <b>Reason:</b> ${reason || 'Admin decision'}

Please try again or contact support.
      `.trim();
    }

    if (!message) {
      return res.status(400).json({ error: 'Invalid notification type' });
    }

    // Send to user
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: userId,
        text: message,
        parse_mode: parseMode
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Telegram API error:', error);
      return res.status(400).json({ error: 'Failed to send notification' });
    }

    const result = await response.json();

    return res.status(200).json({
      success: true,
      message: 'Notification sent',
      telegramResponse: result
    });
  } catch (error) {
    console.error('Notify error:', error);
    return res.status(500).json({ error: error.message });
  }
}
