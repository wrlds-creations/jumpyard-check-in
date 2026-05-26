import { AdyenCheckoutProvider } from './adyen';
import { GuidService } from './guid.service';
import { LocalStorageService } from './local-storage.service';
import { PaymentProviders, StorageKeys } from './payment.model';
import { PayPal } from './paypal/paypal';
import { UrlHelper } from './url-helper.class';
export class EcomPaymentService {
    constructor() {
        this.paymentProviders = [];
        this.guidService = new GuidService();
    }
    async bootstrap(bootstrapConfig, actions) {
        try {
            this.$log = actions.log;
            if (!this.localStorageService) {
                this.localStorageService = LocalStorageService.getInstance(actions.log);
            }
            if (!bootstrapConfig || !bootstrapConfig.integrationId || !bootstrapConfig.configurationId) {
                this.$log.warn('Missing integrationId and/or configurationId', bootstrapConfig);
                return null;
            }
            else if (!bootstrapConfig.apiUrl) {
                this.$log.warn('Missing API URL', bootstrapConfig);
                return null;
            }
            const response = await actions.http.get(new URL(`integration/${bootstrapConfig.integrationId}/configuration/${bootstrapConfig.configurationId}/ecom`, bootstrapConfig.apiUrl).toString());
            const config = Object.assign(Object.assign({}, bootstrapConfig), response);
            if (config.provider === PaymentProviders.adyen && !this.isProviderAdded(PaymentProviders.adyen)) {
                this.paymentProvider = new AdyenCheckoutProvider(config, actions);
                this.paymentProviders.push(this.paymentProvider);
            }
            if (config.alternateProvider === PaymentProviders.payPal && !this.isProviderAdded(PaymentProviders.payPal)) {
                const payPalConfig = Object.assign(Object.assign({}, bootstrapConfig), response.payPal);
                payPalConfig.isTestEnvironment = config.isTestEnvironment;
                payPalConfig.provider = PaymentProviders.payPal;
                payPalConfig.alternateProvider = undefined;
                this.alternatePaymentProvider = new PayPal(payPalConfig, actions);
                this.paymentProviders.push(this.alternatePaymentProvider);
            }
            return config;
        }
        catch (error) {
            this.$log.error(`Error loading configuration - ${JSON.stringify(error)}`);
            return null;
        }
    }
    async setup(paymentRequest) {
        if (!this.paymentProviders.length) {
            return;
        }
        paymentRequest.checkoutSessionId = this.getCheckoutSessionId();
        if (this.paymentProviders.length > 1) {
            const parentPaymentContainerId = paymentRequest.paymentContainerDivId;
            const parentContainer = await HtmlDomHelper.waitForElement(parentPaymentContainerId);
            let index = 0;
            for (const provider of this.paymentProviders) {
                if (paymentRequest.hasRecurringBilling && !provider.supportRecurringBilling) {
                    continue;
                }
                const isPrimaryProvider = provider === this.paymentProvider;
                const paypalContainer = document.getElementById('paypal-container');
                if (paypalContainer && !isPrimaryProvider) {
                    paypalContainer.parentNode.removeChild(paypalContainer);
                }
                index++;
                try {
                    const clonedPaymentRequest = this.shallowClonePaymentRequest(paymentRequest);
                    clonedPaymentRequest.paymentContainerDivId = await HtmlDomHelper.addChildContainer(parentContainer, `payment-container-${this.guidService.generate()}-${index}`, !isPrimaryProvider);
                    await provider.setup(clonedPaymentRequest);
                }
                catch (err) {
                    this.$log.warn(`Error setting up ${provider.providerType}: ${JSON.stringify(err)}`);
                    if (isPrimaryProvider) {
                        throw err;
                    }
                }
            }
        }
        else {
            await this.paymentProvider.setup(paymentRequest);
        }
    }
    hasRedirectResult() {
        if (!this.paymentProvider) {
            // TODO: This is needed by handleInterruptedPayment before bootstrap so we could
            // have a static on all providers instead of requiring bootstrap?
            const queryParams = UrlHelper.getSearchParams();
            return queryParams.has('redirectResult');
        }
        return this.paymentProvider.hasRedirectResult();
    }
    async handleRedirect(handlers) {
        if (!this.paymentProvider) {
            return;
        }
        return await this.paymentProvider.handleRedirect(handlers);
    }
    async getPaymentDetail(numberOfAttempts) {
        const selectedPaymentMethod = this.localStorageService.get(StorageKeys.selectedPaymentMethod);
        const provider = selectedPaymentMethod === null || selectedPaymentMethod === void 0 ? void 0 : selectedPaymentMethod.provider;
        if (this.alternatePaymentProvider && this.alternatePaymentProvider.providerType === provider) {
            return await this.alternatePaymentProvider.getPaymentDetail(numberOfAttempts);
        }
        if (!this.paymentProvider) {
            return undefined;
        }
        return await this.paymentProvider.getPaymentDetail(numberOfAttempts);
    }
    async handleInterruptedPayment(bootstrapConfig, actions, numberOfAttempts) {
        if (!this.localStorageService) {
            this.localStorageService = LocalStorageService.getInstance(actions.log);
        }
        const unprocessedPayment = this.localStorageService.get(StorageKeys.unprocessedPayment);
        if (!unprocessedPayment || this.hasRedirectResult()) {
            return undefined;
        }
        await this.bootstrap(bootstrapConfig, actions);
        let provider = this.paymentProvider;
        if (this.alternatePaymentProvider && unprocessedPayment.paymentProvider === this.alternatePaymentProvider.providerType) {
            provider = this.alternatePaymentProvider;
        }
        const result = await provider.checkPaymentStatus(unprocessedPayment.merchantReference, numberOfAttempts);
        this.localStorageService.clear();
        return result;
    }
    isProviderAdded(providerType) {
        return !!this.paymentProviders.find((provider) => provider.providerType === providerType);
    }
    shallowClonePaymentRequest(request) {
        return Object.assign({}, request);
    }
    getCheckoutSessionId() {
        try {
            let id = this.localStorageService.get(StorageKeys.checkoutSessionId);
            if (!id) {
                id = this.guidService.generate();
                this.localStorageService.add(StorageKeys.checkoutSessionId, id);
            }
            return id;
        }
        catch (err) {
            this.$log.warn(`Error getting checkout session ID: ${JSON.stringify(err)}`);
            return undefined;
        }
    }
}
class HtmlDomHelper {
    static async addChildContainer(parentElement, childId, wrapInList = false) {
        const childElement = document.createElement('div');
        let innerHtml = `<div>
                            <div id='${childId}'></div>
                            <div id='${childId}-message'></div>
                         </div>`;
        if (wrapInList) {
            innerHtml = `<div id="paypal-container" class="paypal-container"><ul><li><div class="paypal-container__header">
                <span class="paypal-container__header--radio"></span>
                <span class="paypal-container__header--card"><img src="http://cdn.rollerdigital.com/assets/icons/payment/paypal.svg" alt="paypal"></span>
                <span class="paypal-container__header--name">PayPal</span>
            </div>${innerHtml}</li></ul></div>`;
        }
        const groupContainerId = `group-wrapper-${childId}`;
        const containerGroupClassName = 'payment-group-container';
        childElement.setAttribute('id', groupContainerId);
        childElement.innerHTML = innerHtml;
        childElement.classList.add(containerGroupClassName);
        childElement.onclick = () => {
            const childGroups = parentElement.querySelectorAll(`div.${containerGroupClassName}`);
            const activeGroupClassName = 'active-group';
            const inactiveGroupClassName = 'inactive-group';
            for (let i = 0; i < childGroups.length; i++) {
                const group = childGroups[i];
                if (!group) {
                    continue;
                }
                const groupId = group.id;
                if (groupId !== groupContainerId) {
                    group.classList.remove(activeGroupClassName);
                    group.classList.add(inactiveGroupClassName);
                }
                else {
                    group.classList.add(activeGroupClassName);
                    group.classList.remove(inactiveGroupClassName);
                }
            }
        };
        parentElement.appendChild(childElement);
        await HtmlDomHelper.waitForElement(childId);
        return childId;
    }
    static waitForElement(id) {
        return new Promise((resolve) => {
            if (document.getElementById(id)) {
                return resolve(document.getElementById(id));
            }
            const observer = new MutationObserver(() => {
                if (document.getElementById(id)) {
                    resolve(document.getElementById(id));
                    observer.disconnect();
                }
            });
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        });
    }
}
