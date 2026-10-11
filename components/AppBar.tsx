import Link from "next/link";
import type { Member } from "@/lib/auth";
import SignOut from "./SignOut";
import ThemeToggle from "./ThemeToggle";

/** Top bar: wordmark, who is signed in, sign out. Swap the wordmark for the logo image when you have the file. */
export default function AppBar({ m }: { m: Member }) {
  return (
    <div className="bar">
      <Link className="wordmark" href="/">
        bulla<b>soft</b>
      </Link>
      <div className="bar-right">
        <div className="who">
          <strong>{m.orgName}</strong>
          {m.email} &middot; {m.role}
        </div>
        {m.role === "owner" && (
          <>
            <Link className="btn line sm" href="/tags">
              Tags
            </Link>
            <Link className="btn line sm" href="/scan">
              Scanner
            </Link>
          </>
        )}
        <ThemeToggle />
        <SignOut />
      </div>
    </div>
  );
}
