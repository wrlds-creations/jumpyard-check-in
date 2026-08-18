type WeekdayComboCopy = Record<'en' | 'sv', {
  readonly availability: string;
  readonly name: string;
}>;

export const weekdayComboCopy: WeekdayComboCopy = {
  en: {
    availability: 'Weekdays',
    name: 'Weekday Combo',
  },
  sv: {
    availability: 'Vardagar',
    name: 'Weekday Combo',
  },
};
