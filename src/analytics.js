// Free Cloudflare Web Analytics. This public site token is not an API secret.
// Limit collection to the live site; previews and local playtests stay excluded.
if (import.meta.env.PROD && ['pixelplanes.app', 'www.pixelplanes.app'].includes(window.location.hostname)) {
  const beacon = document.createElement('script');
  beacon.type = 'module';
  beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  beacon.setAttribute('data-cf-beacon', JSON.stringify({token: '87cfe6af45a945ed85eb746868770e3d'}));
  document.body.appendChild(beacon);
}
