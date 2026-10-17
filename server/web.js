// Plain-HTTP side of the relay: the download page, download redirects, health check.

const fs = require('node:fs');
const path = require('node:path');

const PAGE_PATH = path.join(__dirname, '..', 'web', 'index.html');
const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;
// Fixed installer names (see "artifactName" in package.json), so "latest" links never change.
const ASSETS = { mac: 'Nolleowa-mac.dmg', win: 'Nolleowa-Setup.exe' };

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

function downloadUrl(repo, platform) {
  if (!REPO_PATTERN.test(repo || '') || !ASSETS[platform]) return null;
  return `https://github.com/${repo}/releases/latest/download/${ASSETS[platform]}`;
}

function createWebHandler({ repo = process.env.GITHUB_REPO } = {}) {
  const page = fs.readFileSync(PAGE_PATH);

  return function handle(req, res) {
    const { pathname } = new URL(req.url, 'http://localhost');
    const reply = (status, headers, body) => {
      res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
      res.end(body);
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') return reply(405, { allow: 'GET, HEAD' }, '');
    if (pathname === '/health') return reply(200, { 'content-type': 'text/plain' }, 'ok');
    if (pathname === '/') {
      return reply(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:",
        'cache-control': 'public, max-age=300',
      }, page);
    }
    const match = pathname.match(/^\/download\/(mac|win)$/);
    if (match) {
      const target = downloadUrl(repo, match[1]);
      if (target) return reply(302, { location: target }, '');
      return reply(503, { 'content-type': 'text/plain; charset=utf-8' }, '아직 다운로드 준비 중이에요.');
    }
    return reply(404, { 'content-type': 'text/plain; charset=utf-8' }, 'not found');
  };
}

module.exports = { createWebHandler, downloadUrl };
