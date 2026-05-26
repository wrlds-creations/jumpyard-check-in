import { PaymentProvider } from './payment-provider';
import { PaymentProviders, PaymentResult, StorageKeys } from './payment.model';
import { AdyenDropInStatus, AdyenErrorCodes, AdyenNotificationEvent, AdyenPaymentMethod, AdyenResult, AdyenStorageKeys } from './adyen.model';
import AdyenCheckout from '@adyen/adyen-web';
import { UrlHelper } from './url-helper.class';
export class AdyenCheckoutProvider extends PaymentProvider {
    constructor(config, actions) {
        super(config, actions);
        this.approvedCodes = ['Authorised', 'Pending', 'Received'];
        this.pendingCodes = ['Pending', 'Received'];
        this.failureCodes = ['Cancelled', 'Error', 'Refused'];
        this.config = config;
    }
    get supportRecurringBilling() {
        return true;
    }
    async setup(paymentRequest) {
        try {
            if (!paymentRequest.jwt) {
                this.$log.error('Payment data missing.');
                return;
            }
            this.storePaymentRequest(paymentRequest);
            const response = await this.createSession(paymentRequest);
            if (!response.isValid) {
                this.$log.info(this.formatError(response, 'Response is not valid'));
                return response.errorMessage;
            }
            return this.renderDropInComponent(response.session, paymentRequest);
        }
        catch (ex) {
            this.$log.error(this.formatError(ex, 'Setup failed'));
        }
    }
    hasRedirectResult() {
        const queryParams = UrlHelper.getSearchParams();
        return queryParams.has('redirectResult');
    }
    async handleRedirect(handlers) {
        const queryParams = UrlHelper.getSearchParams();
        const sessionId = queryParams.get('sessionId') || '';
        const redirectResult = queryParams.get('redirectResult') || '';
        const configuration = this.getDropInConfiguration({ id: sessionId }, handlers);
        const checkout = await AdyenCheckout(configuration);
        checkout.submitDetails({ details: { redirectResult } });
    }
    async getPaymentDetail(numberOfAttempts) {
        const payment = this.storage.get(StorageKeys.payment);
        const merchantReference = payment && payment.merchantReference;
        if (!merchantReference) {
            return undefined;
        }
        const detailFromStorage = this.getPaymentDetailFromStorage(payment);
        if (detailFromStorage) {
            return detailFromStorage;
        }
        const notification = await this.getPaymentNotification(merchantReference, numberOfAttempts || 5);
        if (!notification) {
            return undefined;
        }
        return {
            amount: this.getAmountFromCents(notification.amount.value),
            cardLast4Digits: notification.additionalData && notification.additionalData.cardSummary,
            paymentMethod: notification.paymentMethod
        };
    }
    async checkPaymentStatus(merchantReference, numberOfAttempts, errorCode) {
        try {
            const notification = await this.getPaymentNotification(merchantReference, numberOfAttempts || 5);
            const isAuthorisationNotification = notification && notification.eventCode === AdyenNotificationEvent.authorisation;
            if (!isAuthorisationNotification) {
                return this.unknownResult(errorCode);
            }
            return {
                result: notification.isSuccess ? PaymentResult.approved : PaymentResult.failed
            };
        }
        catch (ex) {
            this.$log.error(this.formatError(ex, 'Unable to check payment status'));
            return this.unknownResult(errorCode);
        }
    }
    async createSession(paymentRequest) {
        const request = {
            jwt: paymentRequest.jwt,
            hasRecurringBilling: paymentRequest.hasRecurringBilling,
            redirectUrl: paymentRequest.redirectUrl,
            browser: this.getBrowserInfo(),
            provider: PaymentProviders.adyen
        };
        request.unsupportedPaymentMethods = [];
        if (!this.canUseApplePay()) {
            request.unsupportedPaymentMethods.push(AdyenPaymentMethod.applepay);
        }
        const response = await this.post('payment/session', request);
        return response;
    }
    async renderDropInComponent(session, paymentRequest) {
        try {
            if (this.dropInComponent) {
                this.dropInComponent.unmount();
            }
            const options = this.getDropInOptions(paymentRequest);
            const configuration = this.getDropInConfiguration(session, paymentRequest.handlers);
            const checkout = await AdyenCheckout(configuration);
            this.dropInComponent = checkout.create('dropin', options).mount(`#${paymentRequest.paymentContainerDivId}`);
            this.storage.add(AdyenStorageKeys.sessionId, session.id);
        }
        catch (error) {
            this.$log.error(this.formatError(error, 'Render drop in component error'));
            return error;
        }
    }
    getDropInOptions(paymentRequest) {
        const handlers = paymentRequest.handlers;
        return {
            openFirstPaymentMethod: this.config.expandFirstMethod,
            showStoredPaymentMethods: paymentRequest.showStoredPaymentMethods,
            onReady: () => {
                if (handlers.onReady) {
                    handlers.onReady();
                }
            },
            onSelect: (paymentMethod) => {
                if (paymentMethod && paymentMethod.type) {
                    const data = {
                        type: paymentMethod.type,
                        icon: paymentMethod.icon,
                        provider: PaymentProviders.adyen
                    };
                    this.storage.add(StorageKeys.selectedPaymentMethod, data);
                    if (handlers.onSelect) {
                        handlers.onSelect(data);
                    }
                }
            }
        };
    }
    getEnvironment() {
        if (this.config.isTestEnvironment) {
            return 'test';
        }
        const countryCode = this.payment && this.payment.customer && this.payment.customer.countryCode;
        if (countryCode) {
            const auRegionCountryCodes = ['AU', 'HK', 'KR', 'NZ', 'PG', 'SG', 'TH'];
            const usaRegionCountryCodes = ['BH', 'CA', 'CO', 'DE', 'GB', 'NL', 'US'];
            if (auRegionCountryCodes.includes(countryCode)) {
                return 'live-au';
            }
            else if (usaRegionCountryCodes.includes(countryCode)) {
                return 'live-us';
            }
        }
        return 'live';
    }
    getDropInConfiguration(session, handlers) {
        return {
            environment: this.getEnvironment(),
            clientKey: this.config.clientKey,
            setStatusAutomatically: false,
            locale: this.getLocale(),
            translations: this.getTranslations(),
            session: {
                id: session.id,
                sessionData: session.data
            },
            paymentMethodsConfiguration: this.getPaymentMethodsConfiguration(),
            beforeSubmit: (data, component, actions) => {
                this.handleBeforeSubmit(component, data, actions, handlers).then((proceed) => {
                    if (!proceed) {
                        return;
                    }
                    if (handlers.onBeforeSubmit) {
                        handlers
                            .onBeforeSubmit()
                            .catch(() => actions.reject(data))
                            .then(() => actions.resolve(data));
                    }
                    else {
                        actions.resolve(data);
                    }
                });
            },
            onPaymentCompleted: (result, component) => {
                const paymentResult = this.getPaymentResult(result);
                if (this.pendingCodes.includes(result.resultCode)) {
                    this.handlePendingPayment(handlers, component, paymentResult);
                    return;
                }
                this.handlePaymentResult(handlers, component, paymentResult);
            },
            onCancel: (error, component) => {
                this.$log.warn(this.formatError(error, 'User has cancelled'));
                this.handlePaymentResult(handlers, component, this.getPaymentResult({ resultCode: AdyenResult.cancelled }));
            },
            onError: (error, component) => {
                const errorCode = this.getInterruptedPaymentAttemptErrorCode(error);
                if (errorCode) {
                    this.$log.info(this.formatError(error, `Handling network error ${errorCode}`));
                    this.checkPaymentStatus(this.payment.merchantReference, undefined, errorCode).then((paymentResult) => this.handlePaymentResult(handlers, component, paymentResult));
                }
                else {
                    this.$log.error(this.formatError(error, 'Error in the drop in configuration'));
                    this.handlePaymentResult(handlers, component, this.getPaymentResult({ resultCode: AdyenResult.error }));
                }
            }
        };
    }
    getLocale() {
        return this.payment && this.payment.customer ? this.payment.customer.locale : this.getBrowserInfo().locale;
    }
    getTranslations() {
        return {
            'en-AU': {
                zipCode: 'Postcode'
            },
            'en-CA': {
                zipCode: 'Postal code'
            },
            'en-GB': {
                zipCode: 'Postcode'
            },
            'en-IE': {
                zipCode: 'Postcode'
            },
            'en-NZ': {
                zipCode: 'Postcode'
            }
        };
    }
    getInterruptedPaymentAttemptErrorCode(error) {
        const unprocessedPayment = this.storage.get(StorageKeys.unprocessedPayment);
        const isInterruptedPaymentAttempt = !!unprocessedPayment && error && error.name === AdyenErrorCodes.networkError;
        if (!isInterruptedPaymentAttempt) {
            return undefined;
        }
        if (error.message === 'The provided session identifier or data is invalid.') {
            return AdyenErrorCodes.paymentAlreadyAttempted;
        }
        else if (error.message === 'ERROR: Invalid ClientKey') {
            this.$log.info(JSON.stringify(this.config));
        }
        return AdyenErrorCodes.networkError;
    }
    formatError(error, message) {
        if (error && error.name && error.message) {
            // JSON.stringify isn't capturing the entire error.  Simplifying the structure to see if that helps.
            error = {
                name: error.name,
                message: error.message
            };
        }
        return typeof error === 'string' ? error : message ? `${message} ${JSON.stringify(error)}` : JSON.stringify(error);
    }
    /**
     * Returns true if the submission can proceed
     */
    async handleBeforeSubmit(component, data, dropinActions, handlers) {
        component.setStatus(AdyenDropInStatus.loading);
        const handled = await this.handleExistingPaymentResult(component, data, dropinActions, handlers);
        if (handled) {
            return false;
        }
        this.storage.add(StorageKeys.unprocessedPayment, this.payment);
        this.storage.add(StorageKeys.attemptedPaymentRef, this.payment.merchantReference);
        if (!data || !data.paymentMethod || !data.paymentMethod.type) {
            this.$log.warn('Unable to handle paymentMethod during beforeSubmit', data);
            return true;
        }
        let selectedPaymentMethod = this.storage.get(StorageKeys.selectedPaymentMethod);
        if (!selectedPaymentMethod) {
            selectedPaymentMethod = { type: data.paymentMethod.brand || data.paymentMethod.type };
            this.storage.add(StorageKeys.selectedPaymentMethod, selectedPaymentMethod);
        }
        if (this.useDefaultPhsyicalAddress(data)) {
            data.billingAddress = this.config.address;
            data.deliveryAddress = this.config.address;
        }
        const hasRecurringBilling = this.paymentRequest && this.paymentRequest.hasRecurringBilling;
        if (!hasRecurringBilling && !this.supportsTokenisation(selectedPaymentMethod.type)) {
            data.storePaymentMethod = false;
            data.recurringProcessingModel = null;
            data.shopperReference = null;
        }
        return true;
    }
    /**
     * Returns true if a succcessul notification found and the result has been handled.
     */
    async handleExistingPaymentResult(component, data, dropinActions, handlers) {
        var _a;
        try {
            const attemptedPaymentReference = this.storage.get(StorageKeys.attemptedPaymentRef);
            if (!((_a = this.payment) === null || _a === void 0 ? void 0 : _a.amount) || attemptedPaymentReference != this.payment.merchantReference) {
                this.storage.remove(StorageKeys.attemptedPaymentRef);
                return false;
            }
            const notification = await this.getPaymentNotification(this.payment.merchantReference, 1);
            if (this.isAuthorisationNotification(notification) && notification.isSuccess) {
                dropinActions.reject(data);
                const paymentResult = {
                    provider: this.providerType,
                    result: PaymentResult.approved,
                    message: notification.reason,
                    rawResult: notification
                };
                this.handlePaymentResult(handlers, component, paymentResult);
                return true;
            }
        }
        catch (err) {
            this.$log.warn('Error checking notification before retrying payment', err);
        }
        return false;
    }
    getPaymentMethodsConfiguration() {
        return {
            hasHolderName: true,
            holderNameRequired: true,
            billingAddressRequired: this.config.captureBillingAddress,
            zip: {
                billingAddressRequired: true
            },
            card: this.getCardConfiguration(),
            paypal: this.getPaypalConfiguration(),
            applepay: this.getApplePayConfiguration(),
            paywithgoogle: this.getGooglePayConfiguration(AdyenPaymentMethod.paywithgoogle),
            googlepay: this.getGooglePayConfiguration(AdyenPaymentMethod.googlepay)
        };
    }
    getCardConfiguration() {
        return {
            hasHolderName: true,
            billingAddressRequired: true,
            billingAddressMode: this.config.captureBillingAddress ? 'full' : 'partial',
            onBrand: (data) => {
                const selectedPaymentMethod = {
                    type: data.brand || data.type,
                    icon: data.brandImageUrl,
                    provider: PaymentProviders.adyen
                };
                this.storage.add(StorageKeys.selectedPaymentMethod, selectedPaymentMethod);
            },
            onFieldValid: (data) => {
                if (data && data.fieldType === 'encryptedCardNumber') {
                    this.storage.remove(StorageKeys.paymentDetailCardLast4Digits);
                    if (data.endDigits) {
                        this.storage.add(StorageKeys.paymentDetailCardLast4Digits, data.endDigits);
                    }
                }
            }
        };
    }
    getPaypalConfiguration() {
        if (!this.allowPaymentMethod(AdyenPaymentMethod.paypal) || !this.payment) {
            return undefined;
        }
        return {
            amount: {
                currency: this.payment.currency,
                value: this.getAmountInCents(this.payment.amount)
            },
            intent: 'capture',
            countryCode: this.payment.customer.countryCode
        };
    }
    getApplePayConfiguration() {
        if (!this.allowPaymentMethod(AdyenPaymentMethod.applepay) || !this.payment) {
            return undefined;
        }
        const config = {
            amount: {
                currency: this.payment.currency,
                value: this.getAmountInCents(this.payment.amount)
            },
            countryCode: this.payment.customer.countryCode
        };
        if (this.isEmbedded()) {
            config.onValidateMerchant = (resolve, reject) => {
                return this.validateEmbeddedApplePayMerchant(resolve, reject);
            };
        }
        return config;
    }
    getGooglePayConfiguration(googlePaymentMethodId) {
        if (!this.allowPaymentMethod(googlePaymentMethodId) || !this.payment) {
            return undefined;
        }
        const isRollerDomain = window.location.hostname.includes('.roller.app');
        let merchantOrigin = undefined;
        if (isRollerDomain) {
            delete this.config.googlePayAuthJwt;
        }
        if (this.config.googlePayAuthJwt && googlePaymentMethodId === AdyenPaymentMethod.googlepay) {
            merchantOrigin = this.config.googlePayMerchantOrigin;
        }
        const googlePay = {
            configuration: {
                gatewayMerchantId: this.config.googlePayGatewayMerchantId,
                merchantName: this.config.googlePayMerchantName,
                merchantIdentifier: this.config.isTestEnvironment ? undefined : this.config.googlePayMerchantId,
                merchantId: this.config.isTestEnvironment ? undefined : this.config.googlePayMerchantId,
                authJwt: this.config.googlePayAuthJwt,
                merchantOrigin
            },
            amount: {
                currency: this.payment.currency,
                value: this.getAmountInCents(this.payment.amount)
            },
            environment: this.config.isTestEnvironment ? 'TEST' : 'PRODUCTION'
        };
        return googlePay;
    }
    allowPaymentMethod(paymentMethodType) {
        if (this.isEmbedded() && !this.supportsEmbedded(paymentMethodType)) {
            return false;
        }
        const paymentMethod = this.config.paymentMethods.find((pm) => pm.type === paymentMethodType);
        if (paymentMethod) {
            const hasRecurringBilling = this.paymentRequest && this.paymentRequest.hasRecurringBilling;
            return !hasRecurringBilling || !!this.supportsRecurring(paymentMethodType);
        }
        return false;
    }
    resetDropInComponent(component) {
        this.clearPaymentDetailStorage();
        if (component && component.setStatus) {
            component.setStatus(AdyenDropInStatus.ready);
        }
    }
    getPaymentResult(result) {
        const resultCode = result.resultCode;
        return {
            result: this.approvedCodes.includes(resultCode)
                ? PaymentResult.approved
                : this.failureCodes.includes(resultCode)
                    ? PaymentResult.failed
                    : PaymentResult.unknown,
            message: this.getResultCodeMessage(resultCode),
            rawResult: result,
            provider: PaymentProviders.adyen
        };
    }
    getResultCodeMessage(resultCode) {
        switch (resultCode) {
            case AdyenResult.received:
            case AdyenResult.pending:
                return AdyenResult.pending;
            default:
                return resultCode;
        }
    }
    handlePendingPayment(handlers, dropIn, paymentResult, attemptNumber) {
        const maxNumberOfAttempts = 5;
        attemptNumber = (attemptNumber || 0) + 1;
        if (attemptNumber > maxNumberOfAttempts) {
            this.$log.info('Could not find another event after initial pending result');
            this.handlePaymentResult(handlers, dropIn, paymentResult);
            return;
        }
        else if (!this.payment || !this.payment.merchantReference) {
            this.$log.warn('No merchant reference available', this.payment);
            this.handlePaymentResult(handlers, dropIn, paymentResult);
            return;
        }
        else if (attemptNumber === 1) {
            if (handlers.onPaymentReceived) {
                handlers.onPaymentReceived();
            }
        }
        this.checkPaymentNotifications(handlers, dropIn, paymentResult, attemptNumber);
    }
    isAuthorisationNotification(notification) {
        return (notification === null || notification === void 0 ? void 0 : notification.eventCode) === AdyenNotificationEvent.authorisation;
    }
    checkPaymentNotifications(handlers, dropIn, paymentResult, attemptNumber) {
        const merchantReference = this.payment.merchantReference;
        setTimeout(() => {
            this.getPaymentNotification(merchantReference).then((notification) => {
                const isAuthorisationNotification = this.isAuthorisationNotification(notification);
                if (!isAuthorisationNotification) {
                    this.$log.info(`No notification available for ${merchantReference}`);
                    this.handlePendingPayment(handlers, dropIn, paymentResult, attemptNumber);
                    return;
                }
                this.$log.info(`Using payment notification result ${notification.reason}`);
                const webhookPaymentResult = {
                    result: notification.isSuccess ? PaymentResult.approved : PaymentResult.failed,
                    message: notification.reason,
                    rawResult: notification
                };
                this.handlePaymentResult(handlers, dropIn, webhookPaymentResult);
            }, () => this.handlePaymentResult(handlers, dropIn, paymentResult));
        }, 1000);
    }
    handlePaymentResult(handlers, dropIn, paymentResult) {
        this.storage.remove(StorageKeys.unprocessedPayment);
        if (paymentResult.result !== PaymentResult.approved) {
            this.resetDropInComponent(dropIn);
        }
        handlers.onPaymentCompleted(paymentResult);
    }
    async getPaymentNotification(merchantReference, numberOfAttempts) {
        const maxAttempts = 10;
        const sessionId = this.storage.get(AdyenStorageKeys.sessionId) || '';
        numberOfAttempts = Math.min(numberOfAttempts || 1, maxAttempts);
        for (let i = 0; i < numberOfAttempts; i++) {
            try {
                const notification = await this.get('payment/webhook/adyen/payment-notification', { merchantReference, sessionId });
                if (notification) {
                    return notification;
                }
            }
            catch (error) {
                this.$log.warn(`Checking payment status.  Attempt ${i + 1} failed`, error);
            }
            await this.delay(1000);
        }
        return undefined;
    }
    unknownResult(errorCode) {
        return {
            result: PaymentResult.unknown,
            provider: PaymentProviders.adyen,
            message: errorCode
        };
    }
    supportsRecurring(paymentMethod) {
        const whitelist = [AdyenPaymentMethod.cards, AdyenPaymentMethod.ideal, AdyenPaymentMethod.sepadirectdebit];
        return whitelist.includes(paymentMethod.toLowerCase());
    }
    supportsTokenisation(paymentMethod) {
        const paymentMethodLowered = paymentMethod.toLowerCase();
        const whitelist = [
            'visa',
            'mastercard',
            'mc',
            'amex',
            'bcmc',
            'cartebancaire',
            'cup',
            'diners',
            'jcb',
            'carnet',
            'elo',
            'hipercard',
            'troy',
            'ach',
            'sepadirectdebit',
            'directdebit_gb',
            'giropay',
            'ideal',
            'directebanking',
            'applepay',
            'gcash',
            'grabpay',
            'paywithgoogle',
            'paytm',
            'qiwiwallet',
            'vipps',
            'paypal',
            'amazonpay',
            'eftpos',
            AdyenPaymentMethod.googlepay
        ];
        const whitelistedPrefixes = ['mc'];
        return (whitelist.includes(paymentMethodLowered) ||
            whitelistedPrefixes.some((s) => paymentMethodLowered.startsWith(s)) ||
            whitelist.filter((s) => paymentMethodLowered.includes(s)).length === 1);
    }
    supportsEmbedded(paymentMethod) {
        const blacklist = [];
        if (!this.canUseApplePay()) {
            blacklist.push(AdyenPaymentMethod.applepay);
        }
        return !blacklist.includes(paymentMethod.toLowerCase());
    }
    getPaymentDetailFromStorage(payment) {
        const paymentMethod = this.storage.get(StorageKeys.selectedPaymentMethod);
        if (!paymentMethod) {
            return null;
        }
        return {
            amount: payment.amount,
            cardLast4Digits: this.storage.get(StorageKeys.paymentDetailCardLast4Digits),
            paymentMethod: paymentMethod.type,
            paymentMethodImageUrl: paymentMethod.icon
        };
    }
    clearPaymentDetailStorage() {
        this.storage.remove(StorageKeys.selectedPaymentMethod);
        this.storage.remove(StorageKeys.paymentDetailCardLast4Digits);
    }
    useDefaultPhsyicalAddress(data) {
        const paymentMethods = [
            AdyenPaymentMethod.zip,
            AdyenPaymentMethod.klarna,
            AdyenPaymentMethod.klarna_account,
            AdyenPaymentMethod.klarna_paynow,
            AdyenPaymentMethod.afterpaytouch,
            AdyenPaymentMethod.clearpay,
            AdyenPaymentMethod.affirm,
            AdyenPaymentMethod.facilypay,
            AdyenPaymentMethod.ratepay,
            AdyenPaymentMethod.paybright
        ];
        if (!this.config.address || (data.billingAddress && data.deliveryAddress)) {
            return false;
        }
        return paymentMethods.includes(data.paymentMethod.type.toLocaleLowerCase());
    }
    canUseApplePay() {
        var _a;
        try {
            if (!window.ApplePaySession || !ApplePaySession.canMakePayments()) {
                return false;
            }
            if (this.isEmbedded() &&
                (!((_a = this.paymentRequest) === null || _a === void 0 ? void 0 : _a.embeddedParentOrigin) || !new URL(this.paymentRequest.embeddedParentOrigin).hostname)) {
                return false;
            }
        }
        catch (_b) {
            return false;
        }
        return true;
    }
    validateEmbeddedApplePayMerchant(resolve, reject) {
        var _a, _b, _c, _d;
        const applePayPaymentMethod = (_b = (_a = this.dropInComponent.props) === null || _a === void 0 ? void 0 : _a.paymentMethods) === null || _b === void 0 ? void 0 : _b.find((m) => m.type === AdyenPaymentMethod.applepay);
        if (!applePayPaymentMethod) {
            reject('Invalid ApplePay configuration');
            return;
        }
        const merchantId = (_c = applePayPaymentMethod.configuration) === null || _c === void 0 ? void 0 : _c.merchantId;
        // Extract applePay merchantName
        const merchantName = (_d = applePayPaymentMethod.configuration) === null || _d === void 0 ? void 0 : _d.merchantName;
        const domainName = new URL(this.paymentRequest.embeddedParentOrigin).hostname;
        // The initiative value is used to determine the type of Apple Pay transaction.
        const initiative = 'web';
        const path = `${this.dropInComponent.props.loadingContext}v1/applePay/sessions?clientKey=${this.config.clientKey}`;
        const request = {
            displayName: merchantName,
            domainName,
            initiative,
            merchantIdentifier: merchantId
        };
        return fetch(path, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/plain, */*'
            },
            body: JSON.stringify(request)
        })
            .then((response) => {
            return response.json();
        })
            .then((response) => {
            // Decode base64 encoded response.data
            const decodedResponse = atob(response.data);
            // parse the string back to JSON
            const session = JSON.parse(decodedResponse);
            // continue the payment process using the session
            resolve(session);
        })
            .catch((error) => {
            reject(error);
        });
    }
}
