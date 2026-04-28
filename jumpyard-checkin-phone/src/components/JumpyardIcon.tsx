export type JumpyardIconName =
    | 'add-guest'
    | 'add-jump-session'
    | 'addons-bag'
    | 'admission-ticket'
    | 'age-limit'
    | 'booking-card'
    | 'booking-confirmed'
    | 'child'
    | 'connected-band'
    | 'drink-cup'
    | 'email-confirmed'
    | 'foam-pit-landing'
    | 'gift-card'
    | 'grip-socks'
    | 'group'
    | 'info'
    | 'no-edge-bounce'
    | 'no-running'
    | 'padlock'
    | 'payment-card'
    | 'safe-tricks'
    | 'safety-check'
    | 'scan-frame'
    | 'success-check'
    | 'time'
    | 'trampoline-jump'
    | 'visitor-wristband'
    | 'warning'
    | 'zipline';

interface JumpyardIconProps {
    name: JumpyardIconName;
    alt?: string;
    className?: string;
}

export const JumpyardIcon = ({ name, alt = '', className = 'w-8 h-8' }: JumpyardIconProps) => (
    <img
        src={`/jumpyard-next-icons/${name}.png`}
        alt={alt}
        aria-hidden={alt ? undefined : true}
        draggable={false}
        className={`object-contain ${className}`}
    />
);
