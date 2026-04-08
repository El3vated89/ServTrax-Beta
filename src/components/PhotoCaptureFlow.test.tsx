import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PhotoCaptureFlow from './PhotoCaptureFlow';

const {
  compressImage,
  addVerification,
  subscribeToJobs,
  subscribeToCustomers,
} = vi.hoisted(() => ({
  compressImage: vi.fn(),
  addVerification: vi.fn(),
  subscribeToJobs: vi.fn(),
  subscribeToCustomers: vi.fn(),
}));

vi.mock('../utils/imageCompression', () => ({
  compressImage,
}));

vi.mock('../services/verificationService', () => ({
  verificationService: {
    addVerification,
  },
}));

vi.mock('../services/jobService', () => ({
  jobService: {
    subscribeToJobs,
  },
}));

vi.mock('../services/customerService', () => ({
  customerService: {
    subscribeToCustomers,
  },
}));

describe('PhotoCaptureFlow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    compressImage.mockReset();
    addVerification.mockReset();
    subscribeToJobs.mockReset();
    subscribeToCustomers.mockReset();

    subscribeToJobs.mockImplementation((callback) => {
      callback([]);
      return () => {};
    });
    subscribeToCustomers.mockImplementation((callback) => {
      callback([{ id: 'customer-1', name: 'Acme Lawn' }]);
      return () => {};
    });
    compressImage.mockResolvedValue({
      dataUrl: 'data:image/jpeg;base64,abc123',
      size: 1024,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears saving state and shows an explicit error when the photo save times out', async () => {
    addVerification.mockImplementation(() => new Promise(() => {}));
    const onClose = vi.fn();

    const { container } = render(<PhotoCaptureFlow onClose={onClose} />);

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();

    fireEvent.change(fileInput, {
      target: {
        files: [new File(['image-bytes'], 'proof.jpg', { type: 'image/jpeg' })],
      },
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(compressImage).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /assign to client/i }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'customer-1' } });
    fireEvent.click(screen.getByRole('button', { name: /save photo/i }));

    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
    expect(container.querySelector('.flex-1.overflow-y-auto')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(25001);
      await Promise.resolve();
    });

    expect(screen.getByText('Photo save took too long and was stopped. Please try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save photo/i })).toBeEnabled();
    expect(onClose).not.toHaveBeenCalled();
  }, 15000);
});
