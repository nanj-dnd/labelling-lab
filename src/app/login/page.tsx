"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { useAuth } from "@/app/contexts/AuthContext";
import { authReturnPathFromLocation } from "@/app/lib/authReturnPath";
import "./login.css";

/**
 * Annotator sign-in. Label Lab is invite-only in practice — accounts are
 * provisioned in Supabase rather than self-served — so this page is a plain
 * email/password form with no signup route. The host application this lab
 * was extracted from had its own branded login with SSO providers; if you
 * front Label Lab with an existing product, delete this page and send
 * unauthenticated users at your own login with `?next=/labelling`.
 */
export default function LoginPage() {
    const router = useRouter();
    const { isAuthenticated, authLoading } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!authLoading && isAuthenticated) {
            router.replace(authReturnPathFromLocation());
        }
    }, [authLoading, isAuthenticated, router]);

    const handleLogin = async (event: React.FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { error: signInError } =
                await supabase.auth.signInWithPassword({ email, password });
            if (signInError) throw signInError;
            router.push(authReturnPathFromLocation());
        } catch (caught) {
            setError(
                caught instanceof Error
                    ? caught.message
                    : "Invalid email or password.",
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="amp-login">
            <form className="amp-login-card" onSubmit={handleLogin}>
                <div className="amp-login-mark">amp</div>
                <h1>Label Lab</h1>
                <p className="amp-login-sub">
                    Sign in with your annotator account.
                </p>

                <label htmlFor="amp-login-email">Email</label>
                <input
                    id="amp-login-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                />

                <label htmlFor="amp-login-password">Password</label>
                <input
                    id="amp-login-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                />

                {error ? (
                    <p className="amp-login-error" role="alert">
                        {error}
                    </p>
                ) : null}

                <button type="submit" disabled={loading}>
                    {loading ? "Signing in…" : "Sign in"}
                </button>
            </form>
        </main>
    );
}
