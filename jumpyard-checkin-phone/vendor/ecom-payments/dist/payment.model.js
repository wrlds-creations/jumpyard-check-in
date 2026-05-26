export var PaymentProviders;
(function (PaymentProviders) {
    PaymentProviders[PaymentProviders["adyen"] = 1] = "adyen";
    PaymentProviders[PaymentProviders["payPal"] = 2] = "payPal";
})(PaymentProviders || (PaymentProviders = {}));
export var PaymentResult;
(function (PaymentResult) {
    PaymentResult[PaymentResult["unknown"] = 0] = "unknown";
    PaymentResult[PaymentResult["approved"] = 1] = "approved";
    PaymentResult[PaymentResult["failed"] = 2] = "failed";
})(PaymentResult || (PaymentResult = {}));
class StorageKeys {
}
StorageKeys.payment = 'ecom-payments:payment';
StorageKeys.unprocessedPayment = 'ecom-payments:unprocessed-payment';
StorageKeys.attemptedPaymentRef = 'ecom-payments:attempted-payment-ref';
StorageKeys.selectedPaymentMethod = 'ecom-payments:selected-payment-method';
StorageKeys.paymentDetailCardLast4Digits = 'ecom-payments:card-last-4-digits';
StorageKeys.payPalOrderId = 'ecom-payments:paypal-order-id';
StorageKeys.payPalPaymentDetails = 'ecom-payments:paypal-details';
StorageKeys.checkoutSessionId = 'ecom-payments:checkout-session-id';
export { StorageKeys };
