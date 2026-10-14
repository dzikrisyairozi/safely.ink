import { Pangolin } from '@repo/ui/components/brand/pangolin';

/**
 * The rolled pangolin as a flat mark. It also marks where the 3D one goes:
 * the hero canvas covers the whole section and centres its ball on this box,
 * then hides the mark once its first frame is up (`data-hero-3d="ready"`).
 */
export function HeroVisual() {
  return (
    <div
      data-hero-anchor
      className="relative mx-auto aspect-square w-full max-w-sm md:max-w-none"
    >
      <Pangolin
        variant="ball"
        className="absolute inset-[12%] text-foreground transition-opacity duration-700 group-data-[hero-3d=ready]/hero:opacity-0"
      />
    </div>
  );
}
