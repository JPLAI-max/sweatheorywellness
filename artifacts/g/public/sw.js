const SHARE_CACHE = 'gooncity-share-v1';
const META_KEY = 'share-meta';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname === '/share-target' && event.request.method === 'POST') {
    event.respondWith(handleSharePost(event.request));
  }
});

async function handleSharePost(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('media');
    const title = formData.get('title') ?? '';
    const text = formData.get('text') ?? '';

    const cache = await caches.open(SHARE_CACHE);

    // Clear any previous share data
    const oldKeys = await cache.keys();
    await Promise.all(oldKeys.map((k) => cache.delete(k)));

    const fileKeys = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!(file instanceof File)) continue;
      const key = `share-file-${i}`;
      await cache.put(
        key,
        new Response(file, {
          headers: {
            'Content-Type': file.type || 'image/jpeg',
            'X-File-Name': encodeURIComponent(file.name || `image-${i}.jpg`),
          },
        })
      );
      fileKeys.push(key);
    }

    await cache.put(
      META_KEY,
      new Response(JSON.stringify({ fileKeys, title: String(title), text: String(text) }), {
        headers: { 'Content-Type': 'application/json' },
      })
    );
  } catch (err) {
    console.error('[SW] share handling failed', err);
  }

  return Response.redirect('/share-target', 303);
}
