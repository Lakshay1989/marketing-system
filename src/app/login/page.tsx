"use client";
import { useActionState } from "react";
import { login } from "../actions";
export default function Login() {
  const [s, action, pending] = useActionState(login, {} as { error?: string });
  return (
    <div className="mx-auto mt-24 max-w-sm px-4">
      <h1 className="text-2xl font-black text-[var(--forest)]">Kukur Marketing AI</h1>
      <form action={action} className="card mt-4 space-y-3">
        <label className="block text-sm font-semibold" htmlFor="pw">Owner password</label>
        <input id="pw" name="password" type="password" autoComplete="current-password" className="w-full rounded-lg border border-[var(--line)] p-2" />
        {s.error && <p role="alert" className="text-sm text-red-700">{s.error}</p>}
        <button className="btn w-full justify-center" disabled={pending}>Log in</button>
      </form>
    </div>
  );
}
