// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

// jsdom does not implement the native modal/top-layer; Chromium tests verify it.
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function () { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function () { this.removeAttribute('open'); } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const props = { open: true, title: 'Hapus fixture?', message: 'Data contoh akan dihapus.', onCancel: vi.fn(), onConfirm: vi.fn() };

it('names/describes the modal and initially focuses the safe action', () => {
  render(<ConfirmDialog {...props} />);
  const dialog = screen.getByRole('alertdialog', { name: 'Hapus fixture?' });
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(document.getElementById(dialog.getAttribute('aria-describedby')!)!.textContent).toBe(props.message);
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Batal' }));
});
it('cancel events request dismissal, while busy prevents Escape and both actions', () => {
  const cancel = vi.fn(), confirm = vi.fn();
  const view = render(<ConfirmDialog {...props} onCancel={cancel} onConfirm={confirm} />);
  fireEvent(screen.getByRole('alertdialog'), new Event('cancel', { cancelable: true }));
  expect(cancel).toHaveBeenCalledTimes(1);
  view.rerender(<ConfirmDialog {...props} busy onCancel={cancel} onConfirm={confirm} />);
  fireEvent(screen.getByRole('alertdialog'), new Event('cancel', { cancelable: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Lanjutkan' }));
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(confirm).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(screen.getByRole('alertdialog'));
});
it('closing restores the trigger and removes the native modal state', () => {
  const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus();
  const view = render(<ConfirmDialog {...props} />);
  const dialog = screen.getByRole('alertdialog');
  view.rerender(<ConfirmDialog {...props} open={false} />);
  expect(dialog.hasAttribute('open')).toBe(false);
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
});
