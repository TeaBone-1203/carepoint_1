// ============================================================
//  CarePoint — role & brand helper tests
// ============================================================
import { describe, it, expect } from 'vitest';
import { DB } from './db';
import {
  medBrand, brandList, roleLabel, isPharmacyAdmin,
  pharmacyManagers, pharmacyTeam, CATEGORIES,
} from './helpers';

describe('medBrand', () => {
  it('prefers the explicit brand field', () => {
    expect(medBrand({ brand: 'Wellness Labs', specs: { Manufacturer: 'Other Co' } }))
      .toBe('Wellness Labs');
  });

  it('falls back to spec Manufacturer', () => {
    expect(medBrand({ specs: { Manufacturer: 'Sunrise Labs' } })).toBe('Sunrise Labs');
  });

  it('falls back to "Generic" when nothing present', () => {
    expect(medBrand({})).toBe('Generic');
  });
});

describe('roleLabel', () => {
  it('labels every role and unknowns', () => {
    expect(roleLabel('siteAdmin')).toBe('Site Admin');
    expect(roleLabel('pharmacyAdmin')).toBe('Pharmacy Admin');
    expect(roleLabel('staff')).toBe('Staff');
    expect(roleLabel('customer')).toBe('Customer');
    expect(roleLabel('whatever')).toBe('Unknown');
    expect(roleLabel(null)).toBe('Unknown');
  });
});

describe('isPharmacyAdmin', () => {
  it('is true only for pharmacy admins', () => {
    expect(isPharmacyAdmin({ role: 'pharmacyAdmin' })).toBe(true);
    expect(isPharmacyAdmin({ role: 'staff' })).toBe(false);
    expect(isPharmacyAdmin({})).toBe(false);
    expect(isPharmacyAdmin(undefined)).toBe(false);
  });
});

describe('pharmacy team helpers', () => {
  it('separates pharmacy admins from regular staff of the same pharmacy', () => {
    for (const s of DB.staff) {
      if (s.id === 's1') {
        expect(pharmacyManagers(s.pharmacyId).some((x) => x.id === 's1')).toBe(true);
        expect(pharmacyTeam(s.pharmacyId).some((x) => x.id === 's1')).toBe(false);
      }
    }
    expect(pharmacyManagers('p1').some((s) => s.role === 'pharmacyAdmin')).toBe(true);
    expect(pharmacyTeam('p1').every((s) => (s.role ?? 'staff') === 'staff')).toBe(true);
  });
});

describe('brandList', () => {
  it('returns sorted, de-duplicated, non-generic brands from the storefront', () => {
    const brands = brandList();
    expect(brands.every((b) => b !== 'Generic')).toBe(true);
    expect(new Set(brands).size).toBe(brands.length);
    expect([...brands]).toEqual([...brands].sort((a, b) => a.localeCompare(b)));
  });
});

describe('CATEGORIES', () => {
  it('contains the default storefront categories', () => {
    expect(CATEGORIES).toContain('Pain Relief');
    expect(CATEGORIES.length).toBeGreaterThan(0);
  });
});