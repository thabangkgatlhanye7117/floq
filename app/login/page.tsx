import { redirect } from "next/navigation";
import { getMember } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase/server";
import SignOut from "@/components/SignOut";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function Login() {
  const m = await getMember();
  if (m) redirect("/");

  // signed in, but not linked to an organisation yet
  const {
    data: { user },
  } = await getSupabase().auth.getUser();

  return (
    <main className="login">
      <div className="card">
        <div className="wordmark">
          bulla<b>soft</b>
        </div>
        <h1>Sign in</h1>
        <p className="lede" style={{ fontSize: 16 }}>
          Event data for your team.
        </p>
        {user ? (
          <>
            <p className="err">
              You're signed in as {user.email}, but this account isn't linked to an organisation yet. Ask Bullasoft to
              finish setting it up.
            </p>
            <div style={{ marginTop: 18 }}>
              <SignOut />
            </div>
          </>
        ) : (
          <LoginForm />
        )}
      </div>
    </main>
  );
}
