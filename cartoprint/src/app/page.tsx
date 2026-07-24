import { MapSetupWizard } from '@/components/Storefront/MapSetupWizard';
import { StudioHeader } from '@/components/Storefront/StudioHeader';

const CITY_ROADS = [
  'M18 42H510', 'M8 78H530', 'M22 118H505', 'M-8 162H530', 'M12 206H514', 'M-10 254H530', 'M20 302H515', 'M-5 352H530',
  'M42 10V390', 'M88 -10V402', 'M132 8V390', 'M180 -12V402', 'M226 8V390', 'M276 -8V402', 'M326 6V390', 'M378 -10V402', 'M432 4V390', 'M482 -10V402',
  'M12 24L510 372', 'M-10 330L420 12', 'M70 400L500 28', 'M6 274C98 238 126 196 220 184S382 122 526 92',
  'M-20 96C84 132 124 106 204 142S366 226 540 204', 'M20 382C116 318 154 330 242 278S402 244 526 290',
];

export default function StorefrontPage() {
  return (
    <main className="studio-topography min-h-screen overflow-x-hidden bg-[#14201d] text-[#f7f4eb]">
      <StudioHeader />

      <section className="relative mx-auto grid min-h-[calc(100vh-70px)] max-w-[1500px] grid-cols-1 items-center gap-12 px-6 py-12 md:px-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(440px,1.08fr)] lg:gap-20 lg:px-16 lg:py-14">
        <div className="pointer-events-none absolute -left-40 bottom-[-280px] h-[620px] w-[620px] rounded-full bg-[#29443c]/45 blur-3xl" aria-hidden />

        <div className="relative z-10 max-w-2xl">
          <div className="studio-kicker">Modern topographic print studio</div>
          <h1 className="mt-7 font-display text-[clamp(4.2rem,7.6vw,8rem)] font-light leading-[0.79] tracking-[-0.045em]">
            Your place.
            <span className="block italic text-[#cbd4cc]">Made simple.</span>
          </h1>
          <p className="mt-9 max-w-xl text-[15px] font-light leading-7 text-[#dce2dd]/68 md:text-[17px]">
            Tell us what place matters. We handle the map detail, then guide you through color, title, and print.
          </p>

          <div className="mt-9 max-w-2xl">
            <MapSetupWizard />
          </div>
        </div>

        <div className="relative hidden min-h-[650px] items-center justify-center lg:flex" aria-hidden>
          <div className="absolute left-[2%] top-[7%] text-[8px] uppercase tracking-[0.22em] text-white/28">43.0731° N · 89.4012° W</div>
          <div className="relative h-[610px] w-[458px] rotate-[1.5deg] bg-[#fbfaf6] p-5 shadow-[0_48px_110px_rgba(0,0,0,0.42)]">
            <div className="relative h-[490px] overflow-hidden bg-white">
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 520 400" preserveAspectRatio="none">
                <rect width="520" height="400" fill="#fff" />
                <g fill="none" stroke="#d34a32" strokeWidth="0.7" opacity="0.5">
                  {CITY_ROADS.map((road) => <path key={road} d={road} />)}
                </g>
                <g fill="#07122a">
                  <path d="M118 18C154 35 167 70 158 104s-45 65-70 50-19-56 4-79 7-45 26-57Z" />
                  <path d="M292 142c42-24 89-8 97 28s-24 66-67 68-76-20-69-51 12-30 39-45Z" />
                  <path d="M392 285c35-15 75-1 82 31s-19 61-57 65-67-19-60-49 11-35 35-47Z" />
                </g>
                <g fill="none" stroke="#d34a32" strokeWidth="2.2" opacity="0.92">
                  <path d="M-10 335C84 290 142 291 214 238S360 138 535 92" />
                  <path d="M26 -10C82 76 123 144 206 197s190 78 330 73" />
                </g>
              </svg>
              <div className="absolute left-4 top-4 border border-[#07122a]/25 bg-white/90 px-3 py-2 text-[7px] uppercase leading-4 tracking-[0.18em] text-[#07122a]">
                Complete street study<br />Madison, Wisconsin
              </div>
            </div>
            <div className="flex h-[86px] flex-col items-center justify-center border-t border-[#07122a] text-[#07122a]">
              <div className="font-display text-[38px] font-light uppercase tracking-[0.2em]">Madison</div>
              <div className="mt-1 text-[7px] uppercase tracking-[0.28em] text-[#65716a]">43.0731° N · 89.4012° W</div>
            </div>
          </div>
          <div className="absolute right-[-3%] top-[18%] -z-10 h-[470px] w-[350px] -rotate-[4deg] border border-white/12 bg-[#22342f]" />
        </div>
      </section>
    </main>
  );
}
