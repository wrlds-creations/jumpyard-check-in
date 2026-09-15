// Content-addressed URLs make the browser cache safe across both language and
// release changes. Only the selected film is mounted/preloaded at the safety step.
export const SAFETY_MEDIA = {
  sv: { src: '/media/safety-sv-f918b9754977.mp4', durationSeconds: 15 },
  en: { src: '/media/safety-en-316c51ceb304.mp4', durationSeconds: 15 },
} as const;
