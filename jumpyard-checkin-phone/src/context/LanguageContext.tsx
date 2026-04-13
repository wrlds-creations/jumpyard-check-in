'use client';
import { createContext, useContext, useEffect, useState } from 'react';

type Language = 'sv' | 'en';

const sv = {
  common: {
    back: 'Tillbaka',
    continue: 'Fortsätt',
    confirm: 'Bekräfta',
    cancel: 'Avbryt',
    skip: 'Hoppa över',
    processing: 'Behandlar…',
    loading: 'Laddar…',
    currency: 'kr',
    done: 'Klart',
    yes: 'Ja',
    no: 'Nej',
    callStaff: 'Hämta personal',
    staffCalled: 'Personal är på väg',
    stillThere: 'Är du kvar?',
    stillThereDesc: 'Tryck var som helst för att fortsätta, annars börjar vi om.',
    imHere: 'Jag är kvar',
  },
  progress: {
    booking: 'Bokning',
    safety: 'Säkerhet',
    extras: 'Tillägg',
    payment: 'Betalning',
    done: 'Klar',
  },
  idle: {
    tap: 'Tryck för att börja',
    line1: 'Välkommen till',
    line2: 'JumpYard',
  },
  start: {
    eyebrowKiosk: 'Kiosk',
    eyebrowPark: 'Park-QR',
    eyebrowSms: 'SMS-länk',
    title: 'Välkommen!',
    subtitle: 'Samma incheckning oavsett hur du kom hit.',
    cta: 'Starta',
  },
  choice: {
    title: 'Vad vill du göra?',
    haveBooking: 'Jag har en bokning',
    haveBookingDesc: 'Hitta din bokning med bokningskod',
    buyTickets: 'Köp bokning',
    buyTicketsDesc: 'Köp biljett och fortsätt till check-in',
  },
  lookup: {
    title: 'Hitta din bokning',
    description: 'Skanna QR-koden eller skriv in din bokningsnummer.',
    placeholder: 'Bokningsnummer',
    cta: 'Sök',
    notFound: 'Vi hittade ingen bokning med det numret.',
    tryAgain: 'Kontrollera numret eller hämta personal.',
    scanning: 'Skannar…',
  },
  buy: {
    selectTicket: 'Välj biljett',
    sectionEntry: 'Entré',
    sectionFamily: 'Familj',
    entry60: '60 min entré',
    entry90: '90 min entré',
    entry120: '120 min entré',
    family60: '60 min familj',
    family90: '90 min familj',
    family120: '120 min familj',
    familyNote: '4 hoppare per paket',
    howMany: 'Hur många?',
    quantityJumpers: 'Antal hoppare',
    quantityPackages: 'Antal familjepaket',
    total: 'Totalt',
    selectTime: 'Välj tid',
    selectTimeDesc: 'Kommande lediga tider',
    spotsLeft: 'platser kvar',
    spotsFull: 'Fullbokat',
    contactTitle: 'Din kontakt',
    contactDesc: 'Vi skickar bekräftelse och påminnelser.',
    contactHint: 'Minst ett av fälten krävs',
    emailLabel: 'E-post',
    emailPlaceholder: 'gäst@exempel.se',
    phoneLabel: 'Telefon',
    phonePlaceholder: '+46 70 123 45 67',
    creating: 'Skapar bokning…',
    confirmCreate: 'Bekräfta & fortsätt',
  },
  booking: {
    ref: 'Bokning',
    today: 'Idag',
    date: 'Datum',
    time: 'Tid',
    duration: 'Längd',
    guest: 'Gäst',
    jumpers: 'Hoppare',
    addons: 'Tillägg',
    none: 'Inga',
    paidInFull: 'Betald',
    notPaid: 'Obetald',
    title: 'Din bokning',
    subtitle: 'Ser det rätt ut? Då kör vi.',
    product: 'Produkt',
    cta: 'Ja, starta incheckning',
    timeHint: 'Tar ca 1–2 min. Nästa steg: säkerhetsvideo.',
  },
  safetyVideo: {
    title: 'Säkerhetsvideo',
    description: 'Titta på videon innan du kan gå vidare.',
    play: 'Spela upp',
    playing: 'Videon spelas…',
    watchFull: 'Titta hela videon',
    done: 'Klart, fortsätt',
  },
  safetyAttest: {
    title: 'Säkerhetsregler',
    description: 'Bekräfta varje regel innan du fortsätter.',
    rules: {
      onePerTrampoline: 'En person per studsmatta åt gången.',
      followStaff: 'Följ alltid personalens instruktioner.',
      noFlips: 'Inga volter utan instruktör.',
      removeJewelry: 'Ta av smycken, glasögon och lösa föremål.',
    },
    finalAttest: 'Jag intygar att samtliga i min bokning har tagit del av reglerna och förstått dem.',
    cta: 'Jag förstår, fortsätt',
  },
  addons: {
    title: 'Tillägg',
    description: 'Välj till extra, hoppa över det du inte vill ha.',
    alreadyInBooking: 'Ingår redan',
    total: 'Tillägg totalt',
    perJumper: 'per hoppare',
    each: 'st',
    perPerson: 'per person',
    connectedValueProp: 'Mest valt tillägg',
    scrollHint: 'tillägg att välja mellan — scrolla ner',
    products: {
      skyriderLabel: 'SkyRider',
      skyriderDesc: 'Linbane-upplevelsen. Kräver min 100 cm.',
      connectedLabel: 'Connected',
      connectedDesc: 'Spåra hopp, tävla på topplistor, få highlight-klipp.',
      coffeeLabel: 'Kaffe',
      coffeeDesc: 'Kaffe åt de vuxna medan barnen hoppar.',
      extraPersonLabel: 'Extra person',
      extraPersonDesc: 'Lägg till en till hoppare.',
      lockLabel: 'Hänglås',
      lockDesc: 'Hänglås till skåpen.',
      socksLabel: 'Strumpor',
      socksDesc: 'Hoppstrumpor, obligatoriska.',
    },
  },
  skyrider: {
    title: 'SkyRider höjdkrav',
    description: 'Alla som åker SkyRider måste vara minst 100 cm långa.',
    confirmCheckbox: 'Jag bekräftar att SkyRider-biljetterna endast används av personer som är minst 100 cm långa.',
    removeSkyRider: 'Ta bort SkyRider',
  },
  connected: {
    title: 'Connected-profiler',
    description: 'Varje Connected-band kopplas till en profil. Skriv namn så personalen vet vem som får vilket band.',
    profile: 'Profil',
    namePlaceholder: 'Namn',
    avatar: 'Ikon',
    confirm: 'Bekräfta profiler',
  },
  payment: {
    title: 'Betalning',
    description: 'Håll kortet mot terminalen när du är redo.',
    booking: 'Bokning',
    items: 'Vad du betalar för',
    total: 'Totalt',
    pay: 'Betala',
    afterPaymentHint: 'Efter betalning får du en kod att visa vid entrén.',
    baseProduct: 'Bokning',
    addonsLabel: 'Tillägg',
  },
  confirm: {
    title: 'Du är incheckad!',
    subtitle: 'Visa koden nedan vid entrén för att få dina grejer.',
    pickupCode: 'Din kod',
    backupLabel: 'Backupkod',
    staffHandout: 'Att hämta ut hos personalen',
    otherAddons: 'Övriga tillägg i bokningen',
    wristbands: 'Armband',
    connectedBands: 'Connected-band',
    complete: 'Klart & nästa gäst',
    done: 'Börja om',
    showStaffNote: 'Visa personalen',
  },
  print: {
    title: 'Klart, gå till banan!',
    subtitle: 'Ditt kvitto skrivs ut.',
    printing: 'Skriver ut…',
  },
  present: {
    eyebrow: 'Visa vid entrén',
    title: 'Redo för parken',
    backupLabel: 'Backupkod',
    instruction: 'Visa QR-koden eller backupkoden till personalen för att få armband.',
    startOver: 'Börja om',
  },
  extend: {
    loading: 'Laddar förlängning…',
    view: {
      title: 'Förläng din session',
      subtitle: '+30 minuter extra hopptid.',
      currentEnd: 'Nuvarande sluttid',
      newEnd: 'Ny sluttid',
      price: 'Pris',
      cta: 'Betala',
    },
    pay: {
      title: 'Betala förlängning',
      subtitle: '+30 min för',
      swish: 'Swish',
      card: 'Kort',
    },
    qr: {
      eyebrow: 'Bandbyte',
      title: '+30 minuter bekräftat',
      newEndPrefix: 'Ny sluttid:',
      nextStepLabel: 'Nästa steg',
      nextStepText: 'Gå till kassan eller personalen för att få ett nytt band med uppdaterad sluttid.',
    },
    error: {
      title: 'Vi kunde inte ladda förlängningen',
      expired: 'Länken har gått ut. Hämta personal.',
      already: 'Den här bokningen är redan förlängd.',
      generic: 'Något gick fel. Hämta personal.',
    },
  },
};

const en: typeof sv = {
  common: {
    back: 'Back',
    continue: 'Continue',
    confirm: 'Confirm',
    cancel: 'Cancel',
    skip: 'Skip',
    processing: 'Processing…',
    loading: 'Loading…',
    currency: 'kr',
    done: 'Done',
    yes: 'Yes',
    no: 'No',
    callStaff: 'Call staff',
    staffCalled: 'Staff is on the way',
    stillThere: 'Are you still there?',
    stillThereDesc: 'Tap anywhere to continue, otherwise we restart.',
    imHere: "I'm here",
  },
  progress: {
    booking: 'Booking',
    safety: 'Safety',
    extras: 'Extras',
    payment: 'Payment',
    done: 'Done',
  },
  idle: {
    tap: 'Tap to start',
    line1: 'Welcome to',
    line2: 'JumpYard',
  },
  start: {
    eyebrowKiosk: 'Kiosk',
    eyebrowPark: 'Park QR',
    eyebrowSms: 'SMS Link',
    title: 'Welcome!',
    subtitle: 'Same check-in whichever way you arrived.',
    cta: 'Start',
  },
  choice: {
    title: 'What would you like to do?',
    haveBooking: 'I have a booking',
    haveBookingDesc: 'Find your booking with booking code',
    buyTickets: 'Buy booking',
    buyTicketsDesc: 'Buy a ticket and continue to check-in',
  },
  lookup: {
    title: 'Find your booking',
    description: 'Scan the QR code or enter your booking number.',
    placeholder: 'Booking number',
    cta: 'Search',
    notFound: "We couldn't find a booking with that number.",
    tryAgain: 'Check the number or call staff.',
    scanning: 'Scanning…',
  },
  buy: {
    selectTicket: 'Select ticket',
    sectionEntry: 'Entry',
    sectionFamily: 'Family',
    entry60: '60 min entry',
    entry90: '90 min entry',
    entry120: '120 min entry',
    family60: '60 min family',
    family90: '90 min family',
    family120: '120 min family',
    familyNote: '4 jumpers per package',
    howMany: 'How many?',
    quantityJumpers: 'Number of jumpers',
    quantityPackages: 'Number of family packages',
    total: 'Total',
    selectTime: 'Choose time',
    selectTimeDesc: 'Upcoming available slots',
    spotsLeft: 'spots left',
    spotsFull: 'Fully booked',
    contactTitle: 'Your contact',
    contactDesc: 'We send confirmation and reminders.',
    contactHint: 'At least one field is required',
    emailLabel: 'Email',
    emailPlaceholder: 'guest@example.com',
    phoneLabel: 'Phone',
    phonePlaceholder: '+46 70 123 45 67',
    creating: 'Creating booking…',
    confirmCreate: 'Confirm & continue',
  },
  booking: {
    ref: 'Booking',
    today: 'Today',
    date: 'Date',
    time: 'Time',
    duration: 'Duration',
    guest: 'Guest',
    jumpers: 'Jumpers',
    addons: 'Add-ons',
    none: 'None',
    paidInFull: 'Paid',
    notPaid: 'Unpaid',
    title: 'Your booking',
    subtitle: "Looks right? Let's go.",
    product: 'Product',
    cta: 'Yes, start check-in',
    timeHint: 'Takes about 1–2 min. Next: safety video.',
  },
  safetyVideo: {
    title: 'Safety video',
    description: 'Watch the video before you can continue.',
    play: 'Play',
    playing: 'Video playing…',
    watchFull: 'Watch the full video',
    done: 'Done, continue',
  },
  safetyAttest: {
    title: 'Safety rules',
    description: 'Confirm each rule before continuing.',
    rules: {
      onePerTrampoline: 'One person per trampoline at a time.',
      followStaff: 'Always follow staff instructions.',
      noFlips: 'No flips without an instructor.',
      removeJewelry: 'Remove jewelry, glasses, and loose items.',
    },
    finalAttest: 'I confirm that everyone in my booking has read and understood the rules.',
    cta: 'I understand, continue',
  },
  addons: {
    title: 'Add-ons',
    description: "Pick extras, skip anything you don't want.",
    alreadyInBooking: 'Already included',
    total: 'Add-ons total',
    perJumper: 'per jumper',
    each: 'each',
    perPerson: 'per person',
    connectedValueProp: 'Most chosen add-on',
    scrollHint: 'add-ons to choose from — scroll down',
    products: {
      skyriderLabel: 'SkyRider',
      skyriderDesc: 'Zip-line experience. Requires min 100 cm.',
      connectedLabel: 'Connected',
      connectedDesc: 'Track jumps, leaderboards, highlight reel.',
      coffeeLabel: 'Coffee',
      coffeeDesc: 'Coffee for the grown-ups while the kids jump.',
      extraPersonLabel: 'Extra person',
      extraPersonDesc: 'Add another jumper to this booking.',
      lockLabel: 'Padlock',
      lockDesc: 'Padlock for the lockers.',
      socksLabel: 'Socks',
      socksDesc: 'Jump socks, required.',
    },
  },
  skyrider: {
    title: 'SkyRider height requirement',
    description: 'Everyone riding SkyRider must be at least 100 cm tall.',
    confirmCheckbox: 'I confirm that SkyRider tickets will only be used by persons who are at least 100 cm tall.',
    removeSkyRider: 'Remove SkyRider',
  },
  connected: {
    title: 'Connected profiles',
    description: 'Each Connected band is linked to a profile. Enter names so staff know who gets which band.',
    profile: 'Profile',
    namePlaceholder: 'Name',
    avatar: 'Icon',
    confirm: 'Confirm profiles',
  },
  payment: {
    title: 'Payment',
    description: 'Tap your card on the terminal when ready.',
    booking: 'Booking',
    items: "What you're paying for",
    total: 'Total',
    pay: 'Pay',
    afterPaymentHint: 'After payment you will get a code to show at the entrance.',
    baseProduct: 'Booking',
    addonsLabel: 'Add-ons',
  },
  confirm: {
    title: "You're checked in!",
    subtitle: 'Show the code below at the entrance to get your gear.',
    pickupCode: 'Your code',
    backupLabel: 'Backup code',
    staffHandout: 'Pick up from staff',
    otherAddons: 'Other add-ons on your booking',
    wristbands: 'Wristbands',
    connectedBands: 'Connected bands',
    complete: 'Done & next guest',
    done: 'Start over',
    showStaffNote: 'Show staff',
  },
  print: {
    title: 'Done, head to the park!',
    subtitle: 'Your receipt is printing.',
    printing: 'Printing…',
  },
  present: {
    eyebrow: 'Show at entrance',
    title: 'Ready for the park',
    backupLabel: 'Backup code',
    instruction: 'Show the QR code or backup code to staff to get your wristbands.',
    startOver: 'Start over',
  },
  extend: {
    loading: 'Loading extension…',
    view: {
      title: 'Extend your session',
      subtitle: '+30 minutes of extra jump time.',
      currentEnd: 'Current end',
      newEnd: 'New end',
      price: 'Price',
      cta: 'Pay',
    },
    pay: {
      title: 'Extension payment',
      subtitle: '+30 min for',
      swish: 'Swish',
      card: 'Card',
    },
    qr: {
      eyebrow: 'Band swap',
      title: '+30 minutes confirmed',
      newEndPrefix: 'New end:',
      nextStepLabel: 'Next step',
      nextStepText: 'Go to the cashier or staff to get a new wristband with the updated end time.',
    },
    error: {
      title: "We couldn't load the extension",
      expired: 'This link has expired. Please call staff.',
      already: 'This booking has already been extended.',
      generic: 'Something went wrong. Please call staff.',
    },
  },
};

export type Translations = typeof sv;
const translations: Record<Language, Translations> = { sv, en };

interface LanguageContextValue {
  lang: Language;
  t: Translations;
  toggleLang: () => void;
  setLang: (l: Language) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'sv',
  t: sv,
  toggleLang: () => {},
  setLang: () => {},
});

const STORAGE_KEY = 'jy.lang';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>('sv');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
      if (stored === 'sv' || stored === 'en') setLangState(stored);
    } catch {}
  }, []);

  const setLang = (l: Language) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {}
  };
  const toggleLang = () => setLang(lang === 'sv' ? 'en' : 'sv');

  return (
    <LanguageContext.Provider value={{ lang, t: translations[lang], toggleLang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  return useContext(LanguageContext);
}
