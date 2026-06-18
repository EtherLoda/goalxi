interface ClubLayoutProps {
    children: React.ReactNode;
}

export default function ClubLayout({ children }: ClubLayoutProps) {
    return <div className="flex-1">{children}</div>;
}
