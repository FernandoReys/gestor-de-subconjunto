'use strict';
// No browser-side OpenAI/Google API access. OAuth uses top-level navigation.
const csp="default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
const headers={'Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=()','Cross-Origin-Opener-Policy':'same-origin','X-DNS-Prefetch-Control':'off'};
function apply(res,secure=false){for(const[key,value]of Object.entries(headers))res.setHeader(key,value);if(secure)res.setHeader('Strict-Transport-Security','max-age=31536000');}
module.exports={headers,csp,apply};
