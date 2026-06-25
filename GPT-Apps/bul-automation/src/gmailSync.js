export function parseDecisionCommands(text) {
  const commands = [];
  const lines = String(text || '').split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim().toUpperCase();
    let match = /^MAP\s+([A-Z]-\d{6}-\d{3})\s+(\d{4})\/(\d{4})$/.exec(line);
    if (match) {
      commands.push({ action: 'MAP', id: match[1], debitAccount: match[2], creditAccount: match[3] });
      continue;
    }

    match = /^(KEEP|SKIP)\s+([A-Z]-\d{6}-\d{3})$/.exec(line);
    if (match) {
      commands.push({ action: match[1], id: match[2] });
    }
  }

  return commands;
}

export async function sendReportEmail({ to, subject, body, attachments = [], dryRun = false } = {}) {
  if (dryRun) {
    return { status: 'dry_run_email_skipped', to, subject };
  }
  const gmail = await getGmailClient();
  if (!gmail || !to) {
    return { status: 'gmail_not_configured', to: to || '', subject };
  }

  const raw = await buildMimeMessage({ to, subject, body, attachments });
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw }
  });
  return { status: 'sent', to, subject };
}

export async function syncGmailDecisions({ runId, dryRun = false } = {}) {
  const gmail = await getGmailClient();
  if (!gmail) {
    return {
      status: 'gmail_not_configured',
      runId,
      dryRun,
      commands: []
    };
  }

  const query = `subject:"BUL Automation ${runId}" newer_than:30d`;
  const list = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 20 });
  const commands = [];
  for (const message of list.data.messages || []) {
    const detail = await gmail.users.messages.get({ userId: 'me', id: message.id, format: 'full' });
    const text = extractMessageText(detail.data.payload);
    commands.push(...parseDecisionCommands(text));
  }

  return {
    status: 'ok',
    runId,
    dryRun,
    commands
  };
}

async function getGmailClient() {
  if (!process.env.GMAIL_CLIENT_SECRET || !process.env.GMAIL_TOKEN) return null;
  const fs = await import('node:fs/promises');
  const { google } = await import('googleapis');
  const secret = JSON.parse(await fs.readFile(process.env.GMAIL_CLIENT_SECRET, 'utf8'));
  const token = JSON.parse(await fs.readFile(process.env.GMAIL_TOKEN, 'utf8'));
  const clientInfo = secret.installed || secret.web;
  if (!clientInfo) return null;
  const auth = new google.auth.OAuth2(
    clientInfo.client_id,
    clientInfo.client_secret,
    (clientInfo.redirect_uris || [])[0]
  );
  auth.setCredentials(token);
  return google.gmail({ version: 'v1', auth });
}

async function buildMimeMessage({ to, subject, body, attachments }) {
  const fs = await import('node:fs/promises');
  const boundary = `bul_${Date.now()}`;
  const lines = [
    `To: ${to}`,
    `Subject: ${encodeHeader(subject || 'BUL Automation Report')}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    body || ''
  ];

  for (const file of attachments) {
    const content = await fs.readFile(file);
    const filename = file.split(/[\\/]/).pop();
    lines.push(
      `--${boundary}`,
      `Content-Type: ${mimeType(filename)}; name="${filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${filename}"`,
      '',
      content.toString('base64').replace(/.{1,76}/g, '$&\r\n').trim()
    );
  }
  lines.push(`--${boundary}--`, '');

  return Buffer.from(lines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function extractMessageText(part) {
  if (!part) return '';
  if (part.body?.data) {
    return Buffer.from(part.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  }
  return (part.parts || []).map(extractMessageText).join('\n');
}

function encodeHeader(value) {
  return `=?UTF-8?B?${Buffer.from(String(value), 'utf8').toString('base64')}?=`;
}

function mimeType(filename) {
  if (/\.xlsx$/i.test(filename)) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (/\.csv$/i.test(filename)) return 'text/csv';
  if (/\.txt$/i.test(filename)) return 'text/plain';
  return 'application/octet-stream';
}
