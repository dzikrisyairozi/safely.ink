import { notFound } from 'next/navigation';

// Unknown paths land here instead of Next's bare 404, so the 404 page gets
// the root layout: the right language, fonts and theme.
export default function CatchAll() {
  notFound();
}
