import { readFileSync, existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { OmniLogin } from '@omnilogin/sdk';

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: {
      id: number;
    };
    from?: {
      username?: string;
      first_name?: string;
    };
  };
};

type RunState = {
  active: boolean;
  startedAt?: string;
  command?: string;
  profiles?: number[];
  lastMessage?: string;
};

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
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function parsePositiveInt(value: string | undefined, fallback?: number) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return fallback;
}

function parseArgs(text: string) {
  const args: Record<string, string> = {};
  const parts = text.split(/\s+/).slice(1);
  for (const part of parts) {
    const [key, ...rest] = part.split('=');
    if (!key || rest.length === 0) continue;
    args[key.toLowerCase()] = rest.join('=').trim();
  }
  return args;
}

function parseProfiles(args: Record<string, string>) {
  const raw = args.profiles || args.profile;
  if (!raw) return [];

  return raw
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item > 0);
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function code(value: unknown) {
  return `<code>${escapeHtml(value)}</code>`;
}

class TelegramClient {
  constructor(private readonly token: string) {}

  private async request<T>(method: string, body: Record<string, unknown>) {
    const response = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    const payload = (await response.json()) as { ok: boolean; result?: T; description?: string };
    if (!response.ok || !payload.ok) {
      throw new Error(payload.description || `Telegram API failed: ${method}`);
    }

    return payload.result as T;
  }

  getUpdates(offset: number) {
    return this.request<TelegramUpdate[]>('getUpdates', {
      offset,
      timeout: 30,
      allowed_updates: ['message'],
    });
  }

  sendMessage(chatId: number, text: string) {
    return this.request('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  }
}

function helpText() {
  return [
    '<b>Bot điều khiển Omnilogin</b>',
    '',
    '<b>Lệnh hỗ trợ</b>',
    `${code('/run profile=1')} - chạy 1 profile`,
    `${code('/run profiles=1,2 delay=60')} - chạy nhiều profile, nghỉ giữa mỗi profile`,
    `${code('/status')} - xem trạng thái hiện tại`,
    `${code('/stop')} - dừng AI App`,
    `${code('/help')} - xem hướng dẫn`,
    '',
    '<b>AI App mặc định</b>',
    code(process.env.AI_APP_ID?.trim() || 'khaihoan-derma-rank-qa'),
  ].join('\n');
}

async function runAiAppForProfiles(
  telegram: TelegramClient,
  chatId: number,
  omni: OmniLogin,
  appId: string,
  profiles: number[],
  delaySeconds: number,
  state: RunState,
) {
  state.active = true;
  state.startedAt = new Date().toISOString();
  state.profiles = profiles;

  try {
    for (let index = 0; index < profiles.length; index++) {
      const profileId = profiles[index];
      state.lastMessage = `Đang chạy profile ${profileId}`;
      await telegram.sendMessage(
        chatId,
        [
          '<b>Bắt đầu chạy AI App</b>',
          `Ứng dụng: ${code(appId)}`,
          `Profile: ${code(profileId)}`,
          `Thứ tự: ${code(`${index + 1}/${profiles.length}`)}`,
        ].join('\n'),
      );

      const result = await omni.aiApps.run(appId, {
        profileId,
        mode: 'debug',
      });

      if (!result.ok) {
        await telegram.sendMessage(
          chatId,
          [
            '<b>Profile chạy lỗi</b>',
            `Profile: ${code(profileId)}`,
            `Lỗi: ${code(result.error || 'không rõ lỗi')}`,
          ].join('\n'),
        );
      } else {
        await telegram.sendMessage(
          chatId,
          [
            '<b>Đã gửi lệnh chạy</b>',
            `Profile: ${code(profileId)}`,
            'Omnilogin đang xử lý AI App trong nền.',
          ].join('\n'),
        );
      }

      if (index < profiles.length - 1 && delaySeconds > 0) {
        state.lastMessage = `Nghỉ ${delaySeconds}s trước profile tiếp theo`;
        await telegram.sendMessage(
          chatId,
          [
            '<b>Tạm nghỉ giữa profile</b>',
            `Thời gian nghỉ: ${code(`${delaySeconds} giây`)}`,
            `Profile tiếp theo: ${code(profiles[index + 1])}`,
          ].join('\n'),
        );
        await delay(delaySeconds * 1000);
      }
    }

    state.lastMessage = 'Hoàn tất hàng đợi profile';
    await telegram.sendMessage(
      chatId,
      [
        '<b>Hoàn tất hàng đợi</b>',
        `AI App: ${code(appId)}`,
        `Profiles: ${code(profiles.join(', '))}`,
      ].join('\n'),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.lastMessage = message;
    await telegram.sendMessage(
      chatId,
      [
        '<b>Lỗi khi chạy AI App</b>',
        `Chi tiết: ${code(message)}`,
      ].join('\n'),
    );
  } finally {
    state.active = false;
  }
}

async function main() {
  loadEnvFile();

  const token = requiredEnv('TELEGRAM_BOT_TOKEN');
  const allowedChatId = Number(requiredEnv('TELEGRAM_ALLOWED_CHAT_ID'));
  const appId = process.env.AI_APP_ID?.trim() || 'khaihoan-derma-rank-qa';
  const defaultProfileId = parsePositiveInt(process.env.DEFAULT_PROFILE_ID, 1) || 1;
  const defaultDelaySeconds = parsePositiveInt(process.env.DEFAULT_PROFILE_DELAY_SECONDS, 60) || 60;
  const omniHost = process.env.OMNILOGIN_HOST?.trim() || 'http://localhost:35353';

  const telegram = new TelegramClient(token);
  const omni = new OmniLogin({ host: omniHost, timeout: 60_000 });
  const state: RunState = { active: false };
  let offset = 0;

  console.log(`Telegram bot started. AI_APP_ID=${appId}, OMNILOGIN_HOST=${omniHost}`);
  await telegram
    .sendMessage(
      allowedChatId,
      [
        '<b>Bot đã sẵn sàng</b>',
        `AI App: ${code(appId)}`,
        `Omnilogin: ${code(omniHost)}`,
        '',
        `Gõ ${code('/help')} để xem lệnh hỗ trợ.`,
      ].join('\n'),
    )
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Startup message was not delivered: ${message}`);
      console.warn('Open Telegram and send /start to the bot once, then commands will work.');
    });

  while (true) {
    try {
      const updates = await telegram.getUpdates(offset);
      for (const update of updates) {
        offset = update.update_id + 1;
        const message = update.message;
        const text = message?.text?.trim();
        const chatId = message?.chat.id;
        if (!message || !text || !chatId) continue;

        if (chatId !== allowedChatId) {
          await telegram.sendMessage(
            chatId,
            [
              '<b>Không có quyền truy cập</b>',
              'Chat này không được phép điều khiển bot.',
            ].join('\n'),
          );
          continue;
        }

        if (text.startsWith('/help') || text.startsWith('/start')) {
          await telegram.sendMessage(chatId, helpText());
          continue;
        }

        if (text.startsWith('/status')) {
          await telegram.sendMessage(
            chatId,
            state.active
              ? [
                  '<b>Trạng thái: Đang chạy</b>',
                  `Bắt đầu lúc: ${code(state.startedAt || '')}`,
                  `Profiles: ${code(state.profiles?.join(', ') || '')}`,
                  `Ghi chú: ${code(state.lastMessage || '')}`,
                ].join('\n')
              : [
                  '<b>Trạng thái: Đang rảnh</b>',
                  `Ghi chú gần nhất: ${code(state.lastMessage || 'chưa có')}`,
                ].join('\n'),
          );
          continue;
        }

        if (text.startsWith('/stop')) {
          await omni.aiApps.stop(appId);
          state.active = false;
          state.lastMessage = 'Đã gửi lệnh dừng';
          await telegram.sendMessage(
            chatId,
            [
              '<b>Đã gửi lệnh dừng</b>',
              `AI App: ${code(appId)}`,
            ].join('\n'),
          );
          continue;
        }

        if (text.startsWith('/run')) {
          if (state.active) {
            await telegram.sendMessage(
              chatId,
              [
                '<b>Bot đang bận</b>',
                `Dùng ${code('/status')} để xem trạng thái.`,
                `Dùng ${code('/stop')} nếu cần dừng AI App.`,
              ].join('\n'),
            );
            continue;
          }

          const args = parseArgs(text);
          const profiles = parseProfiles(args);
          if (profiles.length === 0) profiles.push(defaultProfileId);

          const delaySeconds = parsePositiveInt(args.delay, defaultDelaySeconds) || defaultDelaySeconds;
          state.command = text;
          void runAiAppForProfiles(telegram, chatId, omni, appId, profiles, delaySeconds, state);
          continue;
        }

        await telegram.sendMessage(
          chatId,
          [
            '<b>Không hiểu lệnh</b>',
            '',
            helpText(),
          ].join('\n'),
        );
      }
    } catch (error) {
      console.error(error);
      await delay(3000);
    }
  }
}

await main();
