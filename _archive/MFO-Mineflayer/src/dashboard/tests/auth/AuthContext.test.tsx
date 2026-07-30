import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../../src/auth/AuthContext.js';

const STORAGE_KEY = 'mfo.token';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AuthProvider / useAuth', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('restores a token already in localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'existing-token');
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    expect(result.current.token).toBe('existing-token');
  });

  it('login stores the issued token and updates state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ token: 'issued-token' })));
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await act(async () => {
      await result.current.login('admin', 'password');
    });

    expect(result.current.token).toBe('issued-token');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('issued-token');
  });

  it('logout clears the token', () => {
    localStorage.setItem(STORAGE_KEY, 'existing-token');
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    act(() => {
      result.current.logout();
    });

    expect(result.current.token).toBeUndefined();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
