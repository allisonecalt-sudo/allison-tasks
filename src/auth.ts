import { sb } from './config';

export async function doLogin(onSuccess: () => void): Promise<void> {
  const email = (document.getElementById('authEmail') as HTMLInputElement).value.trim();
  const pass = (document.getElementById('authPass') as HTMLInputElement).value;
  const errEl = document.getElementById('authError')!;
  const btn = document.getElementById('authBtn') as HTMLButtonElement;
  errEl.textContent = '';
  if (!email || !pass) {
    errEl.textContent = 'Please enter email and password';
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Signing in...';
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  btn.disabled = false;
  btn.textContent = 'Sign In';
  if (error) {
    errEl.textContent = error.message;
    return;
  }
  onSuccess();
}

export async function doLogout(): Promise<void> {
  try {
    await sb.auth.signOut();
  } catch (e) {
    console.error('Logout error:', e);
  }
  document.getElementById('app')?.classList.remove('visible');
  const authScreen = document.getElementById('authScreen');
  if (authScreen) authScreen.style.display = 'flex';
  localStorage.removeItem('tasks_cache');
}

export async function checkSession(onSuccess: () => void): Promise<void> {
  try {
    const {
      data: { session },
    } = await sb.auth.getSession();
    if (session) onSuccess();
  } catch (e) {
    console.error('Session check error:', e);
  }
}

export function updateHeader(): void {
  const now = new Date();
  const h = now.getHours();
  let greeting = 'Good morning';
  if (h >= 12 && h < 17) greeting = 'Good afternoon';
  else if (h >= 17 && h < 21) greeting = 'Good evening';
  else if (h >= 21 || h < 5) greeting = 'Good night';
  document.getElementById('hdrGreeting')!.textContent = greeting;

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  document.getElementById('hdrDate')!.textContent =
    `${days[now.getDay()]} ${months[now.getMonth()]} ${now.getDate()}`;
}
