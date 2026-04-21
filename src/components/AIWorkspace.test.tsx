import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AIWorkspace from './AIWorkspace';

describe('AIWorkspace', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the dedicated AI workspace header and quick actions', () => {
    render(
      <MemoryRouter initialEntries={['/ai']}>
        <Routes>
          <Route path="/ai" element={<AIWorkspace />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: /ai dispatcher/i })).toBeInTheDocument();
    expect(screen.getByText(/ask servtrax ai to help with jobs, customers, routes, quotes, and messages/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start my day/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /build route/i })).toBeInTheDocument();
  });

  it('supports sending a prompt and renders an assistant reply', async () => {
    render(
      <MemoryRouter initialEntries={['/ai']}>
        <Routes>
          <Route path="/ai" element={<AIWorkspace />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText(/ask servtrax ai to plan, draft, summarize, or prepare the next step/i), {
      target: { value: 'Start my day and summarize priorities.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    expect(screen.getByText('Start my day and summarize priorities.')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(301);
    });

    expect(screen.getByText(/review overdue jobs, check today’s route coverage/i)).toBeInTheDocument();
  });
});
