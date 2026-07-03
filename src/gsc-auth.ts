import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';

const REDIRECT_PORT = Number(process.env.GSC_OAUTH_PORT || 53682);
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

function loadEnvFile(path = '.env') {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex <= 0) continue;
    const key = trimmed.slice(0, equalIndex).trim();
    const value = trimmed.slice(equalIndex + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Thieu bien moi truong: ${name}`);
  return value;
}

async function exchangeCode(code: string) {
  const body = new URLSearchParams({
    code,
    client_id: requiredEnv('GSC_CLIENT_ID'),
    client_secret: requiredEnv('GSC_CLIENT_SECRET'),
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(payload));
  return payload as { refresh_token?: string; access_token?: string };
}

loadEnvFile();

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', requiredEnv('GSC_CLIENT_ID'));
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPE);
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');

console.log('Mo link nay de cap quyen GSC:');
console.log(authUrl.href);
console.log('');
console.log(`Dang cho callback tai ${REDIRECT_URI}`);

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', REDIRECT_URI);
    const code = url.searchParams.get('code');
    if (!code) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Khong co code OAuth.');
      return;
    }

    const token = await exchangeCode(code);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<h2>Đã cấp quyền xong</h2><p>Bạn có thể quay lại PowerShell.</p>');
    console.log('');
    console.log('Them dong nay vao .env:');
    console.log(`GSC_REFRESH_TOKEN=${token.refresh_token || ''}`);
    server.close();
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(error instanceof Error ? error.message : String(error));
    console.error(error instanceof Error ? error.message : String(error));
  }
});

server.listen(REDIRECT_PORT, '127.0.0.1');
