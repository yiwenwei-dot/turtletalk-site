// Supabase Edge Function: notify-waitlist
// Triggered by a Database Webhook on INSERT into public.turtletalk_waitlist.
// Sends an email notification via Resend.
//
// Required secrets (set via `supabase secrets set ...`):
//   RESEND_API_KEY  — Resend API key
//   NOTIFY_TO       — destination email address
//   WEBHOOK_SECRET  — shared secret the DB webhook sends as `x-webhook-secret`

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const NOTIFY_TO = Deno.env.get("NOTIFY_TO");
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  if (WEBHOOK_SECRET && req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  if (!RESEND_API_KEY || !NOTIFY_TO) {
    return new Response("server misconfigured", { status: 500 });
  }

  const payload = await req.json().catch(() => null) as
    | { type?: string; record?: { email?: string; created_at?: string } }
    | null;

  const email = payload?.record?.email;
  if (!email) {
    return new Response("no email in payload", { status: 400 });
  }

  const createdAt = payload?.record?.created_at ?? new Date().toISOString();

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "TurtleTalk <onboarding@resend.dev>",
      to: [NOTIFY_TO],
      subject: `New TurtleTalk waitlist signup: ${email}`,
      html: `
        <p>A new family just joined the TurtleTalk waitlist 🐢</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>At:</b> ${createdAt}</p>
      `,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("resend error", res.status, text);
    return new Response(`resend error: ${text}`, { status: 502 });
  }

  return new Response("ok");
});
