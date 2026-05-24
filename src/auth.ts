import { sb } from './config';

export async function doLogin(onSuccess: () => void): Promise<void> {
  const email = (document.getElementById('authEmail') as HTMLInputElement).value.trim();
  const pass = (document.getElementById('authPass') as HTMLInputElement).value;
  const errEl = document.getElementById('authError')!;
  const okEl = document.getElementById('authOk');
  const btn = document.getElementById('authBtn') as HTMLButtonElement;
  errEl.textContent = '';
  if (okEl) okEl.textContent = '';
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

export function inRecoveryFlow(): boolean {
  return window.location.hash.includes('type=recovery');
}

export function setupRecoveryDetection(showReset: () => void): void {
  // Belt-and-suspenders: PASSWORD_RECOVERY can fire before our hash check runs.
  sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY' || inRecoveryFlow()) {
      showReset();
    }
  });
}

export async function doForgotPassword(e?: Event): Promise<void> {
  if (e && e.preventDefault) e.preventDefault();
  const email = (document.getElementById('authEmail') as HTMLInputElement).value.trim();
  const errEl = document.getElementById('authError')!;
  const okEl = document.getElementById('authOk')!;
  errEl.textContent = '';
  okEl.textContent = '';
  if (!email) {
    errEl.textContent = 'Enter your email above first, then tap Forgot.';
    return;
  }
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });
  if (error) {
    errEl.textContent = error.message;
    return;
  }
  okEl.textContent = 'Reset link sent. Check your email (also Spam) and tap the link.';
}

export async function doSetNewPassword(onSuccess: () => void): Promise<void> {
  const p1 = (document.getElementById('resetPass') as HTMLInputElement).value;
  const p2 = (document.getElementById('resetPass2') as HTMLInputElement).value;
  const errEl = document.getElementById('resetError')!;
  const btn = document.getElementById('resetBtn') as HTMLButtonElement;
  errEl.textContent = '';
  if (!p1 || p1.length < 6) {
    errEl.textContent = 'Password must be at least 6 characters.';
    return;
  }
  if (p1 !== p2) {
    errEl.textContent = 'Passwords do not match.';
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Saving...';
  const { error } = await sb.auth.updateUser({ password: p1 });
  btn.disabled = false;
  btn.textContent = 'Save & log in';
  if (error) {
    errEl.textContent = error.message;
    return;
  }
  // Clear the recovery fragment so a refresh doesn't bounce back here.
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  const rs = document.getElementById('resetScreen');
  if (rs) rs.style.display = 'none';
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
