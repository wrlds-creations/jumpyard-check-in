import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyPaymentCode,
  cleanPaymentCode,
  detectPaymentCodeKind,
  formatPaymentCodeForDisplay,
  isCompletePaymentCode,
} from './paymentCodeShape.ts';

test('a 10-digit number is a gift card, whatever type the guest chose', () => {
  for (const chosen of ['discount', 'member', 'giftCard']) {
    assert.deepEqual(classifyPaymentCode('4807213659', chosen), { kind: 'giftCard', value: '4807213659' });
  }
});

test('digits, a separator and digits are a membership number, stored with a hyphen', () => {
  assert.deepEqual(classifyPaymentCode('178204517-602318840', 'discount'), { kind: 'member', value: '178204517-602318840' });
  assert.deepEqual(classifyPaymentCode('5101046-21684450', 'giftCard'), { kind: 'member', value: '5101046-21684450' });
  for (const separator of ['–', '—', '‐', '−', '+', '/']) {
    assert.deepEqual(classifyPaymentCode(`178204517${separator}602318840`, 'discount'), { kind: 'member', value: '178204517-602318840' });
  }
});

test('copied numbers lose spaces, control characters and a leading #', () => {
  assert.equal(cleanPaymentCode('  #4807213659 \n'), '4807213659');
  assert.equal(cleanPaymentCode('4807 213 659'), '4807213659');
  assert.deepEqual(classifyPaymentCode('#5101046-21684450', 'discount'), { kind: 'member', value: '5101046-21684450' });
  assert.deepEqual(classifyPaymentCode('\t#4807 213 659\r', 'discount'), { kind: 'giftCard', value: '4807213659' });
});

test('anything else keeps the type the guest chose', () => {
  assert.deepEqual(classifyPaymentCode('SOMMAR25', 'discount'), { kind: 'discount', value: 'SOMMAR25' });
  assert.deepEqual(classifyPaymentCode('GC-12AB', 'giftCard'), { kind: 'giftCard', value: 'GC-12AB' });
  assert.deepEqual(classifyPaymentCode('123456789', 'member'), { kind: 'member', value: '123456789' });
  // A booking QR (9 digits), short groups and three groups are not gift cards or memberships.
  assert.equal(detectPaymentCodeKind('175666460'), null);
  assert.equal(detectPaymentCodeKind('12345-678901'), null);
  assert.equal(detectPaymentCodeKind('123456-123456-123456'), null);
  assert.equal(detectPaymentCodeKind('48072136590'), null);
  assert.equal(detectPaymentCodeKind('dbba266d-0951-4706-9adf-6c9d05edffbf'), null);
  assert.equal(classifyPaymentCode('  # ', 'discount'), null);
});

test('typed numbers are complete at 10 gift card digits or 9 + 9 membership digits', () => {
  assert.equal(isCompletePaymentCode('giftCard', '4807213659'), true);
  assert.equal(isCompletePaymentCode('giftCard', '480721365'), false);
  assert.equal(isCompletePaymentCode('member', '178204517-602318840'), true);
  assert.equal(isCompletePaymentCode('member', '178204517-60231884'), false);
  assert.equal(isCompletePaymentCode('discount', 'SOMMAR25'), false);
});

test('only a 10-digit gift card number is shown in groups', () => {
  assert.equal(formatPaymentCodeForDisplay('giftCard', '4807213659'), '4807 213 659');
  assert.equal(formatPaymentCodeForDisplay('giftCard', '480721'), '480721');
  assert.equal(formatPaymentCodeForDisplay('member', '178204517-602318840'), '178204517-602318840');
  assert.equal(formatPaymentCodeForDisplay('discount', '4807213659'), '4807213659');
});
