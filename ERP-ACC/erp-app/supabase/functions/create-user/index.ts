// Edge Function: create-user
// Creates a new Supabase auth user and sets their role in profiles.
// Only callable by authenticated admin users.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const VALID_ROLES = ['admin', 'staff', 'viewer']

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Decode JWT payload and return the user's UUID (sub).
// Returns null for anon key, service role key, or malformed tokens.
// Safe to call without re-verification when verify_jwt:true handles the signature check.
function extractUserId(authHeader: string): string | null {
  try {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded))
    // User session tokens have role:'authenticated' and a UUID sub.
    // Anon key tokens have role:'anon'; service role tokens have role:'service_role'.
    if (!payload.sub || payload.role !== 'authenticated') return null
    return payload.sub as string
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    // 1. Extract and decode JWT — gateway (verify_jwt:true) already verified the signature
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401)
    }
    const callerId = extractUserId(authHeader)
    if (!callerId) {
      return jsonResponse({ error: 'Autentikasi gagal: diperlukan user session yang aktif' }, 401)
    }

    // 2. Create admin client for privileged operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Server misconfigured: missing env vars' }, 500)
    }
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    // 3. Check caller is an active admin
    const { data: callerProfile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('role, is_active')
      .eq('id', callerId)
      .single()

    if (profileErr || !callerProfile) {
      return jsonResponse({ error: 'Caller profile not found' }, 403)
    }
    if (callerProfile.role !== 'admin' || !callerProfile.is_active) {
      return jsonResponse({ error: 'Forbidden: admin role required' }, 403)
    }

    // 4. Parse and validate request body
    let body: { email?: string; password?: string; full_name?: string; role?: string }
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    const email = (body.email ?? '').trim()
    const password = body.password ?? ''
    const full_name = (body.full_name ?? '').trim()
    const role = body.role ?? ''

    if (!email) return jsonResponse({ error: 'Email wajib diisi' }, 400)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: 'Format email tidak valid' }, 400)
    }
    if (password.trim().length < 6) {
      return jsonResponse({ error: 'Password minimal 6 karakter' }, 400)
    }
    if (!full_name) return jsonResponse({ error: 'Nama lengkap wajib diisi' }, 400)
    if (!VALID_ROLES.includes(role)) {
      return jsonResponse({ error: 'Role harus admin, staff, atau viewer' }, 400)
    }

    // 5. Create auth user (email_confirm: true → skip email verification)
    const { data: createdData, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      })

    if (createErr || !createdData?.user) {
      return jsonResponse(
        { error: createErr?.message ?? 'Gagal membuat user' },
        400,
      )
    }
    const newUserId = createdData.user.id

    // 6. Update profile with the requested role
    //    (handle_new_user trigger already created the row with default role 'viewer')
    const { error: updateErr } = await supabaseAdmin
      .from('profiles')
      .upsert({ id: newUserId, full_name, role })

    if (updateErr) {
      // Rollback: delete the auth user to avoid orphaned accounts
      const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(newUserId)
      if (deleteErr) {
        console.error('Rollback failed — orphaned auth user:', newUserId, deleteErr.message)
      }
      return jsonResponse(
        { error: 'Gagal set role user: ' + updateErr.message },
        500,
      )
    }

    // 7. Success
    return jsonResponse(
      {
        success: true,
        user: {
          id: newUserId,
          email,
          full_name,
          role,
        },
      },
      200,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return jsonResponse({ error: message }, 500)
  }
})
