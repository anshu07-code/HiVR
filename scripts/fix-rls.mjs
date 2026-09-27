import pg from "pg";

const { Pool } = pg;

// One-off DB maintenance script.
// Credentials MUST come from the environment — never hardcode secrets.
// Usage (PowerShell):
//   $env:PGHOST="db.<project-ref>.supabase.co"
//   $env:PGPASSWORD="$env:SUPABASE_SERVICE_ROLE_KEY"
//   node scripts/fix-rls.mjs

const required = ["PGHOST", "PGPASSWORD"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing env var: ${key}`);
    process.exit(1);
  }
}

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "postgres",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

async function main() {
  try {
    const client = await pool.connect();
    console.log("Connected!");

    // Drop and recreate trigger function with security definer
    await client.query(`
      create or replace function public.apply_points_ledger()
      returns trigger language plpgsql security definer set search_path = public as $$
      begin
        insert into public.loyalty_points(employee_id, points_balance, lifetime_points_earned)
        values (new.employee_id, greatest(0, new.change_amount), greatest(0, new.change_amount))
        on conflict (employee_id) do update set
          points_balance = greatest(0, public.loyalty_points.points_balance + new.change_amount),
          lifetime_points_earned = greatest(0, public.loyalty_points.lifetime_points_earned
                                    + greatest(0, new.change_amount));
        return new;
      end $$;
    `);
    console.log("Trigger function redefined with security definer!");

    client.release();
  } catch (err) {
    console.error("Failed:", err.message);
    process.exitCode = 1;
  }
  await pool.end();
}
main();
