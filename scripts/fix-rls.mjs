import pg from "pg";

const { Pool } = pg;

// Try connecting with service_role key as password
const pool = new Pool({
  host: "db.hcmlbktmdrtvyusucrzc.supabase.co",
  port: 5432,
  database: "postgres",
  user: "postgres",
  password: "REDACTED_SUPABASE_SERVICE_ROLE_KEY",
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
          lifetime_points_earned = public.loyalty_points.lifetime_points_earned
                                    + greatest(0, new.change_amount);
        return new;
      end $$;
    `);
    console.log("Trigger function redefined with security definer!");
    
    client.release();
  } catch (err) {
    console.error("Failed:", err.message);
  }
  await pool.end();
}
main();
