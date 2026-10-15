import { describe, expect, it } from 'vitest';
import { expiredGaCookies } from './analytics';

describe('expiredGaCookies', () => {
  it('expires every Google Analytics cookie, on the host and its parent domain', () => {
    const cookies = expiredGaCookies(
      '_ga=GA1.1.1; theme=dark; _ga_ABC123=GS1.1.2; other=_ga',
      'www.safely.ink',
    );

    expect(cookies).toEqual([
      '_ga=; max-age=0; path=/',
      '_ga=; max-age=0; path=/; domain=.www.safely.ink',
      '_ga=; max-age=0; path=/; domain=.safely.ink',
      '_ga_ABC123=; max-age=0; path=/',
      '_ga_ABC123=; max-age=0; path=/; domain=.www.safely.ink',
      '_ga_ABC123=; max-age=0; path=/; domain=.safely.ink',
    ]);
  });

  it('leaves the page alone when there are none', () => {
    expect(expiredGaCookies('theme=dark', 'localhost')).toEqual([]);
  });
});
