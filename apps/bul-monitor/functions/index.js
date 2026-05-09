const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const ALLOWED_ROLES = ["superadmin", "admin_sj", "admin_keuangan", "admin_invoice", "owner", "reader"]; 

function assertSuperAdmin(context) {
  if (!context.auth || context.auth.token.role !== "superadmin") {
    throw new functions.https.HttpsError("permission-denied", "Superadmin only");
  }
}

exports.setUserRole = functions.https.onCall(async (data, context) => {
  assertSuperAdmin(context);

  const uid = String(data?.uid || "").trim();
  const role = String(data?.role || "").trim();

  if (!uid) throw new functions.https.HttpsError("invalid-argument", "uid is required");
  if (!ALLOWED_ROLES.includes(role)) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid role");
  }

  await admin.auth().setCustomUserClaims(uid, { role });
  return { ok: true };
});

exports.createUserWithRole = functions.https.onCall(async (data, context) => {
  assertSuperAdmin(context);

  const username = String(data?.username || "").trim();
  const password = String(data?.password || "").trim();
  const role = String(data?.role || "").trim();
  const name = String(data?.name || "").trim();

  if (!username || !password || !role || !name) {
    throw new functions.https.HttpsError("invalid-argument", "username, password, role, name are required");
  }
  if (!ALLOWED_ROLES.includes(role)) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid role");
  }

  const email = username.includes("@") ? username : `${username}@app.local`;

  let userRecord;
  try {
    userRecord = await admin.auth().createUser({ email, password, displayName: name });
  } catch (e) {
    // If email already exists, surface a nicer error
    if (e?.code === "auth/email-already-exists") {
      throw new functions.https.HttpsError("already-exists", "Email already exists");
    }
    throw new functions.https.HttpsError("internal", e?.message || "Failed to create user");
  }

  await admin.auth().setCustomUserClaims(userRecord.uid, { role });

  // Optional: keep a profile doc for admin UI
  await admin.firestore().collection("users").doc(userRecord.uid).set({
    id: userRecord.uid,
    uid: userRecord.uid,
    username: username.includes("@") ? username.split("@")[0] : username,
    email,
    name,
    role,
    isActive: true,
    createdAt: new Date().toISOString(),
    createdByUid: context.auth.uid
  }, { merge: true });

  return { ok: true, uid: userRecord.uid, email };
});
