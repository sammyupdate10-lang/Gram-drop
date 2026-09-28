// api/verify-channel.js - Vercel Function
// Verify if user has joined a Telegram channel

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, channelId } = req.body;

    if (!userId || !channelId) {
      return res.status(400).json({ error: 'User ID and channel ID required' });
    }

    // Convert channel username to channel ID if needed
    let channel = channelId;
    if (channelId.startsWith('@')) {
      // It's a username, use as-is
      channel = channelId;
    } else if (!channelId.startsWith('-')) {
      // Convert regular channel ID to negative format if needed
      channel = '-100' + channelId;
    }

    // Check if user is member of channel using getChatMember
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getChatMember`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channel,
        user_id: userId
      })
    });

    const result = await response.json();

    if (!result.ok) {
      // User not found in channel or channel doesn't exist
      return res.status(200).json({
        success: false,
        isMember: false,
        message: 'User has not joined the channel'
      });
    }

    // Check member status
    const memberStatus = result.result.status;
    const validStatuses = ['member', 'administrator', 'creator'];
    const isMember = validStatuses.includes(memberStatus);

    return res.status(200).json({
      success: true,
      isMember: isMember,
      status: memberStatus,
      message: isMember ? 'User is member of channel' : 'User is not an active member'
    });
  } catch (error) {
    console.error('Verify channel error:', error);
    return res.status(500).json({ error: error.message });
  }
}
