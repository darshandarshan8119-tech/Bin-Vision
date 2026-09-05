import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { buildUPR, buildUPRSync } from '../src/perception/unified_page_rep';

describe('Phase 2: Unified Page Representation (UPR) End-to-End', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // Mock getBoundingClientRect
    Element.prototype.getBoundingClientRect = function () {
      return {
        width: 100,
        height: 30,
        top: 10,
        left: 10,
        bottom: 40,
        right: 110,
        x: 10,
        y: 10,
        toJSON: () => {},
      };
    };
  });

  it('builds a complete, valid UPR on test_form.html with >= 90% semantic accuracy', async () => {
    const fixturePath = path.resolve(__dirname, '../../tests/fixtures/test_form.html');
    const fixtureHtml = fs.readFileSync(fixturePath, 'utf-8');

    document.body.innerHTML = fixtureHtml;
    document.title = 'BIN-Vision Phase 1 & 2 Test — Registration Form';

    const upr = await buildUPR();

    // 1. Structure
    expect(upr.page.title).toBe('BIN-Vision Phase 1 & 2 Test — Registration Form');
    expect(upr.page.snapshot_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(upr.perception_source).toEqual(['dom']);
    expect(upr.elements.length).toBeGreaterThanOrEqual(18);

    // 2. Forms detected
    expect(upr.forms.length).toBeGreaterThanOrEqual(1);
    const regForm = upr.forms.find(f => f.form_id === 'registration-form');
    expect(regForm).toBeDefined();
    expect(regForm?.semantic_purpose).toBe('REGISTRATION');
    expect(regForm?.method).toBe('POST');
    expect(regForm?.action).toBe('/register');

    // 3. Semantic classifications check
    const findBySem = (sem: string) => upr.elements.find(e => e.semantic === sem);

    expect(findBySem('FIRST_NAME')).toBeDefined();
    expect(findBySem('LAST_NAME')).toBeDefined();
    expect(findBySem('EMAIL')).toBeDefined();
    expect(findBySem('PHONE')).toBeDefined();
    expect(findBySem('USERNAME')).toBeDefined();
    expect(findBySem('DATE_OF_BIRTH')).toBeDefined();
    expect(findBySem('CITY')).toBeDefined();
    expect(findBySem('STATE')).toBeDefined();
    expect(findBySem('PINCODE')).toBeDefined();
    expect(findBySem('AADHAAR')).toBeDefined();
    expect(findBySem('PAN')).toBeDefined();
    expect(findBySem('PASSWORD')).toBeDefined();
    expect(findBySem('CONFIRM_PASSWORD')).toBeDefined();
    expect(findBySem('SUBMIT')).toBeDefined();
    expect(findBySem('NAV')).toBeDefined();
    expect(findBySem('SEARCH')).toBeDefined();

    // 4. PII flags check
    const email = findBySem('EMAIL');
    const phone = findBySem('PHONE');
    const aadhaar = findBySem('AADHAAR');
    const pan = findBySem('PAN');
    const city = findBySem('CITY');

    expect(email?.pii).toBe(true);
    expect(phone?.pii).toBe(true);
    expect(aadhaar?.pii).toBe(true);
    expect(pan?.pii).toBe(true);
    expect(city?.pii).toBe(false);

    // 5. Confidence check
    expect(upr.overall_confidence).toBeGreaterThanOrEqual(0.70);
  });

  it('buildUPRSync produces equivalent synchronous output', () => {
    document.body.innerHTML = `
      <form id="simple-login">
        <label for="usr">Email</label><input id="usr" type="email" />
        <label for="pwd">Password</label><input id="pwd" type="password" />
        <button type="submit">Log In</button>
      </form>
    `;

    const upr = buildUPRSync();
    expect(upr.forms.length).toBe(1);
    expect(upr.forms[0].semantic_purpose).toBe('LOGIN');
    expect(upr.overall_confidence).toBeGreaterThanOrEqual(0.70);
  });
});
