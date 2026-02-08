'use client';

import { useCallback, useMemo, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const TOKEN_KEY = 'accessToken';

export const usernameMinLength = 4;
export const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z]).+$/;

export interface SignInPayload {
  username: string;
  password: string;
}

export interface SignUpPayload extends SignInPayload {
  email: string;
}

interface AuthResult {
  ok: boolean;
  message?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readTokenFromStorage() {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage.getItem(TOKEN_KEY);
}

function writeTokenToStorage(token: string) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(TOKEN_KEY, token);
  }
}

function removeTokenFromStorage() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function getMessage(body: unknown, fallback: string) {
  if (typeof body === 'string' && body.length > 0) {
    return body;
  }

  if (isRecord(body)) {
    const msg = body.message;
    if (typeof msg === 'string') {
      return msg;
    }
    if (Array.isArray(msg)) {
      return msg.join(', ');
    }
  }

  return fallback;
}

async function request(path: string, init: RequestInit) {
  const response = await fetch(`${API_URL}${path}`, init);
  const body = await parseResponseBody(response);

  if (!response.ok) {
    throw new Error(getMessage(body, `Request failed with status ${response.status}`));
  }

  return body;
}

export function validateUsername(username: string) {
  if (username.trim().length < usernameMinLength) {
    return `Username must be at least ${usernameMinLength} characters.`;
  }
  return undefined;
}

export function validatePassword(password: string) {
  if (!passwordPattern.test(password)) {
    return 'Password must include one uppercase, one lowercase, and one non-alphabetic character.';
  }
  return undefined;
}

export function validateEmail(email: string) {
  if (!/.+@.+\..+/.test(email.trim())) {
    return 'Please enter a valid email address.';
  }
  return undefined;
}

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => readTokenFromStorage());
  const [isLoading, setIsLoading] = useState(false);

  const isAuthenticated = useMemo(() => !!token, [token]);

  const signIn = useCallback(async (payload: SignInPayload): Promise<AuthResult> => {
    setIsLoading(true);
    try {
      const response = await request('/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!isRecord(response) || typeof response.accessToken !== 'string') {
        return { ok: false, message: 'Sign-in response is missing access token.' };
      }

      writeTokenToStorage(response.accessToken);
      setToken(response.accessToken);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign-in failed.';
      return { ok: false, message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signUp = useCallback(async (payload: SignUpPayload): Promise<AuthResult> => {
    setIsLoading(true);
    try {
      const response = await request('/auth/sign-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (typeof response === 'string') {
        return { ok: true, message: response };
      }

      return { ok: true, message: 'Account created successfully.' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign-up failed.';
      return { ok: false, message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    removeTokenFromStorage();
    setToken(null);
  }, []);

  const authFetch = useCallback(
    (path: string, init: RequestInit = {}) => {
      const currentToken = token ?? readTokenFromStorage();
      const headers = new Headers(init.headers);

      if (currentToken) {
        headers.set('Authorization', `Bearer ${currentToken}`);
      }

      return fetch(`${API_URL}${path}`, {
        ...init,
        headers,
      });
    },
    [token],
  );

  return {
    token,
    isAuthenticated,
    isLoading,
    signIn,
    signUp,
    logout,
    authFetch,
  };
}
