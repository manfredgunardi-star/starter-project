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

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    // 1. Extract JWT from Authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401)
    }
    const token = authHeader.replace('Bearer ', '')

    // 2. Create admin client using service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Server misconfigured: missing env vars' }, 500)
    }
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    // 3. Verify caller's JWT and get their user record
    const { data: callerData, error: callerErr } = await supabaseAdmin.auth.getUser(token)
    if (callerErr || !callerData?.user) {
      return jsonResponse({ error: 'Invalid or expired session' }, 401)
    }
    const caller = callerData.user

    // 4. Check caller is an active admin
    const { data: callerProfile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('role, is_active')
      .eq('id', caller.id)
      .single()

    if (profileErr || !callerProfile) {
      return jsonResponse({ error: 'Caller profile not found' }, 403)
    }
    if (callerProfile.role !== 'admin' || !callerProfile.is_active) {
      return jsonResponse({ error: 'Forbidden: admin role required' }, 403)
    }

    // 5. Parse and validate request body
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
    if (password.length < 6) {
      return jsonResponse({ error: 'Password minimal 6 karakter' }, 400)
    }
    if (!full_name) return jsonResponse({ error: 'Nama lengkap wajib diisi' }, 400)
    if (!VALID_ROLES.includes(role)) {
      return jsonResponse({ error: 'Role harus admin, staff, atau viewer' }, 400)
    }

    // 6. Create auth user (email_confirm: true → skip email verification)
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

    // 7. Update profile with the requested role
    //    (handle_new_user trigger already created the row with default role 'viewer')
    const { error: updateErr } = await supabaseAdmin
      .from('profiles')
      .update({ full_name, role })
      .eq('id', newUserId)

    if (updateErr) {
      // Rollback: delete the auth user to avoid orphaned accounts
      await supabaseAdmin.auth.admin.deleteUser(newUserId)
      return jsonResponse(
        { error: 'Gagal set role user: ' + updateErr.message },
        500,
      )
    }

    // 8. Success
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
