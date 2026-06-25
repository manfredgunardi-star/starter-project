const validRoles = new Set(['owner', 'admin', 'accounting', 'staff', 'reader']);
const supportedExtraPermissions = new Set(['approval:self-approve']);

function trimText(value) {
  return String(value || '').trim();
}

function uniqueSortedPermissions(permissions) {
  return [...new Set(permissions || [])].map(trimText).filter(Boolean).sort();
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function getBearerToken(request) {
  const authorization = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1] || '';
}

function requireEnv(name) {
  const value = Netlify.env.get(name);
  if (!value) throw new Error(`${name} belum dikonfigurasi di Netlify env.`);
  return value;
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function supabaseFetch({ supabaseUrl, apiKey, token = apiKey, path, method = 'GET', body, headers = {} }) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await readJsonResponse(response);

  if (!response.ok) {
    const message = data?.message || data?.error_description || data?.error || `Supabase request failed with ${response.status}.`;
    throw new Error(message);
  }

  return data;
}

export function normalizeCompanyMemberRequest(payload) {
  const companyId = trimText(payload?.companyId);
  const userId = trimText(payload?.userId);
  const email = trimText(payload?.email || (!userId && String(payload?.identifier || '').includes('@') ? payload.identifier : '')).toLowerCase();
  const identifier = (userId || email || trimText(payload?.identifier)).toLowerCase();
  const role = payload?.role || 'reader';
  const permissions = uniqueSortedPermissions(payload?.permissions);
  const unsupportedPermissions = permissions.filter((permission) => !supportedExtraPermissions.has(permission));

  if (!companyId) throw new Error('Company wajib diisi.');
  if (!identifier) throw new Error('Email atau user ID target wajib diisi.');
  if (!validRoles.has(role)) throw new Error('Role tidak didukung.');
  if (unsupportedPermissions.length) {
    throw new Error(`Permission tambahan tidak didukung: ${unsupportedPermissions.join(', ')}`);
  }

  return {
    companyId,
    identifier,
    email,
    displayName: trimText(payload?.displayName),
    role,
    permissions,
    isActive: payload?.isActive !== false,
  };
}

async function findProfileByIdentifier(serviceClient, identifier) {
  const url = new URL(`${serviceClient.supabaseUrl}/rest/v1/profiles`);
  url.searchParams.set('select', 'id,email,display_name');
  url.searchParams.set('limit', '1');
  url.searchParams.set(identifier.includes('@') ? 'email' : 'id', `${identifier.includes('@') ? 'ilike' : 'eq'}.${identifier}`);

  const response = await fetch(url, {
    headers: {
      apikey: serviceClient.apiKey,
      Authorization: `Bearer ${serviceClient.apiKey}`,
    },
  });
  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(data?.message || 'Gagal membaca profile target.');
  return data?.[0] || null;
}

async function ensureProfileForInvite({ serviceClient, request }) {
  const existingProfile = await findProfileByIdentifier(serviceClient, request.identifier);
  if (existingProfile) return existingProfile;

  if (!request.email) {
    throw new Error('Profile target tidak ditemukan. Gunakan email untuk mengirim invite user baru.');
  }

  const inviteData = await supabaseFetch({
    supabaseUrl: serviceClient.supabaseUrl,
    apiKey: serviceClient.apiKey,
    path: '/auth/v1/invite',
    method: 'POST',
    body: {
      email: request.email,
      data: {
        display_name: request.displayName || request.email,
      },
    },
  });

  const invitedUser = inviteData?.user || inviteData;
  if (!invitedUser?.id) throw new Error('Supabase tidak mengembalikan user hasil invite.');

  const profiles = await supabaseFetch({
    supabaseUrl: serviceClient.supabaseUrl,
    apiKey: serviceClient.apiKey,
    path: '/rest/v1/profiles?on_conflict=id&select=id,email,display_name',
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: {
      id: invitedUser.id,
      email: request.email,
      display_name: request.displayName || request.email,
      is_active: true,
    },
  });

  return Array.isArray(profiles) ? profiles[0] : profiles;
}

export default async function companyMembers(request) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const token = getBearerToken(request);
    if (!token) return jsonResponse({ error: 'Bearer token wajib dikirim.' }, 401);

    const supabaseUrl = requireEnv('VITE_SUPABASE_URL');
    const supabaseAnonKey = requireEnv('VITE_SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const payload = normalizeCompanyMemberRequest(await request.json());
    const serviceClient = {
      supabaseUrl,
      apiKey: supabaseServiceRoleKey,
    };

    const currentUser = await supabaseFetch({
      supabaseUrl,
      apiKey: supabaseAnonKey,
      token,
      path: '/auth/v1/user',
    });

    if (!currentUser?.id) return jsonResponse({ error: 'Session tidak valid.' }, 401);

    const canManageUsers = await supabaseFetch({
      supabaseUrl,
      apiKey: supabaseAnonKey,
      token,
      path: '/rest/v1/rpc/has_company_permission',
      method: 'POST',
      body: {
        p_company_id: payload.companyId,
        p_permission: 'users:manage',
      },
    });

    if (!canManageUsers) return jsonResponse({ error: 'Anda tidak memiliki permission users:manage.' }, 403);

    const profile = await ensureProfileForInvite({ serviceClient, request: payload });
    const member = await supabaseFetch({
      supabaseUrl,
      apiKey: supabaseAnonKey,
      token,
      path: '/rest/v1/rpc/save_company_member',
      method: 'POST',
      body: {
        p_company_id: payload.companyId,
        p_identifier: profile.id,
        p_role: payload.role,
        p_extra_permissions: payload.permissions,
        p_is_active: payload.isActive,
      },
    });

    return jsonResponse({
      member,
      profile,
      invited: profile.email?.toLowerCase() === payload.email && profile.id !== payload.identifier,
    });
  } catch (error) {
    return jsonResponse({ error: error.message || 'Gagal menyimpan company member.' }, 400);
  }
}

export const config = {
  path: '/api/admin/company-members',
  method: ['POST'],
};
