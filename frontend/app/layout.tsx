import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Handyman CRM",
  description: "Dispatcher console: tasks, handymen, schedule, map",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>
        <Providers>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                borderRadius: "4px",
                fontSize: "13px",
                border: "1px solid var(--line)",
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
