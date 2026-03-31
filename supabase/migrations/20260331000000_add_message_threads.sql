-- Create message_threads table for two-way messaging between admin and users
CREATE TABLE IF NOT EXISTS message_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES active_sessions(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  key_id UUID REFERENCES license_keys(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Message content
  sender_type TEXT NOT NULL CHECK (sender_type IN ('admin', 'user')),
  message TEXT NOT NULL,
  
  -- For custom notifications
  notification_type TEXT DEFAULT 'info' CHECK (notification_type IN ('info', 'warning', 'kick', 'ban')),
  
  -- Status
  is_read BOOLEAN DEFAULT false,
  is_delivered BOOLEAN DEFAULT false,
  
  -- For kick/reply functionality
  can_reply BOOLEAN DEFAULT false,
  reply_to_message_id UUID REFERENCES message_threads(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE message_threads ENABLE ROW LEVEL SECURITY;

-- Index for quick lookups
CREATE INDEX idx_message_threads_session ON message_threads(session_id);
CREATE INDEX idx_message_threads_project ON message_threads(project_id);
CREATE INDEX idx_message_threads_user ON message_threads(user_id);
CREATE INDEX idx_message_threads_unread ON message_threads(session_id, is_read) WHERE is_read = false;

-- RLS Policies
CREATE POLICY "Users can view messages for their sessions" ON message_threads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM active_sessions s
      JOIN license_keys k ON s.key_id = k.id
      JOIN projects p ON k.project_id = p.id
      WHERE s.id = message_threads.session_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert replies" ON message_threads
  FOR INSERT WITH CHECK (
    sender_type = 'user' AND
    EXISTS (
      SELECT 1 FROM active_sessions s
      WHERE s.id = message_threads.session_id
    )
  );

CREATE POLICY "Users can update their own messages (mark as read)" ON message_threads
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM active_sessions s
      JOIN license_keys k ON s.key_id = k.id
      JOIN projects p ON k.project_id = p.id
      WHERE s.id = message_threads.session_id AND p.user_id = auth.uid()
    )
  );

-- Add notification_enabled and kick_reason columns to active_sessions
ALTER TABLE active_sessions 
  ADD COLUMN IF NOT EXISTS notification_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS kick_reason TEXT,
  ADD COLUMN IF NOT EXISTS custom_ui_enabled BOOLEAN DEFAULT false;
