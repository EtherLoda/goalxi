import ClubNavTabs from "./ClubNavTabs";

interface ClubLayoutProps {
    children: React.ReactNode;
}

export default function ClubLayout({ children }: ClubLayoutProps) {
    return (
        <div className="flex flex-col min-h-[calc(100vh-4rem)]">
            <ClubNavTabs />
            <div className="flex-1">{children}</div>
        </div>
    );
}
