const BRAND_RED = 'e31837ff';
const BRAND_RED_DARK = 'b9102bff';
const BLACK = '000000ff';
const WHITE = 'ffffffff';

export const ADMIN_MANAGED_LOGIN_BRANDING_SETTINGS = {
  components: {
    form: {
      backgroundImage: { enabled: false },
      borderRadius: 24,
      lightMode: {
        backgroundColor: WHITE,
        borderColor: 'e4e4e7ff',
      },
      logo: {
        enabled: false,
        formInclusion: 'IN',
        location: 'CENTER',
        position: 'TOP',
      },
    },
    pageBackground: {
      image: { enabled: false },
      lightMode: { color: WHITE },
    },
    pageText: {
      lightMode: {
        bodyColor: BLACK,
        descriptionColor: BLACK,
        headingColor: BLACK,
      },
    },
    primaryButton: {
      lightMode: {
        active: { backgroundColor: BRAND_RED_DARK, textColor: WHITE },
        defaults: { backgroundColor: BRAND_RED, textColor: WHITE },
        disabled: { backgroundColor: 'e4e4e7ff', borderColor: 'e4e4e7ff' },
        hover: { backgroundColor: BRAND_RED_DARK, textColor: WHITE },
      },
    },
    secondaryButton: {
      lightMode: {
        active: { backgroundColor: 'fee2e2ff', borderColor: BRAND_RED_DARK, textColor: BRAND_RED_DARK },
        defaults: { backgroundColor: WHITE, borderColor: BRAND_RED, textColor: BRAND_RED },
        hover: { backgroundColor: 'fff1f2ff', borderColor: BRAND_RED_DARK, textColor: BRAND_RED_DARK },
      },
    },
  },
  componentClasses: {
    buttons: { borderRadius: 16 },
    focusState: { lightMode: { borderColor: BRAND_RED } },
    input: {
      borderRadius: 12,
      lightMode: {
        defaults: { backgroundColor: WHITE, borderColor: BLACK },
        placeholderColor: BLACK,
      },
    },
    inputDescription: { lightMode: { textColor: BLACK } },
    inputLabel: { lightMode: { textColor: BLACK } },
    link: {
      lightMode: {
        defaults: { textColor: BRAND_RED },
        hover: { textColor: BRAND_RED_DARK },
      },
    },
    optionControls: {
      lightMode: {
        defaults: { backgroundColor: WHITE, borderColor: BLACK },
        selected: { backgroundColor: BRAND_RED, foregroundColor: WHITE },
      },
    },
  },
  categories: {
    global: {
      colorSchemeMode: 'LIGHT',
      spacingDensity: 'REGULAR',
    },
  },
};
