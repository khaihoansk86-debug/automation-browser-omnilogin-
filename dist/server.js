import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appConfig } from './config.js';
import { listProfiles, readKeywords, runBatchGoogleSearchWorkflow, runGoogleSearchWorkflow, } from './workflow.js';
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(__dirname, '..', 'public');
function sendJson(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
}
function readRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk;
            if (body.length > 1_000_000) {
                req.destroy(new Error('Request body too large'));
            }
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}
const mimeByExt = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
};
const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        if (req.method === 'GET' && url.pathname === '/api/config') {
            sendJson(res, 200, {
                defaultKeyword: appConfig.defaultKeyword,
                omniloginHost: appConfig.omniloginHost,
                closeProfileAfterRun: appConfig.closeProfileAfterRun,
                keywordFilePath: appConfig.keywordFilePath,
                targetDomain: appConfig.targetDomain,
                targetBaseUrl: appConfig.targetBaseUrl,
                siteQaMaxSeconds: appConfig.siteQaMaxSeconds,
            });
            return;
        }
        if (req.method === 'GET' && url.pathname === '/api/keywords') {
            const keywords = await readKeywords();
            sendJson(res, 200, {
                count: keywords.length,
                preview: keywords.slice(0, 10),
            });
            return;
        }
        if (req.method === 'GET' && url.pathname === '/api/profiles') {
            const profiles = await listProfiles();
            sendJson(res, 200, profiles.map((profile) => ({
                id: profile.id,
                name: profile.name,
                group: profile.group?.name || '',
                tags: profile.tags || [],
                lastVisit: profile.last_visit || '',
            })));
            return;
        }
        if (req.method === 'POST' && url.pathname === '/api/run') {
            const body = JSON.parse(await readRequestBody(req));
            const profileId = Number(body.profileId);
            if (!Number.isInteger(profileId) || profileId <= 0) {
                sendJson(res, 400, { error: 'Vui long chon profile Omnilogin hop le.' });
                return;
            }
            const result = await runGoogleSearchWorkflow({
                keyword: typeof body.keyword === 'string' ? body.keyword : '',
                profileId,
                useRandomKeyword: body.useRandomKeyword === true,
            });
            sendJson(res, 200, result);
            return;
        }
        if (req.method === 'POST' && url.pathname === '/api/run-batch') {
            const body = JSON.parse(await readRequestBody(req));
            const profileIds = Array.isArray(body.profileIds) ? body.profileIds.map(Number) : [];
            const result = await runBatchGoogleSearchWorkflow({
                keyword: typeof body.keyword === 'string' ? body.keyword : '',
                profileIds,
                useRandomKeyword: body.useRandomKeyword === true,
                delaySeconds: Number(body.delaySeconds || 0),
            });
            sendJson(res, 200, result);
            return;
        }
        const fileName = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        const filePath = join(publicDir, fileName);
        const content = await readFile(filePath);
        res.writeHead(200, {
            'content-type': mimeByExt[extname(filePath)] || 'application/octet-stream',
        });
        res.end(content);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('ENOENT')) {
            sendJson(res, 404, { error: 'Not found' });
            return;
        }
        sendJson(res, 500, { error: message });
    }
});
server.listen(appConfig.serverPort, () => {
    console.log(`Control UI: http://localhost:${appConfig.serverPort}`);
    console.log(`OmniLogin REST host: ${appConfig.omniloginHost}`);
});
