#!/usr/bin/env node
// Creates the first Super Admin (Paolo) with a one-time temporary password.
// The account must choose a new password at first sign-in before it gets
// any access.
//
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/seed-super-admin.mjs [email] [full name]
//
// The service-role key is a master key: run this on your own computer,
// never commit the key, never put it in the browser app.

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}

const email = (process.argv[2] ?? "paolo@ask-karla.com").toLowerCase();
const fullName = process.argv[3] ?? "Paolo";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const bytes = randomBytes(16);
const tempPassword =
  Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("") + `-${bytes[0] % 10}!`;

const admin = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await admin.auth.admin.createUser({
  email,
  password: tempPassword,
  email_confirm: true,
  app_metadata: {
    z1_role: "super_admin",
    z1_full_name: fullName,
    z1_force_password_change: true,
  },
});

if (error) {
  console.error(`Could not create ${email}: ${error.message}`);
  process.exit(1);
}

console.log(`
Super Admin created
  email:              ${email}
  user id:            ${data.user.id}
  temporary password: ${tempPassword}

Sign in at your app's /login. You will be asked to choose a new password
before anything else opens. This password is shown only once.
`);
