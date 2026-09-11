// ============================================================
//  CarePoint — end-to-end UI flow tests (jsdom + Testing Library)
//  Clicks through the real app shell: login → shop → cart →
//  checkout → place order, plus wishlist + category filters.
//  Supabase is mocked off so persistence never hits the network.
// ============================================================
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';

vi.mock('./supabase', () => ({ supabaseEnabled: false, supabase: null }));

function startAt(path: string) {
  window.history.pushState({}, '', path);
}

async function loginAsCustomer() {
  render(<App />);
  // Wait for the auth spinner to resolve and the login form to render
  const email = await screen.findByPlaceholderText('you@example.com');
  fireEvent.change(email, { target: { value: 'juan@example.com' } });
  fireEvent.change(await screen.findByPlaceholderText('••••••••'), { target: { value: 'demo123' } });
  fireEvent.submit(email.closest('form')!);
  // Customer home renders the private topbar with a Cart button
  await screen.findByRole('button', { name: 'Cart' });
}

describe('customer purchase flow', () => {
  test('place an order lands on /orders with the new order listed', async () => {
    startAt('/auth');
    await loginAsCustomer();

    // Add an OTC medicine from the shop
    const card = screen.getByText('Paracetamol 500mg (20 tabs)').closest('.cp-med-card') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cart' }));

    // Satchel → Checkout
    await screen.findByRole('button', { name: 'Checkout' });
    fireEvent.click(screen.getByRole('button', { name: 'Checkout' }));

    await screen.findByRole('button', { name: 'Place Order' });
    fireEvent.click(screen.getByRole('button', { name: /Cash on Delivery/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Place Order' }));

    // The order is created + persisted, then we should land on My Orders
    // (regression: previously bounced back to an empty /cart).
    await screen.findByText('My Orders', undefined, { timeout: 6000 });
    expect(window.location.pathname).toBe('/orders');
    expect(screen.getByText('#1003')).toBeInTheDocument();

    // Open the new order — the detail must include the item and payment method
    const viewButtons = screen.getAllByRole('button', { name: 'View' });
    fireEvent.click(viewButtons[0]);
    await screen.findByText('Order #1003');
    expect(screen.getByText('Paracetamol 500mg (20 tabs)')).toBeInTheDocument();
    expect(screen.getByText(/Cash on Delivery/)).toBeInTheDocument();
  });
});

describe('wishlist', () => {
  test('heart toggles a medicine in and out of the wishlist', async () => {
    startAt('/auth');
    await loginAsCustomer();

    const card = screen.getByText('Vitamin C 500mg (60 tabs)').closest('.cp-med-card') as HTMLElement;
    const wish = within(card).getByRole('button', { pressed: true });
    expect(wish).toHaveTextContent('❤️');

    fireEvent.click(wish);
    screen.getByText('Removed from wishlist.');

    const off = within(card).getByRole('button', { pressed: false });
    fireEvent.click(off);
    screen.getByText('Saved to wishlist.');
  });
});

describe('catalog filters', () => {
  test('Prescription chip narrows results to Rx-only medicines', async () => {
    startAt('/auth');
    await loginAsCustomer();

    const chip = screen.getAllByRole('button', { name: /Prescription/ })
      .find((b) => b.classList.contains('cp-chip')) as HTMLButtonElement;
    fireEvent.click(chip);
    expect(screen.getByText('Amoxicillin 500mg (21 caps)')).toBeInTheDocument();
    expect(screen.queryByText('Paracetamol 500mg (20 tabs)')).not.toBeInTheDocument();
  });
});

describe('guest landing', () => {
  test('public home loads and Browse opens the catalog', async () => {
    startAt('/');
    render(<App />);

    const brand = await screen.findByText('CarePoint');
    expect(brand).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    await screen.findByText(/Browse everything in stock/);
    expect(window.location.pathname).toBe('/catalog');
  });
});