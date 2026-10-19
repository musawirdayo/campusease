import { Link } from "@tanstack/react-router";

export type Crumb = { label: string; href?: string };

/**
 * Breadcrumb trail + matching BreadcrumbList JSON-LD for search engines.
 * Usage: <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Classes" }]} />
 */
export function Breadcrumbs({
  items,
  className = "",
}: {
  items: Crumb[];
  className?: string;
}) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.label,
      ...(item.href ? { item: item.href } : {}),
    })),
  };
  return (
    <nav
      aria-label="Breadcrumb"
      className={`text-xs text-muted-foreground print:hidden ${className}`}
    >
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden="true">/</span>}
            {item.href ? (
              <Link
                to={item.href}
                className="hover:text-foreground hover:underline"
              >
                {item.label}
              </Link>
            ) : (
              <span
                aria-current={i === items.length - 1 ? "page" : undefined}
                className="text-foreground"
              >
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </nav>
  );
}
