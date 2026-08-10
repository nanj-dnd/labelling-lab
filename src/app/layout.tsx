import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/app/contexts/AuthContext";

export const metadata: Metadata = {
    title: "AMP Label Lab",
    description:
        "Create expert-reviewed cricket video labels and training-ready CSV datasets.",
    robots: {
        index: false,
        follow: false,
        nocache: true,
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body>
                <AuthProvider>{children}</AuthProvider>
            </body>
        </html>
    );
}
