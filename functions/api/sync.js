export async function onRequest(context) {
  const { request, env } = context;

  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // POST — lưu data lên D1
    if (request.method === "POST") {
      const body = await request.json();
      const { device_id, data } = body;

      if (!device_id || !data) {
        return new Response(JSON.stringify({ error: "Missing device_id or data" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const now = Date.now();
      await env.DB.prepare(
        "INSERT INTO progress (device_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(device_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at"
      )
        .bind(device_id, JSON.stringify(data), now)
        .run();

      return new Response(JSON.stringify({ success: true, updated_at: now }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GET — lấy data từ D1
    if (request.method === "GET") {
      const url = new URL(request.url);
      const device_id = url.searchParams.get("device_id");

      if (!device_id) {
        return new Response(JSON.stringify({ error: "Missing device_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await env.DB.prepare(
        "SELECT data, updated_at FROM progress WHERE device_id = ?"
      )
        .bind(device_id)
        .first();

      if (!result) {
        return new Response(JSON.stringify({ data: null }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        data: JSON.parse(result.data),
        updated_at: result.updated_at
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}