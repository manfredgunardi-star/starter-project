function decodeBasicCredentials(authorizationHeader) {
  const match = /^Basic\s+(.+)$/i.exec(authorizationHeader || '');
  if (!match) return null;

  try {
    const decoded = atob(match[1]);
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex < 0) return null;

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

function constantTimeEqual(left, right) {
  const leftText = String(left || '');
  const rightText = String(right || '');
  let diff = leftText.length ^ rightText.length;
  const maxLength = Math.max(leftText.length, rightText.length);

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (leftText.charCodeAt(index) || 0) ^ (rightText.charCodeAt(index) || 0);
  }

  return diff === 0;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function isBasicAuthAuthorized({ authorizationHeader, expectedUsername, expectedPassword }) {
  if (!expectedPassword) return false;

  const credentials = decodeBasicCredentials(authorizationHeader);
  if (!credentials) return false;

  return constantTimeEqual(credentials.username, expectedUsername || 'erp') && constantTimeEqual(credentials.password, expectedPassword);
}

export async function isBasicAuthAuthorizedByHash({ authorizationHeader, expectedUsername, expectedPasswordHash }) {
  if (!expectedPasswordHash) return false;

  const credentials = decodeBasicCredentials(authorizationHeader);
  if (!credentials || !constantTimeEqual(credentials.username, expectedUsername || 'erp')) return false;

  return constantTimeEqual(await sha256Hex(credentials.password), expectedPasswordHash);
}

function unauthorizedResponse() {
  return new Response('Staging access required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Mini ERP Staging", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  });
}

export default async function stagingBasicAuth(request, context) {
  const expectedUsername = Netlify.env.get('STAGING_BASIC_AUTH_USERNAME') || 'erp';
  const expectedPassword = Netlify.env.get('STAGING_BASIC_AUTH_PASSWORD');
  const expectedPasswordHash =
    Netlify.env.get('STAGING_BASIC_AUTH_PASSWORD_SHA256') || '526ef3c58e1b85252889564c52dc8e509c8f1cff6dbf375d4b86c5d2191e309f';

  const authorized = expectedPassword
    ? isBasicAuthAuthorized({
      authorizationHeader: request.headers.get('authorization'),
      expectedUsername,
      expectedPassword,
    })
    : await isBasicAuthAuthorizedByHash({
      authorizationHeader: request.headers.get('authorization'),
      expectedUsername,
      expectedPasswordHash,
    });

  if (!authorized) {
    return unauthorizedResponse();
  }

  return context.next();
}

export const config = {
  path: '/*',
};
