import { IEcomPaymentService, IPaymentAction, IPaymentRequest, IPaymentConfiguration, IPaymentRequestHandlers, IPaymentBootstrapConfiguration, IPaymentResult, IPaymentDetail } from './payment.model';
export declare class EcomPaymentService implements IEcomPaymentService {
    private paymentProvider;
    private alternatePaymentProvider;
    private paymentProviders;
    private $log;
    private guidService;
    private localStorageService;
    constructor();
    bootstrap(bootstrapConfig: IPaymentBootstrapConfiguration, actions: IPaymentAction): Promise<IPaymentConfiguration>;
    setup(paymentRequest: IPaymentRequest): Promise<any>;
    hasRedirectResult(): boolean;
    handleRedirect(handlers: IPaymentRequestHandlers): Promise<any>;
    getPaymentDetail(numberOfAttempts?: number): Promise<IPaymentDetail | undefined>;
    handleInterruptedPayment(bootstrapConfig: IPaymentBootstrapConfiguration, actions: IPaymentAction, numberOfAttempts?: number): Promise<IPaymentResult | undefined>;
    private isProviderAdded;
    private shallowClonePaymentRequest;
    private getCheckoutSessionId;
}
