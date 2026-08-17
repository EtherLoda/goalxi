"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import ChangePasswordDialog from "./ChangePasswordDialog";

/**
 * Inline card on the User settings page that surfaces the "Change
 * password" entry point. Hosts a single primary button which opens
 * the modal. Lives separately from the dialog so the page can stack
 * other cards (UserProfileForm, etc.) above and below it without
 * pulling dialog state into the page itself.
 */
export default function ChangePasswordCard() {
    const t = useTranslations("settings.user.security");
    const [open, setOpen] = useState(false);

    return (
        <>
            <div className="space-y-2">
                <p className="font-body text-sm text-on-surface-variant">
                    {t("subtitle")}
                </p>
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="px-4 py-2 rounded-lg bg-primary text-on-primary font-headline text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-opacity"
                >
                    {t("changePassword")}
                </button>
            </div>
            <ChangePasswordDialog
                open={open}
                onClose={() => setOpen(false)}
                onSuccess={() => {
                    // Keep the dialog open for ~1.5s so the user
                    // actually sees the success banner, then auto-
                    // dismiss. They can also close manually.
                    setTimeout(() => setOpen(false), 1500);
                }}
            />
        </>
    );
}
