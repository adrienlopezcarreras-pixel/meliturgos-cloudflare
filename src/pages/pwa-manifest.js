export const PWA_MANIFEST = Object.freeze({
  name: 'MEL',
  short_name: 'MEL',
  description: 'Compagnon MEL',
  start_url: '/mvp',
  scope: '/',
  display: 'standalone',
  background_color: '#0b1020',
  theme_color: '#0b1020',
  lang: 'fr-FR',
  icons: [
    {
      src: '/assets/avatars/mel-full.webp?v=mel-techno-20260924',
      sizes: '512x512',
      type: 'image/webp',
      purpose: 'any maskable',
    },
  ],
});

export const PWA_MANIFEST_JSON = JSON.stringify(PWA_MANIFEST);
