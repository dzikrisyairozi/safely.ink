import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo } from './logo';
import { Pangolin } from './pangolin';
import { pangolin, pangolinBall, pangolinBallSmall, shapeSvg } from './shapes';

describe('Pangolin', () => {
  it('is an image with a name when titled, hidden otherwise', () => {
    const { container } = render(
      <>
        <Pangolin title="safely.ink" />
        <Pangolin variant="ball" />
      </>,
    );

    expect(screen.getByRole('img', { name: 'safely.ink' })).toBeTruthy();
    expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(
      1,
    );
  });

  it('gives every instance its own mask', () => {
    const { container } = render(
      <>
        <Pangolin />
        <Pangolin />
      </>,
    );
    const ids = [...container.querySelectorAll('mask')].map((m) => m.id);

    expect(new Set(ids).size).toBe(2);
    for (const id of ids) {
      expect(container.querySelector(`rect[mask="url(#${id})"]`)).toBeTruthy();
    }
  });

  it('draws only in the current colour', () => {
    const { container } = render(<Pangolin variant="ball-small" />);

    expect(container.querySelector('rect')?.getAttribute('fill')).toBe(
      'currentColor',
    );
  });
});

describe('Logo', () => {
  it('names the product in text, so the mark stays decorative', () => {
    render(<Logo />);

    expect(screen.getByText('safely.ink')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });
});

describe('shapeSvg', () => {
  it('paints one colour through the mask, on an optional background', () => {
    for (const shape of [pangolin, pangolinBall, pangolinBallSmall]) {
      const svg = shapeSvg(shape, { color: '#14182b', background: '#faf7f0' });

      expect(svg).toContain(`viewBox="${shape.viewBox}"`);
      expect(svg).toContain('fill="#14182b" mask="url(#m)"');
      expect(svg).toContain('fill="#faf7f0"');
    }
    expect(shapeSvg(pangolin)).not.toContain(
      '<rect width="100%" height="100%" fill="#',
    );
  });
});
