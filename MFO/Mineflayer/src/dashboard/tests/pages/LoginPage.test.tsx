import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../src/auth/AuthContext.js';
import { LoginPage } from '../../src/pages/LoginPage.js';
import { renderWithMantine } from '../test-utils.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderLoginPage() {
  return renderWithMantine(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('renders username, password fields and a submit button', () => {
    renderLoginPage();

    expect(screen.getByLabelText(/Username/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/)).toBeInTheDocument();
    expect(screen.getByText('Log in')).toBeInTheDocument();
  });

  it('shows an error message when login fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ error: 'Invalid credentials' }, 401)),
    );
    renderLoginPage();

    fireEvent.change(screen.getByLabelText(/Username/), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByText('Log in'));

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
  });

  it('hides the form once login succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ token: 'issued-token' })));
    renderLoginPage();

    fireEvent.change(screen.getByLabelText(/Username/), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'secret' } });
    fireEvent.click(screen.getByText('Log in'));

    await waitFor(() => {
      expect(screen.queryByLabelText(/Username/)).not.toBeInTheDocument();
    });
  });
});
