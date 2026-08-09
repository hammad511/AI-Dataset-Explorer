"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";

export default function SettingsPage() {
    const { data: session } = useSession();
    const [activeTab, setActiveTab] = useState("Profile");
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);

    const tabs = ["Profile", "Notifications", "API Keys"];

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setSaveSuccess(false);

        // Mock save delay
        setTimeout(() => {
            setIsSaving(false);
            setSaveSuccess(true);

            // Hide success message after 3 seconds
            setTimeout(() => setSaveSuccess(false), 3000);
        }, 1000);
    };

    const handleDelete = () => {
        if (window.confirm("Are you sure you want to permanently delete your account? This action cannot be undone.")) {
            // Log out user for mock delete
            signOut({ callbackUrl: '/login' });
        }
    };

    return (
        <main className="min-h-screen bg-[#0c0a09] text-white p-8">
            <div className="max-w-4xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight mb-2">Settings</h1>
                        <p className="text-slate-400">Manage your account settings and preferences.</p>
                    </div>
                    <Link href="/explore" className="text-sm font-medium text-slate-300 hover:text-white bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] rounded-xl px-4 py-2 transition">
                        Back to Explore
                    </Link>
                </div>

                {/* Settings Content Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">

                    {/* Navigation Sidebar */}
                    <div className="space-y-1">
                        {tabs.map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`w-full text-left px-4 py-3 text-sm font-medium rounded-xl transition ${activeTab === tab
                                    ? "bg-gradient-to-r from-rose-500/10 to-orange-500/10 border border-orange-500/20 text-orange-400"
                                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
                                    }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    {/* Main Settings Panel */}
                    <div className="md:col-span-2 space-y-6">

                        {activeTab === "Profile" && (
                            <>
                                <div className="rounded-[32px] border border-white/10 bg-[#1c1917]/85 p-8 shadow-[0_30px_90px_rgba(0,0,0,0.4)] backdrop-blur-xl relative overflow-hidden animate-in fade-in pt-4">
                                    <div className="absolute top-0 right-0 -mr-16 -mt-16 rounded-[50%] bg-gradient-to-br from-rose-500/10 via-orange-500/10 to-amber-400/10 blur-3xl h-64 w-64 pointer-events-none" />

                                    <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-rose-400 to-orange-400">Account Profile</span>
                                    </h2>

                                    <form className="space-y-5" onSubmit={handleSave}>
                                        <div>
                                            <label className="block text-[13px] font-medium text-slate-300 mb-2">Avatar</label>
                                            <div className="flex items-center gap-4">
                                                <div className="h-16 w-16 rounded-full bg-gradient-to-tr from-rose-500 to-orange-400 flex items-center justify-center text-white font-semibold text-2xl shadow-lg shrink-0">
                                                    {session?.user?.name?.charAt(0) || session?.user?.email?.charAt(0) || 'U'}
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <label className="text-sm px-4 py-2 rounded-xl border border-white/10 bg-white/[0.03] text-slate-300 hover:text-white hover:bg-white/[0.06] transition cursor-pointer inline-block text-center">
                                                        Change Avatar
                                                        <input
                                                            type="file"
                                                            className="hidden"
                                                            accept="image/*"
                                                            onChange={(e) => {
                                                                if (e.target.files && e.target.files[0]) {
                                                                    alert(`Selected file: ${e.target.files[0].name}`);
                                                                    // For a real app, you would upload to cloud storage here
                                                                }
                                                            }}
                                                        />
                                                    </label>
                                                    <p className="text-xs text-slate-500">JPG, GIF or PNG. Max size of 800K</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            <div>
                                                <label className="block text-[13px] font-medium text-slate-300 mb-2">Full Name</label>
                                                <input
                                                    type="text"
                                                    className="w-full rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-orange-400/50 focus:bg-white/[0.06] transition"
                                                    defaultValue={session?.user?.name || ''}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[13px] font-medium text-slate-300 mb-2">Email Address</label>
                                                <input
                                                    type="email"
                                                    className="w-full rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 text-sm text-slate-400 outline-none cursor-not-allowed"
                                                    defaultValue={session?.user?.email || ''}
                                                    disabled
                                                />
                                                <p className="text-xs text-slate-500 mt-2">Email address cannot be changed.</p>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-[13px] font-medium text-slate-300 mb-2">Bio</label>
                                            <textarea
                                                rows={4}
                                                className="w-full rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-orange-400/50 focus:bg-white/[0.06] transition resize-none"
                                                placeholder="Tell us a little bit about yourself and your projects..."
                                            ></textarea>
                                        </div>

                                        <div className="pt-4 border-t border-white/10 border-dashed flex justify-end items-center gap-4">
                                            {saveSuccess && (
                                                <span className="text-sm text-emerald-400 animate-in fade-in slide-in-from-right-2">
                                                    Changes saved successfully!
                                                </span>
                                            )}
                                            <button
                                                type="submit"
                                                disabled={isSaving}
                                                className="bg-gradient-to-r from-rose-500 to-orange-400 text-white text-sm font-semibold rounded-xl px-6 py-3 shadow-[0_10px_30px_rgba(244,63,94,0.3)] hover:brightness-110 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                            >
                                                {isSaving ? (
                                                    <>
                                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                        </svg>
                                                        Saving...
                                                    </>
                                                ) : "Save Changes"}
                                            </button>
                                        </div>
                                    </form>
                                </div>

                                <div className="rounded-[32px] border border-rose-500/20 bg-rose-500/5 p-8 backdrop-blur-xl animate-in fade-in pt-6">
                                    <h2 className="text-lg font-semibold text-rose-400 mb-2">Danger Zone</h2>
                                    <p className="text-sm text-slate-400 mb-6">Permanently delete your account and all of your data.</p>
                                    <button
                                        onClick={handleDelete}
                                        className="text-sm px-4 py-2.5 rounded-xl border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition"
                                    >
                                        Delete Account
                                    </button>
                                </div>
                            </>
                        )}

                        {activeTab === "Notifications" && (
                            <div className="rounded-[32px] border border-white/10 bg-[#1c1917]/85 p-8 shadow-[0_30px_90px_rgba(0,0,0,0.4)] backdrop-blur-xl animate-in fade-in slide-in-from-right-4">
                                <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-rose-400 to-orange-400">Notifications</span>
                                </h2>
                                <p className="text-slate-400 text-sm mb-6">Choose what updates you want to receive via email.</p>
                                <div className="space-y-4">
                                    {['Weekly Digest', 'New Roadmap Updates', 'Security Alerts'].map((item, i) => (
                                        <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                                            <span className="text-sm font-medium text-slate-200">{item}</span>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input type="checkbox" className="sr-only peer" defaultChecked={i !== 1} />
                                                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-rose-500 peer-checked:to-orange-400"></div>
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeTab === "API Keys" && (
                            <div className="rounded-[32px] border border-white/10 bg-[#1c1917]/85 p-8 shadow-[0_30px_90px_rgba(0,0,0,0.4)] backdrop-blur-xl animate-in fade-in slide-in-from-right-4">
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-xl font-semibold flex items-center gap-2">
                                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-rose-400 to-orange-400">API Keys</span>
                                    </h2>
                                    <button className="text-sm px-4 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-white hover:bg-white/[0.1] transition">
                                        + Generate Key
                                    </button>
                                </div>
                                <p className="text-slate-400 text-sm mb-6">Use these keys to authenticate API requests from your own applications.</p>

                                <div className="p-5 rounded-2xl bg-[#0c0a09]/50 border border-white/10 flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-slate-200 mb-1">Production Key</p>
                                        <p className="text-xs text-slate-500 font-mono">sk_prod_*********************</p>
                                    </div>
                                    <button className="text-rose-400 text-sm hover:text-rose-300 px-3 py-1.5 rounded-lg hover:bg-rose-500/10 transition">
                                        Revoke
                                    </button>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </main>
    );
}
