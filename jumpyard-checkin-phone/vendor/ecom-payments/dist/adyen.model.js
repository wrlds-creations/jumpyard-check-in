class AdyenResult {
}
AdyenResult.authenticationFinished = 'AuthenticationFinished';
AdyenResult.transactionStatus = 'AuthenticationNotRequired';
AdyenResult.authorised = 'Authorised';
AdyenResult.pending = 'Pending';
AdyenResult.presentToShopper = 'PresentToShopper';
AdyenResult.received = 'Received';
AdyenResult.cancelled = 'Cancelled';
AdyenResult.error = 'Error';
AdyenResult.refused = 'Refused';
export { AdyenResult };
class AdyenNotificationEvent {
}
AdyenNotificationEvent.authorisation = 'AUTHORISATION';
AdyenNotificationEvent.pending = 'PENDING';
export { AdyenNotificationEvent };
class AdyenDropInStatus {
}
AdyenDropInStatus.ready = 'ready';
AdyenDropInStatus.loading = 'loading';
export { AdyenDropInStatus };
class AdyenStorageKeys {
}
AdyenStorageKeys.sessionId = 'ecom-payments:session-id';
export { AdyenStorageKeys };
class AdyenPaymentMethod {
}
AdyenPaymentMethod.cards = 'scheme';
AdyenPaymentMethod.ideal = 'ideal';
AdyenPaymentMethod.sepadirectdebit = 'sepadirectdebit';
AdyenPaymentMethod.paywithgoogle = 'paywithgoogle';
AdyenPaymentMethod.googlepay = 'googlepay';
AdyenPaymentMethod.paypal = 'paypal';
AdyenPaymentMethod.applepay = 'applepay';
AdyenPaymentMethod.zip = 'zip';
AdyenPaymentMethod.maestro = 'maestro';
AdyenPaymentMethod.klarna = 'klarna';
AdyenPaymentMethod.klarna_account = 'klarna_account';
AdyenPaymentMethod.klarna_paynow = 'klarna_paynow';
AdyenPaymentMethod.afterpaytouch = 'afterpaytouch';
AdyenPaymentMethod.clearpay = 'clearpay';
AdyenPaymentMethod.affirm = 'affirm';
AdyenPaymentMethod.facilypay = 'facilypay';
AdyenPaymentMethod.ratepay = 'ratepay';
AdyenPaymentMethod.paybright = 'paybright';
export { AdyenPaymentMethod };
class AdyenErrorCodes {
}
AdyenErrorCodes.networkError = 'NETWORK_ERROR';
AdyenErrorCodes.paymentAlreadyAttempted = 'PAYMENT_ALREADY_ATTEMPTED';
export { AdyenErrorCodes };
