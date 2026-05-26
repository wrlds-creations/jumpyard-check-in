import { PaymentProvider } from './payment-provider';
import { IPaymentAction, IPaymentDetail, IPaymentRequest, IPaymentRequestHandlers, IPaymentResult } from './payment.model';
import { IAdyenPaymentConfiguration } from './adyen.model';
export declare class AdyenCheckoutProvider extends PaymentProvider {
    private approvedCodes;
    private pendingCodes;
    private failureCodes;
    private dropInComponent;
    protected config: IAdyenPaymentConfiguration;
    constructor(config: IAdyenPaymentConfiguration, actions: IPaymentAction);
    get supportRecurringBilling(): boolean;
    setup(paymentRequest: IPaymentRequest): Promise<any>;
    hasRedirectResult(): boolean;
    handleRedirect(handlers: IPaymentRequestHandlers): Promise<any>;
    getPaymentDetail(numberOfAttempts?: number): Promise<IPaymentDetail | undefined>;
    checkPaymentStatus(merchantReference: string, numberOfAttempts?: number, errorCode?: string): Promise<IPaymentResult>;
    private createSession;
    private renderDropInComponent;
    private getDropInOptions;
    private getEnvironment;
    private getDropInConfiguration;
    private getLocale;
    private getTranslations;
    private getInterruptedPaymentAttemptErrorCode;
    private formatError;
    /**
     * Returns true if the submission can proceed
     */
    private handleBeforeSubmit;
    /**
     * Returns true if a succcessul notification found and the result has been handled.
     */
    private handleExistingPaymentResult;
    private getPaymentMethodsConfiguration;
    private getCardConfiguration;
    private getPaypalConfiguration;
    private getApplePayConfiguration;
    private getGooglePayConfiguration;
    private allowPaymentMethod;
    private resetDropInComponent;
    private getPaymentResult;
    private getResultCodeMessage;
    private handlePendingPayment;
    private isAuthorisationNotification;
    private checkPaymentNotifications;
    private handlePaymentResult;
    private getPaymentNotification;
    private unknownResult;
    private supportsRecurring;
    private supportsTokenisation;
    private supportsEmbedded;
    private getPaymentDetailFromStorage;
    private clearPaymentDetailStorage;
    private useDefaultPhsyicalAddress;
    private canUseApplePay;
    private validateEmbeddedApplePayMerchant;
}
