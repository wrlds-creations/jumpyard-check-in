export declare enum PaymentProviders {
    adyen = 1,
    payPal = 2
}
export declare enum PaymentResult {
    unknown = 0,
    approved = 1,
    failed = 2
}
export interface IPaymentBootstrapConfiguration {
    configurationId: string;
    apiUrl: string;
    integrationId: string;
}
export interface IEcomPaymentService {
    bootstrap: (bootstrapConfig: IPaymentBootstrapConfiguration, actions: IPaymentAction) => Promise<IPaymentConfiguration>;
    setup: (paymentRequest: IPaymentRequest) => Promise<any>;
    handleRedirect: (handlers: IPaymentRequestHandlers, sessionId: string, redirectResult: string) => Promise<any>;
}
export interface IPaymentRequest {
    jwt: string;
    hasRecurringBilling: boolean;
    redirectUrl: string;
    paymentContainerDivId: string;
    handlers: IPaymentRequestHandlers;
    paymentMethodNames?: IPaymentMethodNameOverrides;
    currencyCode?: string;
    checkoutSessionId?: string;
    showStoredPaymentMethods?: boolean;
    embeddedParentOrigin?: string;
}
export interface IPaymentMethodNameOverrides {
    scheme?: string;
    directEBanking?: string;
}
export interface IEcomPaymentRequest {
    jwt: string;
    hasRecurringBilling: boolean;
    redirectUrl: string;
    browser?: IBrowser;
    unsupportedPaymentMethods?: string[];
}
export interface IPayment {
    configurationId: string;
    merchantReference: string;
    currency: string;
    amount: number;
    recurringPaymentToken: string;
    isMoto: boolean;
    redirectUrl: string;
    statement: string;
    customer: ICustomer;
    paymentProvider?: PaymentProviders;
}
export interface ICustomer {
    firstName: string;
    lastName: string;
    email: string;
    countryCode: string;
    locale: string;
}
export interface IBrowser {
    locale: string;
    userAgent: string;
    tzOffset: number;
    screen: IBrowserScreen;
    isEmbedded?: boolean;
}
export interface IBrowserScreen {
    colorDepth: number;
    height: number;
    width: number;
}
export interface IPaymentResult {
    result: PaymentResult;
    message?: string;
    rawResult?: any;
    provider: PaymentProviders;
}
export interface IPaymentRequestHandlers {
    onReady?: () => void;
    onSelect?: (selected: ISelectedPaymentMethod) => void;
    onBeforeSubmit?: () => Promise<void>;
    onPaymentReceived?: () => void;
    onPaymentCompleted: (result: IPaymentResult) => void;
}
export interface IPaymentConfiguration extends IPaymentBootstrapConfiguration {
    provider: PaymentProviders;
    alternateProvider?: PaymentProviders;
    isTestEnvironment: boolean;
    clientKey?: string;
}
export interface IPaymentAction {
    translate: (key: string, data?: any) => string;
    http: IHttp;
    log: ILog;
}
export interface IHttp {
    get: (url: string, params?: any, options?: IHttpOptions) => Promise<any>;
    post: (url: string, data?: any, options?: IHttpOptions) => Promise<any>;
}
export interface IHttpOptions {
    headers: {
        [header: string]: string | string[];
    };
}
export interface ILog {
    info: (message: string) => void;
    warn: (message: string, data?: any) => void;
    error: (message: string, data?: any) => void;
}
export interface IJwt {
    header: any;
    payload: any;
    signature: string;
}
export interface IPaymentDetail {
    amount: number;
    paymentMethod?: string;
    paymentMethodImageUrl?: string;
    cardLast4Digits?: string;
    payer?: string;
}
export declare class StorageKeys {
    static readonly payment = "ecom-payments:payment";
    static readonly unprocessedPayment = "ecom-payments:unprocessed-payment";
    static readonly attemptedPaymentRef = "ecom-payments:attempted-payment-ref";
    static readonly selectedPaymentMethod = "ecom-payments:selected-payment-method";
    static readonly paymentDetailCardLast4Digits = "ecom-payments:card-last-4-digits";
    static readonly payPalOrderId = "ecom-payments:paypal-order-id";
    static readonly payPalPaymentDetails = "ecom-payments:paypal-details";
    static readonly checkoutSessionId = "ecom-payments:checkout-session-id";
}
export interface IPaymentError {
    code?: number;
    message?: string;
}
export interface IPaymentSession {
    id: string;
    data: string;
}
export interface IPaymentSessionResult {
    session?: IPaymentSession;
    error?: IPaymentError;
    isValid: boolean;
}
export interface ISelectedPaymentMethod {
    type: string;
    icon?: string;
    provider?: PaymentProviders;
}
