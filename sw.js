importScripts('/lib/workbox-v6.1.5/workbox-sw.js')

workbox.setConfig({
    modulePathPrefix: '/lib/workbox-v6.1.5/'
});

workbox.loadModule('workbox-strategies');
workbox.loadModule('workbox-precaching');
workbox.loadModule('workbox-routing');
workbox.loadModule('workbox-cacheable-response');
workbox.loadModule('workbox-expiration');




const { registerRoute, setCatchHandler } = workbox.routing;
const { precacheAndRoute, matchPrecache } = workbox.precaching;
const {
    NetworkFirst,
    StaleWhileRevalidate,
    CacheFirst,
} = workbox.strategies;

// Used for filtering matches based on status code, header, or both
const { CacheableResponsePlugin } = workbox.cacheableResponse;
// Used to limit entries in cache, remove entries after a certain period of time
const { ExpirationPlugin } = workbox.expiration;



// Cache page navigations (html) with a Network First strategy
registerRoute(
    // Check to see if the request is a navigation to a new page
    ({ request }) => request.mode === 'navigate',
    // Use a Network First caching strategy
    new NetworkFirst({
        // Put all cached files in a cache named 'pages'
        cacheName: 'pages',
        plugins: [
            // Ensure that only requests that result in a 200 status are cached
            new CacheableResponsePlugin({
                statuses: [200],
            }),
        ],
    }),
);

// Cache CSS, JS, and Web Worker requests with a Stale While Revalidate strategy
registerRoute(
    // Check to see if the request's destination is style for stylesheets, script for JavaScript, or worker for web worker
    ({ request, url }) =>
        request.destination === 'style' ||
        (request.destination === 'script' && request.url.indexOf('browser-sync-client.js') === -1) ||
        request.destination === 'worker',
    // Use a Stale While Revalidate caching strategy
    new StaleWhileRevalidate({
        // Put all cached files in a cache named 'assets'
        cacheName: 'assets',
        plugins: [
            // Ensure that only requests that result in a 200 status are cached
            new CacheableResponsePlugin({
                statuses: [200],
            }),
        ],
    }),
);

// Cache images with a Cache First strategy
registerRoute(
    // Check to see if the request's destination is style for an image
    ({ request }) => request.destination === 'image',
    // Use a Cache First caching strategy
    new CacheFirst({
        // Put all cached files in a cache named 'images'
        cacheName: 'images',
        plugins: [
            // Ensure that only requests that result in a 200 status are cached
            new CacheableResponsePlugin({
                statuses: [200],
            }),
            // Don't cache more than 50 items, and expire them after 30 days
            new ExpirationPlugin({
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 Days
            }),
        ],
    }),
);

precacheAndRoute([
    '/offline.html'
])
// Replace with your URLs.
workbox.recipes.offlineFallback({
    pageFallback: '/offline.html',
    // imageFallback: '/offline.png'
});