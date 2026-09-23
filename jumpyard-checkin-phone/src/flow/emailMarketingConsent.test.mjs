import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { pendingEmailMarketingConsent, EMAIL_MARKETING_COPY_VERSION } from './emailMarketingConsent.ts';
import backendConsent from '../../../infra/lambda/booking/email-marketing-consent.js';

const optInSource = () => fs.readFileSync(new URL('../components/EmailMarketingOptIn.tsx', import.meta.url), 'utf8');

test('unchecked serializes no instruction; checked contains a pending choice, never provider flags', () => {
  assert.equal(JSON.stringify({ emailMarketingConsent: pendingEmailMarketingConsent(false, 'sv') }), '{}');
  for (const locale of ['sv', 'en']) {
    assert.deepEqual(pendingEmailMarketingConsent(true, locale), { granted: true, copyVersion: EMAIL_MARKETING_COPY_VERSION, locale });
  }
});

test('pending consent is confined to draft, never customer or quote', () => {
  const client = fs.readFileSync(new URL('./cloudClient.ts', import.meta.url), 'utf8');
  const quote = client.slice(client.indexOf('export async function quoteNewBooking('), client.indexOf('export async function createDraftBooking('));
  assert.doesNotMatch(quote, /emailMarketingConsent|acceptMarketing/);
  assert.doesNotMatch(client.match(/export interface NewBookingCustomer \{[\s\S]*?\n\}/)[0], /[Mm]arketing/);
  const recovery = fs.readFileSync(new URL('./buyFlowRecovery.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(recovery, /emailMarketingChecked|emailMarketingConsent|acceptMarketing/);
});

test('accessible switch defaults and resets unchecked, and locks with payment identity', () => {
  const component = fs.readFileSync(new URL('../components/BuyTickets.tsx', import.meta.url), 'utf8');
  assert.match(component, /\[emailMarketingChecked, setEmailMarketingChecked\] = useState\(false\)/);
  assert.match(component, /setEmail\(savedContact.email\);[\s\S]*?setEmailMarketingChecked\(false\)/);
  assert.match(component, /onChange=\{\(event\) => \{\s*setEmailMarketingChecked\(false\);\s*updateContact\(setEmail/);
  assert.match(component, /<EmailMarketingOptIn\s+checked=\{emailMarketingChecked\}[\s\S]*?emailValid=\{isValidEmail\(email\)\}\s*disabled=\{checkoutLocked\}/);
  const optIn = optInSource();
  assert.match(optIn, /type="checkbox"\s*role="switch"\s*checked=\{checked\}[\s\S]*?disabled=\{disabled\}\s*aria-labelledby=[\s\S]*?aria-describedby=\{helpId\}/);
  // It can only be switched on for a complete address, and only from the guest's own toggle.
  assert.match(optIn, /if \(next && !emailValid\) \{[\s\S]*?return;\s*\}/);
  assert.equal(optIn.match(/onCheckedChange\(/g).length, 1);
  // Hidden until the guest opens the email field (or it already has content);
  // while hidden it cannot be focused or read.
  assert.match(component, /reveal=\{emailFocused \|\| email\.trim\(\)\.length > 0\}/);
  assert.match(optIn, /useState<Phase>\(reveal \? 'open' : 'hidden'\)/);
  assert.match(optIn, /inert=\{phase === 'hidden' \|\| phase === 'closing'\}/);
  const css = fs.readFileSync(new URL('../components/EmailMarketingOptIn.module.css', import.meta.url), 'utf8');
  assert.match(css, /\.reveal \{\s*display: grid;\s*grid-template-rows: 0fr;/);
  assert.match(css, /\.tile:has\(\.input:focus-visible\)/);
  assert.match(css, /min-height: 64px/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('compact visible wording and stored server evidence use the same version and copy', () => {
  assert.equal(EMAIL_MARKETING_COPY_VERSION, backendConsent.COPY_VERSION);
  const translations = fs.readFileSync(new URL('../context/LanguageContext.tsx', import.meta.url), 'utf8');
  for (const locale of ['sv', 'en']) {
    assert.ok(translations.includes(`emailMarketingLabel: '${backendConsent.COPY[locale]}'`));
  }
  // The larger "Ja tack!" lead is typography only: lead + body is the stored copy.
  const lead = new RegExp(optInSource().match(/const LEAD = \/(.+)\/u;/)[1], 'u');
  for (const locale of ['sv', 'en']) {
    const match = lead.exec(backendConsent.COPY[locale]);
    assert.equal(`${match[1]} ${match[2]}`, backendConsent.COPY[locale]);
  }
  assert.equal(EMAIL_MARKETING_COPY_VERSION, 'phone-email-2026-09-23-v3');
});

test('withdrawal help stays visible and linked to the optional choice', () => {
  const component = fs.readFileSync(new URL('../components/BuyTickets.tsx', import.meta.url), 'utf8');
  assert.match(component, /help: t.buy.emailMarketingHelp/);
  assert.match(component, /privacyUrl=\{EMAIL_MARKETING_PRIVACY_URL\}/);
  const help = optInSource().match(/<p id=\{helpId\}[\s\S]*?<\/p>/)[0];
  assert.match(help, /copy.help/);
  assert.match(help, /href=\{privacyUrl\}/);
  assert.doesNotMatch(help, /sr-only|\bhidden\b|opacity-0/);
});
