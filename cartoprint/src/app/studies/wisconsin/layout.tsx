import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Wisconsin — Land & Water Study | Terralis', robots: { index: false, follow: false } };
export default function StudyLayout({children}: {children: React.ReactNode}) { return children; }
