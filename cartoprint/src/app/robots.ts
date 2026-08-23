import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/selftest', '/thumbnail-render', '/maps/custom'],
    },
    sitemap: 'https://cartoprint.vercel.app/sitemap.xml',
  };
}
