// api/tasks-manage.js - Vercel Function
// Add/delete tasks and view task analytics

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ADMIN_ID = process.env.ADMIN_ID;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

export default async function handler(req, res) {
  const { method } = req;
  const { adminId, adminPassword, taskId } = req.query;

  // Verify admin
  if (adminId !== ADMIN_ID || adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // GET ALL TASKS WITH ANALYTICS
    if (method === 'GET') {
      const { data: allTasks } = await supabase
        .from('task_config')
        .select('*')
        .order('id');

      // Get analytics for each task
      const tasksWithAnalytics = await Promise.all(
        (allTasks || []).map(async (task) => {
          const { data: analytics, count } = await supabase
            .from('task_analytics')
            .select('*', { count: 'exact' });

          const taskAnalytics = analytics?.filter(a => a.task_id === task.id) || [];
          const claimedCount = taskAnalytics?.filter(a => a.claimed)?.length || 0;
          const totalReward = taskAnalytics?.reduce((sum, a) => sum + (a.reward || 0), 0) || 0;

          return {
            ...task,
            total_clicks: taskAnalytics.length,
            total_claimed: claimedCount,
            total_reward_distributed: totalReward
          };
        })
      );

      return res.status(200).json({
        success: true,
        tasks: tasksWithAnalytics
      });
    }

    // CREATE NEW TASK
    if (method === 'POST') {
      const { taskId: newTaskId, name, reward, link, linkType } = req.body;

      if (!newTaskId || !name || reward === undefined) {
        return res.status(400).json({ error: 'Task ID, name, and reward required' });
      }

      if (reward < 0 || reward > 100) {
        return res.status(400).json({ error: 'Invalid reward amount' });
      }

      // Check if task already exists
      const { data: existing } = await supabase
        .from('task_config')
        .select('id')
        .eq('id', newTaskId)
        .single();

      if (existing) {
        return res.status(400).json({ error: 'Task ID already exists' });
      }

      const { data, error } = await supabase
        .from('task_config')
        .insert({
          id: newTaskId,
          name: name,
          reward: parseFloat(reward),
          link: link || null,
          link_type: linkType || 'channel',
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({
        success: true,
        message: 'Task created successfully',
        data
      });
    }

    // DELETE TASK
    if (method === 'DELETE') {
      if (!taskId) {
        return res.status(400).json({ error: 'Task ID required' });
      }

      // Get task before deleting
      const { data: task } = await supabase
        .from('task_config')
        .select('*')
        .eq('id', taskId)
        .single();

      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // Delete task
      const { error } = await supabase
        .from('task_config')
        .delete()
        .eq('id', taskId);

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({
        success: true,
        message: 'Task deleted successfully'
      });
    }

    // UPDATE TASK REWARD
    if (method === 'PUT') {
      const { taskId: updateTaskId, reward } = req.body;

      if (!updateTaskId || reward === undefined) {
        return res.status(400).json({ error: 'Task ID and reward required' });
      }

      const { data, error } = await supabase
        .from('task_config')
        .update({
          reward: parseFloat(reward),
          updated_at: new Date().toISOString()
        })
        .eq('id', updateTaskId)
        .select()
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({
        success: true,
        message: 'Task updated successfully',
        data
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Tasks manage error:', error);
    return res.status(500).json({ error: error.message });
  }
            }
        
