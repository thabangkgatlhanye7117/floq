import { requireMember } from "@/lib/auth";
import AppBar from "@/components/AppBar";
import Scanner from "@/components/Scanner";

export const dynamic = "force-dynamic";

/** Gate scanner for door staff (and owners). */
export default async function Scan() {
  const m = await requireMember(["scanner", "owner"]);
  return (
    <div className="wrap" style={{ maxWidth: 560 }}>
      <AppBar m={m} />
      <Scanner />
    </div>
  );
}
