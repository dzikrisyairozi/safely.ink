import { Pangolin } from '@repo/ui/components/brand/pangolin';

// Runs before paint: a visitor sees the intro once per browser session.
const ONCE = `try{if(sessionStorage.getItem('intro'))document.documentElement.dataset.introSeen='';else sessionStorage.setItem('intro','1')}catch(e){}`;

export function Intro() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: ONCE }} />
      <div
        aria-hidden
        className="intro pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background"
      >
        <Pangolin variant="ball" className="size-32 text-foreground" />
      </div>
    </>
  );
}
