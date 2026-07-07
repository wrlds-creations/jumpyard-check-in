export type JumpyardIconName =
    | 'add-guest'
    | 'add-jump-session'
    | 'addons-bag'
    | 'admission-ticket'
    | 'age-limit'
    | 'booking-card'
    | 'booking-confirmed'
    | 'booking-confirmed-on-red-black-badge'
    | 'booking-confirmed-on-red'
    | 'booking-confirmed-on-red-white-calendar'
    | 'child'
    | 'connected-band'
    | 'drink-cup'
    | 'admission-ticket-red-white-flame'
    | 'email-confirmed'
    | 'foam-pit-landing'
    | 'gift-card'
    | 'grip-socks'
    | 'group'
    | 'info'
    | 'jump'
    | 'no-edge-bounce'
    | 'no-running'
    | 'padlock'
    | 'payment-card'
    | 'phone'
    | 'points-star'
    | 'presentkort'
    | 'safe-tricks'
    | 'safety-check'
    | 'scan-frame'
    | 'success-check'
    | 'time'
    | 'trampoline-jump'
    | 'visit-calendar'
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
        className={`object-contain origin-center scale-125 ${className}`}
    />
);
