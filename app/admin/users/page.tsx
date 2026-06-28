import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, timeAgo } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin-auth";

export default async function AdminUsers({ searchParams }: { searchParams: { q?: string } }) {
  await requireAdmin();
  const sb = createClient();
  const q = searchParams.q ?? "";
  let query = sb.from("users").select("id, full_name, email, roles, is_suspended, created_at, last_active").order("last_active", { ascending: false }).limit(50);
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  const { data: users } = await query;

  return (
    <div className="container max-w-6xl space-y-6 py-8">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Users</h1>
      <form className="flex gap-2">
        <Input name="q" defaultValue={q} placeholder="Search by name or email…" />
        <Button type="submit">Search</Button>
      </form>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Roles</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Last active</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((u: any) => (
                <tr key={u.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{u.full_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3">{(u.roles ?? []).map((r: string) => <Badge key={r} variant="secondary" className="mr-1">{r}</Badge>)}</td>
                  <td className="px-4 py-3">{u.is_suspended ? <Badge variant="destructive">Suspended</Badge> : <Badge variant="success">Active</Badge>}</td>
                  <td className="px-4 py-3 text-muted-foreground">{timeAgo(u.last_active)}</td>
                  <td className="px-4 py-3 text-right">
                    <form action={async () => {
                      "use server";
                      await sb.from("users").update({ is_suspended: !u.is_suspended }).eq("id", u.id);
                    }}>
                      <Button type="submit" size="sm" variant={u.is_suspended ? "default" : "outline"}>
                        {u.is_suspended ? "Unsuspend" : "Suspend"}
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
