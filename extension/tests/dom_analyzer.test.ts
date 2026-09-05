import { describe, it, expect, beforeEach } from 'vitest';
import { analyzePage, resolveLabel, isVisible, isInteractable } from '../src/perception/dom_analyzer';

describe('Phase 1: DOM Analyzer & Perception Foundation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // Mock getBoundingClientRect for JSDOM
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

  describe('Label Resolution Strategies (8 Fallbacks)', () => {
    it('Strategy 1: resolves label via <label for="id">', () => {
      document.body.innerHTML = `
        <label for="user-email">Your Email Address *</label>
        <input id="user-email" type="email" placeholder="Ignored placeholder" />
      `;
      const input = document.getElementById('user-email') as HTMLInputElement;
      expect(resolveLabel(input)).toBe('Your Email Address');
    });

    it('Strategy 2: resolves label via aria-label', () => {
      document.body.innerHTML = `
        <input id="search-box" type="text" aria-label="Search Documentation" placeholder="Search..." />
      `;
      const input = document.getElementById('search-box') as HTMLInputElement;
      expect(resolveLabel(input)).toBe('Search Documentation');
    });

    it('Strategy 3: resolves label via aria-labelledby (single or multi-ID)', () => {
      document.body.innerHTML = `
        <span id="prefix">Date of</span>
        <span id="suffix">Birth</span>
        <input id="dob" type="date" aria-labelledby="prefix suffix" />
      `;
      const input = document.getElementById('dob') as HTMLInputElement;
      expect(resolveLabel(input)).toBe('Date of Birth');
    });

    it('Strategy 4: resolves label via parent <label> wrapper', () => {
      document.body.innerHTML = `
        <label>
          Gender Identification:
          <select id="gender">
            <option value="f">Female</option>
            <option value="m">Male</option>
          </select>
        </label>
      `;
      const select = document.getElementById('gender') as HTMLSelectElement;
      expect(resolveLabel(select)).toBe('Gender Identification');
    });

    it('Strategy 5: resolves label via placeholder when no label exists', () => {
      document.body.innerHTML = `
        <input id="city-field" type="text" placeholder="Enter City Name" />
      `;
      const input = document.getElementById('city-field') as HTMLInputElement;
      expect(resolveLabel(input)).toBe('Enter City Name');
    });

    it('Strategy 6: resolves label via previous sibling text element', () => {
      document.body.innerHTML = `
        <div>
          <span>Aadhaar Number</span>
          <input id="aadhaar-input" type="text" />
        </div>
      `;
      const input = document.getElementById('aadhaar-input') as HTMLInputElement;
      expect(resolveLabel(input)).toBe('Aadhaar Number');
    });

    it('Strategy 7: resolves label via title attribute', () => {
      document.body.innerHTML = `
        <input id="pan-field" type="text" title="10-digit PAN Card Number" />
      `;
      const input = document.getElementById('pan-field') as HTMLInputElement;
      expect(resolveLabel(input)).toBe('10-digit PAN Card Number');
    });

    it('Strategy 8: falls back to name or id attribute as last resort', () => {
      document.body.innerHTML = `
        <input id="unlabeled-field" name="account_identifier" type="text" />
      `;
      const input = document.getElementById('unlabeled-field') as HTMLInputElement;
      expect(resolveLabel(input)).toBe('account_identifier');
    });
  });

  describe('Security Invariant: Password Value Protection', () => {
    it('NEVER extracts password field value', () => {
      document.body.innerHTML = `
        <label for="pwd">Password</label>
        <input id="pwd" type="password" value="SuperSecretP@ssw0rd!" />
        <label for="uname">Username</label>
        <input id="uname" type="text" value="john_doe" />
      `;
      const result = analyzePage();
      const pwdElement = result.elements.find((el) => el.htmlType === 'password');
      const unameElement = result.elements.find((el) => el.htmlId === 'uname');

      expect(pwdElement).toBeDefined();
      expect(pwdElement?.value).toBeUndefined(); // HARD SECURITY INVARIANT
      expect(unameElement?.value).toBe('john_doe'); // Normal field returns value
    });
  });

  describe('Element Type & Interactability Checks', () => {
    it('detects buttons, links, inputs, selects, textareas', () => {
      document.body.innerHTML = `
        <form>
          <input type="text" id="t1" />
          <textarea id="t2"></textarea>
          <select id="s1"><option>1</option></select>
          <button id="b1" type="submit">Submit Form</button>
          <a id="a1" href="https://example.com">Go to Site</a>
          <div role="button" id="custom-btn" tabindex="0">Custom Role Button</div>
        </form>
      `;
      const result = analyzePage();
      const types = result.elements.map((el) => el.type);

      expect(types).toContain('input');
      expect(types).toContain('textarea');
      expect(types).toContain('select');
      expect(types).toContain('button');
      expect(types).toContain('link');
    });

    it('correctly marks disabled or aria-disabled elements as not interactable', () => {
      document.body.innerHTML = `
        <input id="active-input" type="text" />
        <input id="disabled-input" type="text" disabled />
        <button id="aria-disabled-btn" aria-disabled="true">Can't click</button>
      `;
      const active = document.getElementById('active-input') as HTMLElement;
      const disabled = document.getElementById('disabled-input') as HTMLElement;
      const ariaDisabled = document.getElementById('aria-disabled-btn') as HTMLElement;

      expect(isInteractable(active)).toBe(true);
      expect(isInteractable(disabled)).toBe(false);
      expect(isInteractable(ariaDisabled)).toBe(false);
    });

    it('skips aria-hidden elements from analysis', () => {
      document.body.innerHTML = `
        <div aria-hidden="true">
          <input id="hidden-input" type="text" />
        </div>
        <input id="visible-input" type="text" />
      `;
      const result = analyzePage();
      const ids = result.elements.map((el) => el.htmlId);

      expect(ids).not.toContain('hidden-input');
      expect(ids).toContain('visible-input');
    });
  });

  describe('Full Page Analysis Performance & Structure', () => {
    it('returns DOMAnalysisResult with stable IDs and execution under 100ms', () => {
      document.body.innerHTML = `
        <main>
          <h1>Registration Page</h1>
          <form id="reg-form">
            <label for="f1">First Name</label><input id="f1" type="text" />
            <label for="f2">Last Name</label><input id="f2" type="text" />
            <label for="f3">Email</label><input id="f3" type="email" />
            <label for="f4">Phone</label><input id="f4" type="tel" />
            <button type="submit">Submit</button>
          </form>
        </main>
      `;
      document.title = 'User Registration';

      const result = analyzePage();

      expect(result.elements.length).toBe(5);
      expect(result.pageTitle).toBe('User Registration');
      expect(result.analysisTime).toBeLessThan(100);
      expect(result.elements[0].id).toBe('e1');
      expect(result.elements[1].id).toBe('e2');
      expect(result.elements[2].id).toBe('e3');
      expect(result.elements[3].id).toBe('e4');
      expect(result.elements[4].id).toBe('e5');
    });
  });

  describe('Comprehensive Verification against test_form.html Fixture', () => {
    it('accurately resolves all fields and enforces security invariants on the fixture', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const fixturePath = path.resolve(__dirname, '../../tests/fixtures/test_form.html');
      const fixtureHtml = fs.readFileSync(fixturePath, 'utf-8');
      
      document.body.innerHTML = fixtureHtml;
      document.title = 'BIN-Vision Phase 1 Test — Registration Form';

      const result = analyzePage();

      // Should detect between 18 and 25 interactive elements
      expect(result.elements.length).toBeGreaterThanOrEqual(18);
      expect(result.analysisTime).toBeLessThan(250);

      // Strategy 1: <label for="id">
      const firstName = result.elements.find((e) => e.htmlId === 'first-name');
      const lastName = result.elements.find((e) => e.htmlId === 'last-name');
      const email = result.elements.find((e) => e.htmlId === 'email-address');
      const phone = result.elements.find((e) => e.htmlId === 'phone-number');

      expect(firstName?.label).toBe('First Name');
      expect(lastName?.label).toBe('Last Name');
      expect(email?.label).toBe('Email Address');
      expect(phone?.label).toBe('Phone Number');

      // Strategy 2: aria-label
      const username = result.elements.find((e) => e.htmlName === 'username');
      expect(username?.label).toBe('Username');

      // Strategy 3: aria-labelledby
      const dob = result.elements.find((e) => e.htmlName === 'dob');
      expect(dob?.label).toBe('Date of Birth');

      // Strategy 4: Parent <label>
      const gender = result.elements.find((e) => e.htmlName === 'gender');
      expect(gender?.label).toContain('Gender');

      // Strategy 5: placeholder
      const city = result.elements.find((e) => e.placeholder === 'City');
      const state = result.elements.find((e) => e.placeholder === 'State / Province');
      const pincode = result.elements.find((e) => e.placeholder === 'PIN Code');

      expect(city?.label).toBe('City');
      expect(state?.label).toBe('State / Province');
      expect(pincode?.label).toBe('PIN Code');

      // Strategy 6: Previous sibling
      const aadhaar = result.elements.find((e) => e.htmlName === 'aadhaar');
      expect(aadhaar?.label).toBe('Aadhaar Number');

      // Strategy 7: title attribute
      const pan = result.elements.find((e) => e.htmlName === 'pan');
      expect(pan?.label).toBe('PAN Card Number');

      // Security Invariant: Passwords
      const passwordFields = result.elements.filter((e) => e.htmlType === 'password');
      expect(passwordFields.length).toBeGreaterThanOrEqual(1);
      for (const pf of passwordFields) {
        expect(pf.value).toBeUndefined();
      }

      // Buttons and Links
      const submitBtn = result.elements.find((e) => e.type === 'button' && e.innerText?.includes('Register'));
      expect(submitBtn).toBeDefined();

      const links = result.elements.filter((e) => e.type === 'link');
      expect(links.length).toBeGreaterThanOrEqual(3);
    });
  });
});

