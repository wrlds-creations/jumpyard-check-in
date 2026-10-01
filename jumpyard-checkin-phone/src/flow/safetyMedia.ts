// Content-addressed URLs make the browser cache safe across both language and
// release changes. Only the selected film is mounted/preloaded at the safety step.
export const SAFETY_MEDIA = {
  sv: { src: '/media/safety-sv-f918b9754977.mp4', durationSeconds: 15 },
  en: { src: '/media/safety-en-316c51ceb304.mp4', durationSeconds: 15 },
} as const;

// The film's own captions start on its first frame, so the start and replay screens show a blurred
// still of that frame instead. It carries no readable text, so both languages share it.
export const SAFETY_COVER = '/media/safety-cover-93f1195dd9f6.jpg';
