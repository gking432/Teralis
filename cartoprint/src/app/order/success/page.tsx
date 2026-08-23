import Link from 'next/link';
import { StudioHeader } from '@/components/Storefront/StudioHeader';

export const metadata = { title: 'Order received · Terralis' };

export default function OrderSuccessPage() {
  return (
    <main className="studio-topography min-h-screen bg-[#14201d] text-[#f7f4eb]">
      <StudioHeader />
      <section className="mx-auto flex min-h-[calc(100vh-72px)] max-w-3xl items-center px-6 py-16 text-center">
        <div className="w-full border border-white/12 bg-white/[0.045] px-6 py-14 sm:px-14 sm:py-20">
          <div className="text-[9px] uppercase tracking-[0.23em] text-[#d39a80]">Order received</div>
          <h1 className="mt-5 font-display text-5xl font-light leading-none sm:text-7xl">Your place is headed to print.</h1>
          <p className="mx-auto mt-6 max-w-xl text-[13px] leading-6 text-white/60">We saved the exact design you approved. A receipt is on its way, and tracking will follow when the finished piece ships.</p>
          <Link href="/" className="mt-9 inline-flex min-h-12 items-center border border-white/25 px-6 text-[9px] uppercase tracking-[0.19em] transition-colors hover:bg-white hover:text-[#14201d]">Back to the collection</Link>
        </div>
      </section>
    </main>
  );
}
