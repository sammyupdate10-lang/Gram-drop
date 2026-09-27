// api/auth.js
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function verifyTelegramData(initData) {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const urlParams = new URLSearchParams(initData);
  
  const hash = urlParams.get('hash');
  urlParams.delete('hash');
  
  const dataCheckString = [...urlParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(BOT_TOKEN)
    .digest();

  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  return calculatedHash === hash;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { initData } = req.body;

    if (!initData) {
      return res.status(400).json({ error: 'No init data provided' });
    }

    if (!verifyTelegramData(initData)) {
      return res.status(401).json({ error: 'Invalid Telegram data' });
    }

    const urlParams = new URLSearchParams(initData);
    const userStr = urlParams.get('user');
    const user = JSON.parse(userStr);

    const telegramId = user.id;
    const username = user.username || `user_${telegramId}`;

    let { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('id, balance, miner_activated')
      .eq('telegram_id', telegramId)
      .single();

    if (fetchError && fetchError.code === 'PGRST116') {
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          telegram_id: telegramId,
          telegram_username: username,
          balance: 0,
          miner_activated: false
        })
        .select()
        .single();

      if (createError) {
        return res.status(500).json({ error: 'Failed to create user' });
      }

      existingUser = newUser;
    }

    const { error: milestoneError } = await supabase
      .from('milestones')
      .insert({
        user_id: existingUser.id,
        active_referrals: 0
      })
      .onConflict(['user_id'])
      .merge();

    return res.status(200).json({
      success: true,
      user: {
        id: existingUser.id,
        telegram_id: telegramId,
        username: username,
        balance: existingUser.balance,
        miner_activated: existingUser.miner_activated
      }
    });
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({ error: error.message });
  }
  }
