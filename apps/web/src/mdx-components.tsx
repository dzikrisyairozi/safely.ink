import type { MDXComponents } from 'mdx/types';

// Article typography, on the theme tokens. Headings start at h2: the page
// renders the title as the h1.
const components: MDXComponents = {
  h2: (props) => (
    <h2
      className="mt-14 scroll-mt-24 text-balance font-serif text-3xl tracking-tight first:mt-0"
      {...props}
    />
  ),
  h3: (props) => (
    <h3 className="mt-8 scroll-mt-24 font-serif text-xl" {...props} />
  ),
  p: (props) => <p className="mt-5 leading-relaxed" {...props} />,
  ul: (props) => (
    <ul
      className="mt-5 list-disc space-y-2 pl-6 marker:text-muted-foreground"
      {...props}
    />
  ),
  ol: (props) => (
    <ol
      className="mt-5 list-decimal space-y-2 pl-6 marker:text-muted-foreground"
      {...props}
    />
  ),
  li: (props) => <li className="pl-1 leading-relaxed" {...props} />,
  a: ({ href = '', ...props }) => {
    const external = /^https?:\/\//.test(href);
    return (
      <a
        href={href}
        className="underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
        {...(external ? { target: '_blank', rel: 'noopener' } : {})}
        {...props}
      />
    );
  },
  blockquote: (props) => (
    <blockquote
      className="mt-6 border-l-2 border-foreground/60 pl-4 font-serif text-lg italic"
      {...props}
    />
  ),
  table: (props) => (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm" {...props} />
    </div>
  ),
  th: (props) => (
    <th
      className="border-b border-foreground/80 py-2 pr-4 align-bottom font-medium"
      {...props}
    />
  ),
  td: (props) => (
    <td className="border-b border-border py-2 pr-4 align-top" {...props} />
  ),
  hr: () => <hr className="my-10 border-border" />,
  code: (props) => (
    <code
      className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]"
      {...props}
    />
  ),
};

export function useMDXComponents(): MDXComponents {
  return components;
}
