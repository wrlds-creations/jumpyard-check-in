import { loadScript } from '@paypal/paypal-js';
import { PaymentProviders, PaymentResult, StorageKeys } from '../payment.model';
import { PaymentProvider } from '../payment-provider';
import { PayPalFundingSources } from './paypal.model';
import { GuidService } from '../guid.service';
import { UrlHelper } from '../url-helper.class';
export class PayPal extends PaymentProvider {
    constructor(config, actions) {
        super(config, actions);
        this.approvedCodes = ['COMPLETED', 'PENDING'];
        this.pendingCodes = ['PENDING'];
        this.errorCodes = ['DECLINED', 'FAILED', 'REFUNDED'];
        this.cancelledCode = 'CANCELLED';
        this.guidService = new GuidService();
        this.payPalConfig = config;
    }
    get supportRecurringBilling() {
        return false;
    }
    async setup(paymentRequest) {
        let paypal;
        try {
            this.checkoutSessionId = paymentRequest.checkoutSessionId;
            this.payment = this.parseJtw(paymentRequest.jwt).payload;
            this.payment.paymentProvider = PaymentProviders.payPal;
            const disabledFundingSources = [
                PayPalFundingSources.advancedCardProcessing,
                PayPalFundingSources.bancontact,
                PayPalFundingSources.blik,
                PayPalFundingSources.esp,
                PayPalFundingSources.giroPay,
                PayPalFundingSources.iDeal,
                PayPalFundingSources.myBank,
                PayPalFundingSources.p24,
                PayPalFundingSources.sepaDirectDebit,
                PayPalFundingSources.sofort
            ];
            const enabledFundingSources = [];
            const minAmountForPayLater = 30;
            const maxAmountForPayLater = 2000;
            const isEligibleForPayLater = this.payment.amount >= minAmountForPayLater && this.payment.amount <= maxAmountForPayLater;
            if (this.payPalConfig.canUseVenmo === false) {
                disabledFundingSources.push(PayPalFundingSources.venmo);
            }
            else {
                enabledFundingSources.push(PayPalFundingSources.venmo);
            }
            if (this.payPalConfig.canUsePayLater === false) {
                disabledFundingSources.push(PayPalFundingSources.payLater);
            }
            else if (isEligibleForPayLater) {
                enabledFundingSources.push(PayPalFundingSources.payLater);
            }
            const payPalScriptOptions = {
                'client-id': this.payPalConfig.clientId,
                'merchant-id': this.payPalConfig.merchantId,
                currency: paymentRequest.currencyCode || this.payPalConfig.currency,
                'disable-funding': disabledFundingSources.join(','),
                'enable-funding': enabledFundingSources.join(','),
                'data-partner-attribution-id': this.payPalConfig.partnerCode,
                components: 'buttons,messages'
            };
            if (this.payPalConfig.isTestEnvironment) {
                try {
                    const searchParams = UrlHelper.getSearchParams();
                    const buyerCountry = searchParams.get('buyer-country');
                    if (buyerCountry) {
                        payPalScriptOptions['buyer-country'] = buyerCountry;
                    }
                }
                catch (err) {
                    console.warn('Error getting test buyer country', err);
                }
                // Only for testing env
                console.log('Script options', payPalScriptOptions);
            }
            paypal = await loadScript(payPalScriptOptions);
        }
        catch (error) {
            this.$log.error(`Failed to load the PayPal JS SDK script: ${JSON.stringify(error)}`);
            throw error;
        }
        try {
            if (!paypal) {
                this.$log.error('PayPal JS SDK not available');
                return;
            }
            paypal
                .Buttons({
                createOrder: () => {
                    return this.createOrder(paymentRequest);
                },
                onApprove: (data) => {
                    return this.handleApproval(paymentRequest, data);
                },
                onCancel: (data) => {
                    this.handlePaymentResult(paymentRequest.handlers, this.getResultForStatus(PaymentResult.failed, this.cancelledCode, data));
                },
                onError: (err) => {
                    this.handlePaymentResult(paymentRequest.handlers, this.getResultForStatus(PaymentResult.failed, '', err));
                },
                onClick: (_, actions) => {
                    this.storePaymentRequest(paymentRequest);
                    const selectedMethod = {
                        type: PayPalFundingSources.paypal,
                        provider: PaymentProviders.payPal,
                        icon: 'https://cdn.rollerdigital.com/assets/icons/payment/paypal.svg'
                    };
                    this.storage.add(StorageKeys.selectedPaymentMethod, selectedMethod);
                    if (paymentRequest.handlers.onBeforeSubmit) {
                        paymentRequest.handlers.onBeforeSubmit().then(actions.resolve).catch(actions.reject);
                    }
                },
                onInit: () => {
                    if (paymentRequest.handlers.onReady) {
                        paymentRequest.handlers.onReady();
                    }
                },
                style: {
                    tagline: false,
                    color: 'gold',
                    shape: 'rect',
                    layout: 'vertical',
                    label: 'paypal'
                }
            })
                .render(`#${paymentRequest.paymentContainerDivId}`);
            if (this.payPalConfig.canUsePayLater !== false) {
                try {
                    paypal
                        .Messages({
                        amount: this.payment.amount,
                        placement: 'payment',
                        style: {
                            layout: 'text',
                            logo: {
                                type: 'primary',
                                position: 'left'
                            }
                        }
                    })
                        .render(`#${paymentRequest.paymentContainerDivId}-message`);
                }
                catch (messageErr) {
                    this.$log.warn(`Failed to render the PayPal Messages: ${JSON.stringify(messageErr)}`);
                }
            }
        }
        catch (error) {
            this.$log.warn('Failed to render the PayPal Buttons', error);
            throw error;
        }
    }
    hasRedirectResult() {
        return false;
    }
    handleRedirect(handlers) {
        throw new Error('Method not implemented.');
    }
    async checkPaymentStatus(merchantReference, numberOfAttempts) {
        try {
            const statusResult = await this.getPaymentStatus(merchantReference, numberOfAttempts || 5);
            const isApproved = statusResult && statusResult.capture && this.approvedCodes.includes(statusResult.capture.status);
            return {
                result: isApproved ? PaymentResult.approved : PaymentResult.failed
            };
        }
        catch (ex) {
            this.$log.error(`Unable to check payment status ${JSON.stringify(ex)}`);
            return this.getResultForStatus(PaymentResult.unknown);
        }
    }
    async getPaymentDetail(numberOfAttempts) {
        const payment = this.storage.get(StorageKeys.payment);
        const merchantReference = payment && payment.merchantReference;
        if (!merchantReference) {
            return undefined;
        }
        let details = this.getPaymentDetailFromStorage(payment);
        if (!details) {
            const result = await this.getPaymentStatus(merchantReference, numberOfAttempts || 5);
            if (!result || !result.capture) {
                return undefined;
            }
            details = {
                amount: result.capture.amount,
                paymentMethod: PayPalFundingSources.paypal
            };
        }
        const payPalDetail = this.storage.get(StorageKeys.payPalPaymentDetails);
        if (payPalDetail) {
            if (payPalDetail.paymentMethod) {
                details.paymentMethod = payPalDetail.paymentMethod;
                if (details.paymentMethod === PayPalFundingSources.venmo) {
                    details.paymentMethodImageUrl = 'https://cdn.rollerdigital.com/assets/icons/payment/venmo.svg';
                }
            }
            details.payer = payPalDetail.payer;
        }
        return details;
    }
    async handleApproval(paymentRequest, data) {
        const captureResult = await this.captureOrderPayment(data.orderID);
        const paymentResult = this.getResultForStatus(PaymentResult.unknown, undefined, captureResult.capture);
        if (!captureResult || !captureResult.isValid || !captureResult.capture) {
            paymentResult.result = PaymentResult.failed;
            paymentResult.message = captureResult && captureResult.error ? captureResult.error.message : '';
        }
        else {
            if (this.approvedCodes.includes(captureResult.capture.status)) {
                this.storePaymentDetails(captureResult.capture.data);
                paymentResult.result = PaymentResult.approved;
            }
            else if (this.errorCodes.includes(captureResult.capture.status)) {
                paymentResult.result = PaymentResult.failed;
            }
            if (this.pendingCodes.includes(captureResult.capture.status)) {
                await this.handlePendingPayment(paymentRequest.handlers, paymentResult);
                return;
            }
        }
        this.handlePaymentResult(paymentRequest.handlers, paymentResult);
    }
    storePaymentDetails(json) {
        try {
            const detailObj = JSON.parse(json);
            let paymentMethod = PayPalFundingSources.paypal;
            let payer = undefined;
            if (detailObj.payer) {
                payer = detailObj.payer.email_address;
            }
            if (detailObj.payment_source) {
                if (detailObj.payment_source.venmo) {
                    paymentMethod = PayPalFundingSources.venmo;
                }
            }
            this.storage.add(StorageKeys.payPalPaymentDetails, { paymentMethod, payer });
        }
        catch (err) {
            this.$log.warn(`Error parsing PayPal payment details: ${json}. Error: ${JSON.stringify(err)}`);
        }
    }
    getResultForStatus(status, message, rawResult) {
        return {
            result: status,
            message,
            rawResult,
            provider: PaymentProviders.payPal
        };
    }
    async handlePendingPayment(handlers, paymentResult) {
        const maxNumberOfAttempts = 5;
        for (let attemptNumber = 1; attemptNumber <= maxNumberOfAttempts; attemptNumber++) {
            if (attemptNumber >= maxNumberOfAttempts) {
                this.$log.info('Status not changed after initial pending result');
                this.handlePaymentResult(handlers, paymentResult);
                return;
            }
            else if (!this.payment || !this.payment.merchantReference) {
                this.$log.warn('No merchant reference available', this.payment);
                this.handlePaymentResult(handlers, paymentResult);
                return;
            }
            else if (attemptNumber === 1) {
                if (handlers.onPaymentReceived) {
                    handlers.onPaymentReceived();
                }
            }
            try {
                const merchantReference = this.payment.merchantReference;
                const statusResult = await this.getPaymentStatus(merchantReference);
                const isApproved = statusResult &&
                    statusResult.capture &&
                    this.approvedCodes.includes(statusResult.capture.status) &&
                    !this.pendingCodes.includes(statusResult.capture.status);
                if (isApproved) {
                    const statusCheckResult = this.getResultForStatus(PaymentResult.approved, undefined, statusResult);
                    this.handlePaymentResult(handlers, statusCheckResult);
                    return;
                }
                await this.delay(1000);
            }
            catch (err) {
                this.handlePaymentResult(handlers, paymentResult);
            }
        }
    }
    getPaymentDetailFromStorage(payment) {
        const paymentMethod = this.storage.get(StorageKeys.selectedPaymentMethod);
        if (!paymentMethod) {
            return null;
        }
        return {
            amount: payment.amount,
            paymentMethod: paymentMethod.type,
            paymentMethodImageUrl: paymentMethod.icon
        };
    }
    handlePaymentResult(handlers, paymentResult) {
        this.storage.remove(StorageKeys.unprocessedPayment);
        if (paymentResult.result !== PaymentResult.approved) {
            this.reset();
        }
        handlers.onPaymentCompleted(paymentResult);
    }
    reset() {
        this.clearPaymentDetailStorage();
    }
    clearPaymentDetailStorage() {
        this.storage.remove(StorageKeys.selectedPaymentMethod);
        this.storage.remove(StorageKeys.paymentDetailCardLast4Digits);
        this.storage.remove(StorageKeys.payPalOrderId);
        this.storage.remove(StorageKeys.payPalPaymentDetails);
    }
    async getPaymentStatus(merchantReference, numberOfAttempts) {
        const maxAttempts = 10;
        const orderId = this.storage.get(StorageKeys.payPalOrderId) || '';
        numberOfAttempts = Math.min(numberOfAttempts || 1, maxAttempts);
        for (let i = 0; i < numberOfAttempts; i++) {
            try {
                const statusResult = await this.post('payment/paypal/capture-status', {
                    merchantReference,
                    id: orderId,
                    configurationId: this.config.configurationId,
                    integrationId: this.config.integrationId
                }, this.getRequestOptions());
                if (statusResult) {
                    return statusResult;
                }
                await this.delay(1000);
            }
            catch (err) {
                this.$log.warn(`Error checking PayPal payment for '${merchantReference}' - orderId '${orderId}' ${JSON.stringify(err)}`);
            }
        }
        return undefined;
    }
    getRequestOptions() {
        return {
            headers: {
                'X-Checkout-Session-Id': this.checkoutSessionId
            }
        };
    }
    async createOrder(paymentRequest) {
        const request = {
            jwt: paymentRequest.jwt,
            hasRecurringBilling: paymentRequest.hasRecurringBilling,
            redirectUrl: paymentRequest.redirectUrl,
            browser: this.getBrowserInfo(),
            provider: PaymentProviders.payPal
        };
        const response = await this.post('payment/session', request, this.getRequestOptions());
        const result = response;
        if (!result || !result.isValid || !response.session || !result.session.id) {
            this.$log.info('Error creating order ' + JSON.stringify(response));
            const message = result.error ? result.error.message : 'Error creating order';
            throw new Error(message);
        }
        const orderId = result.session.id;
        this.storage.add(StorageKeys.payPalOrderId, orderId);
        this.storage.add(StorageKeys.unprocessedPayment, this.payment);
        return orderId;
    }
    async captureOrderPayment(orderId) {
        const retryAttempt = 3;
        let error = undefined;
        const requestId = this.guidService.generate();
        for (let i = 0; i < retryAttempt; i++) {
            try {
                return await this.post('payment/paypal/capture', {
                    id: orderId,
                    provider: PaymentProviders.payPal,
                    requestId,
                    configurationId: this.config.configurationId,
                    integrationId: this.config.integrationId
                }, this.getRequestOptions());
            }
            catch (err) {
                error = err;
                await this.delay(i * 1000);
            }
        }
        throw error;
    }
}
