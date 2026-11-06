import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ABT Tournament',
    short_name: 'ABT',
    description: 'Agility Badminton Tournament (ABT)',
    start_url: '/',
    display: 'standalone',
    background_color: '#f4f6f9',
    theme_color: '#1454e6',
    icons: [
      { src: '/pwa-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/pwa-icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/pwa-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
