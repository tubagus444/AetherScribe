// Google Identity Services (GIS) token flow — tanpa dependensi firebase.

export interface GoogleUser {
  name: string;
  email: string;
  picture: string;
}

const SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';

let cachedAccessToken: string | null = null;
let cachedUser: GoogleUser | null = null;
let tokenExpiresAt: number | null = null;

// Disimpan agar token bisa di-refresh diam-diam tanpa interaksi ulang (BK7).
let tokenClient: any = null;
let tokenClientId: string | null = null;

const loadGisScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return resolve();
    if ((window as any).google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', () => reject(new Error('Failed to load GIS script')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load GIS script'));
    document.head.appendChild(script);
  });
};

// Buat (atau pakai ulang) token client GIS untuk clientId tertentu.
const getTokenClient = (clientId: string): any => {
  if (tokenClient && tokenClientId === clientId) return tokenClient;
  tokenClientId = clientId;
  tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPE,
    callback: () => {}, // diganti per-request di requestToken()
  });
  return tokenClient;
};

// Minta access token. `prompt: ''` = diam-diam (tanpa UI) bila user sudah pernah
// memberi consent di sesi browser ini; `prompt: 'consent'` = paksa tampilkan dialog.
const requestToken = (prompt: '' | 'consent'): Promise<string> => {
  return new Promise((resolve, reject) => {
    const client = tokenClient;
    if (!client) {
      reject(new Error('NO_TOKEN_CLIENT'));
      return;
    }
    client.callback = (response: any) => {
      if (response.error !== undefined) {
        reject(response);
        return;
      }
      cachedAccessToken = response.access_token;
      // Tandai kedaluwarsa 5 menit sebelum batas asli agar aman.
      const expiresIn = response.expires_in ? parseInt(response.expires_in, 10) : 3600;
      tokenExpiresAt = Date.now() + (expiresIn - 300) * 1000;
      resolve(response.access_token);
    };
    try {
      client.requestAccessToken({ prompt });
    } catch (err) {
      reject(err);
    }
  });
};

export const initAuth = async (
  onAuthSuccess?: (user: GoogleUser, token: string) => void,
  onAuthFailure?: () => void
) => {
  if (cachedAccessToken && cachedUser) {
    if (onAuthSuccess) onAuthSuccess(cachedUser, cachedAccessToken);
  } else {
    if (onAuthFailure) onAuthFailure();
  }
};

export const googleSignIn = async (clientId: string): Promise<{ user: GoogleUser; accessToken: string } | null> => {
  if (!clientId || clientId.trim() === '') {
    alert("Silakan masukkan Google Client ID di Pengaturan terlebih dahulu.");
    return null;
  }

  await loadGisScript();

  const trimmedId = clientId.trim();
  getTokenClient(trimmedId);

  // Login interaktif pertama: paksa consent agar GIS mengingat persetujuan
  // (memungkinkan refresh diam-diam berikutnya).
  const accessToken = await requestToken('consent');

  // Ambil info user.
  try {
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (userInfoRes.ok) {
      const data = await userInfoRes.json();
      cachedUser = { name: data.name, email: data.email, picture: data.picture };
    } else {
      cachedUser = { name: 'Unknown', email: 'Connected', picture: '' };
    }
  } catch (e) {
    console.error("Failed to fetch user info", e);
    cachedUser = { name: 'Unknown', email: 'Connected', picture: '' };
  }

  return { user: cachedUser, accessToken };
};

export const getAccessToken = async (): Promise<string | null> => {
  // Belum login sama sekali.
  if (!cachedAccessToken) return null;

  // Token masih berlaku.
  if (!tokenExpiresAt || Date.now() <= tokenExpiresAt) {
    return cachedAccessToken;
  }

  // Kedaluwarsa: coba refresh diam-diam dulu (BK7) sebelum menyerah.
  if (tokenClient) {
    try {
      await loadGisScript();
      return await requestToken('');
    } catch (err) {
      console.warn('Refresh token Google diam-diam gagal, perlu login ulang:', err);
    }
  }

  clearGoogleSession();
  throw new Error("TOKEN_EXPIRED");
};

export function clearGoogleSession() {
  cachedAccessToken = null;
  cachedUser = null;
  tokenExpiresAt = null;
}

export const logout = async () => {
  if (cachedAccessToken) {
    try {
      if ((window as any).google?.accounts?.oauth2) {
         (window as any).google.accounts.oauth2.revoke(cachedAccessToken, () => {
             console.log("Access token revoked");
         });
      }
    } catch (e) {}
  }
  clearGoogleSession();
};
