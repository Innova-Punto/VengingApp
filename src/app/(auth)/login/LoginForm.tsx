"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useState } from "react";

import {
  signInWithMagicLink,
  signInWithPassword,
  type LoginResult,
} from "./actions";

const initialState: LoginResult | null = null;

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Enviando..." : label}
    </button>
  );
}

export default function LoginForm({
  next,
  initialError,
}: {
  next: string;
  initialError?: string;
}) {
  const [mode, setMode] = useState<"magic" | "password">("magic");
  const [magicState, magicAction] = useFormState(
    signInWithMagicLink,
    initialState,
  );
  const [pwState, pwAction] = useFormState(signInWithPassword, initialState);

  const state = mode === "magic" ? magicState : pwState;
  const errorMessage =
    state && !state.ok ? state.message : initialError ?? undefined;
  const successMessage =
    mode === "magic" && magicState?.ok ? magicState.message : undefined;

  return (
    <div className="space-y-4">
      <div className="flex rounded-md border border-zinc-200 p-1 text-sm">
        <button
          type="button"
          onClick={() => setMode("magic")}
          className={`flex-1 rounded px-3 py-1.5 transition ${
            mode === "magic"
              ? "bg-zinc-900 text-white"
              : "text-zinc-600 hover:bg-zinc-100"
          }`}
        >
          Magic link
        </button>
        <button
          type="button"
          onClick={() => setMode("password")}
          className={`flex-1 rounded px-3 py-1.5 transition ${
            mode === "password"
              ? "bg-zinc-900 text-white"
              : "text-zinc-600 hover:bg-zinc-100"
          }`}
        >
          Contraseña
        </button>
      </div>

      <form
        action={mode === "magic" ? magicAction : pwAction}
        className="space-y-3"
      >
        <input type="hidden" name="next" value={next} />

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-zinc-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="tu@empresa.com"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>

        {mode === "password" && (
          <div className="space-y-1">
            <label
              htmlFor="password"
              className="text-sm font-medium text-zinc-700"
            >
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>
        )}

        {errorMessage && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        )}

        {successMessage && (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            {successMessage}
          </p>
        )}

        <SubmitButton
          label={mode === "magic" ? "Enviar magic link" : "Iniciar sesión"}
        />
      </form>
    </div>
  );
}
