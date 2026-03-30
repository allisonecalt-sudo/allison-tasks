import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hpiyvnfhoqnnnotrmwaz.supabase.co';
const SUPABASE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwaXl2bmZob3Fubm5vdHJtd2F6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NzIwNDEsImV4cCI6MjA4ODA0ODA0MX0.AsGhYitkSnyVMwpJII05UseS_gICaXiCy7d8iHsr6Qw';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

const TAG_ICONS: Record<string, string> = {
  finance: '💰',
  apartment: '🏠',
  'carmei-gat': '🏠',
  health: '🏥',
  dating: '💑',
  'work-clalit': '💼',
  'work-petachya': '💼',
  career: '📚',
  personal: '📋',
  travel: '✈️',
  pesach: '🕎',
  family: '👨‍👩‍👧',
  'phone-call': '📞',
  computer: '💻',
  errands: '🏃',
  'at-clalit': '🏢',
  'at-petachya': '🏢',
  'at-home': '🏠',
  admin: '📝',
  accountant: '🧾',
  'second-degree': '🎓',
  'budget-app': '📊',
  ivchun: '📋',
  'ef-app': '🧠',
  eforts: '📊',
  'the-trail': '🔥',
  torah: '📖',
  writing: '✍️',
  'usa-shopping': '🛒',
  merav: '👤',
  katya: '👤',
  reuben: '👤',
  marom: '👤',
  waiting: '⏳',
  test: '🧪',
};

export function getTagIcon(name: string): string {
  return TAG_ICONS[name] || '';
}
