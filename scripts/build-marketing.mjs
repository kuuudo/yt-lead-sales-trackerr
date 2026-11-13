/**
 * Static marketing/SEO site generator for vstrk.com/m/
 *
 * Runs AFTER `vite build`. Reads Markdown from content/m/, renders the HTML
 * templates in scripts/templates/, and writes static files into dist/m/.
 *
 * Independence rules (see the approved plan):
 *  - Does not import or touch anything under src/ (the React app).
 *  - Only writes inside dist/m/ and, when there are published pages,
 *    appends their URLs to dist/sitemap.xml. Never touches dist/assets/.
 *  - Output pages load no React and no tracking code.
 *
 * Page status (frontmatter `status`):
 *  - draft (default for new pages): robots "noindex, follow", NOT in sitemap.
 *  - published: robots "index, follow", added to sitemap. Build FAILS if a
 *    published page has an empty body.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { marked } from 'marked';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'm');
const TEMPLATE_DIR = path.join(ROOT, 'scripts', 'templates');
const DIST = path.resolve(process.env.M_DIST_DIR || path.join(ROOT, 'dist'));
const OUT = path.join(DIST, 'm');

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STATUSES = new Set(['draft', 'published']);

// ---------------------------------------------------------------- helpers
const esc = (v) =>
  String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const toDateString = (v) => {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
};

/**
 * Tiny template engine.
 *   {{name}}   HTML-escaped value
 *   {{{name}}} raw value
 *   {{#flag}}...{{/flag}}  rendered when flag is truthy
 *   {{^flag}}...{{/flag}}  rendered when flag is falsy
 * Conditionals are resolved first, then values are inserted in ONE pass so
 * inserted content is never re-scanned. A variable that is used but not
 * provided throws, which catches template typos at build time.
 */
function render(template, vars) {
  let out = template;
  for (let i = 0; i < 10; i += 1) {
    const before = out;
    out = out.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, k, inner) => (vars[k] ? inner : ''));
    out = out.replace(/\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, k, inner) => (vars[k] ? '' : inner));
    if (out === before) break;
  }
  return out.replace(/\{\{\{(\w+)\}\}\}|\{\{(\w+)\}\}/g, (_, raw, escaped) => {
    const key = raw || escaped;
    if (!(key in vars) || vars[key] === undefined || vars[key] === null) {
      throw new Error(`Template variable "${key}" was not provided`);
    }
    return raw ? String(vars[key]) : esc(vars[key]);
  });
}

const readTemplate = (name) => fs.readFile(path.join(TEMPLATE_DIR, name), 'utf8');

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- load
async function loadConfig() {
  const raw = await fs.readFile(path.join(CONTENT_DIR, 'sections.json'), 'utf8');
  return JSON.parse(raw);
}

async function loadPages(config, errors) {
  const pages = [];
  const knownSections = new Set(config.sections.map((s) => s.key));

  // Unknown folders inside content/m are almost certainly typos.
  const entries = await fs.readdir(CONTENT_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && !knownSections.has(entry.name)) {
      errors.push(`content/m/${entry.name}/ is not a section listed in sections.json`);
    }
  }

  for (const section of config.sections) {
    const dir = path.join(CONTENT_DIR, section.key);
    if (!(await exists(dir))) continue;
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.md')).sort();

    for (const file of files) {
      const slug = file.replace(/\.md$/, '');
      const where = `content/m/${section.key}/${file}`;
      if (!SLUG_RE.test(slug)) {
        errors.push(`${where}: file name must be a lowercase slug (a-z, 0-9, hyphens)`);
        continue;
      }
      const parsed = matter(await fs.readFile(path.join(dir, file), 'utf8'));
      const fm = parsed.data || {};
      const status = fm.status || 'draft';

      if (!STATUSES.has(status)) errors.push(`${where}: status must be "draft" or "published"`);
      if (!fm.title) errors.push(`${where}: missing "title"`);
      if (!fm.description) errors.push(`${where}: missing "description"`);

      const body = parsed.content.trim();
      if (status === 'published' && !body) {
        errors.push(`${where}: status is "published" but the body is empty (refusing to publish a blank page)`);
      }

      const urlPath = `/m/${section.key}/${slug}/`;
      pages.push({
        kind: 'page',
        section: section.key,
        sectionConfig: section,
        slug,
        where,
        urlPath,
        canonical: `${config.site.baseUrl}${urlPath}`,
        title: String(fm.title || ''),
        seoTitle: String(fm.seo_title || (fm.title ? `${fm.title} | ${config.site.name}` : '')),
        description: String(fm.description || ''),
        status,
        primaryKeyword: String(fm.primary_keyword || ''),
        competitor: String(fm.competitor || ''),
        cardSummary: String(fm.card_summary || ''),
        related: Array.isArray(fm.related) ? fm.related.map(String) : [],
        date: toDateString(fm.date),
        updated: toDateString(fm.updated),
        body,
      });
    }
  }
  return pages;
}

// ---------------------------------------------------------------- validate
function validate(config, pages, errors) {
  const hubs = config.sections.map((s) => ({
    where: `sections.json (${s.key})`,
    title: s.seoTitle,
    description: s.description,
    canonical: `${config.site.baseUrl}/m/${s.key}/`,
  }));
  const index = {
    where: 'sections.json (index)',
    title: config.index.seoTitle,
    description: config.index.description,
    canonical: `${config.site.baseUrl}/m/`,
  };
  const all = [index, ...hubs, ...pages.map((p) => ({ where: p.where, title: p.seoTitle, description: p.description, canonical: p.canonical }))];

  for (const field of ['title', 'description', 'canonical']) {
    const seen = new Map();
    for (const item of all) {
      const key = String(item[field]).trim().toLowerCase();
      if (!key) continue;
      if (seen.has(key)) {
        errors.push(`Duplicate ${field}: "${item[field]}" used by ${seen.get(key)} and ${item.where}`);
      } else {
        seen.set(key, item.where);
      }
    }
  }

  const byKey = new Map(pages.map((p) => [`${p.section}/${p.slug}`, p]));
  for (const page of pages) {
    if (page.status !== 'published') continue;
    for (const ref of page.related) {
      const target = byKey.get(ref);
      if (!target) errors.push(`${page.where}: related "${ref}" does not exist`);
      else if (target.status !== 'published') errors.push(`${page.where}: related "${ref}" is still a draft (published pages must not link to drafts)`);
    }
  }

  for (const s of config.sections) {
    if (s.status === 'published' && !pages.some((p) => p.section === s.key && p.status === 'published')) {
      errors.push(`sections.json: hub "${s.key}" is published but has no published pages`);
    }
  }
}

// ---------------------------------------------------------------- html builders
function buildNav(config, activeKey) {
  return config.sections
    .map((s) => `<a href="/m/${s.key}/"${s.key === activeKey ? ' aria-current="page"' : ''}>${esc(s.label)}</a>`)
    .join('');
}

function buildFooterNav(config) {
  const links = [`<a href="${esc(config.site.homeUrl)}">Home</a>`];
  for (const s of config.sections) links.push(`<a href="/m/${s.key}/">${esc(s.label)}</a>`);
  return links.join('');
}

function buildCrumbs(items) {
  const html = items
    .map((it, i) => {
      const last = i === items.length - 1;
      const node = last ? `<span aria-current="page">${esc(it.name)}</span>` : `<a href="${esc(it.url)}">${esc(it.name)}</a>`;
      return i === 0 ? node : `<span class="sep">/</span>${node}`;
    })
    .join('');
  return `        <nav class="crumbs" aria-label="Breadcrumb">${html}</nav>`;
}

function buildCta(config) {
  // Copy reused from the existing homepage closing section (Website.tsx).
  return `        <section class="m-cta">
          <div class="big">Stop guessing. Start tracking.</div>
          <p>Try Vstrk free for 3 days. No card needed.</p>
          <a class="btn-primary" href="${esc(config.site.ctaUrl)}">Start your 3-day free trial</a>
        </section>`;
}

function buildJsonLd(config, { crumbs, page }) {
  const data = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.name,
        item: `${config.site.baseUrl}${c.url}`,
      })),
    },
  ];
  if (page && page.section === 'guides') {
    data.push({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: page.title,
      description: page.description,
      mainEntityOfPage: page.canonical,
      ...(page.date ? { datePublished: page.date } : {}),
      ...(page.updated || page.date ? { dateModified: page.updated || page.date } : {}),
      publisher: { '@type': 'Organization', name: config.site.name, url: `${config.site.baseUrl}/` },
    });
  }
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `    <script type="application/ld+json">${json}</script>`;
}

function buildCard(page) {
  const draftChip = page.status === 'draft' ? '<span class="chip">Draft</span>' : '';
  if (page.sectionConfig.cardStyle === 'compact') {
    const mark = esc((page.competitor || page.title).trim().charAt(0).toUpperCase());
    const sub = page.cardSummary
      ? `<p class="sub">${esc(page.cardSummary)}</p>`
      : '<p class="sub muted">Comparison coming soon</p>';
    return `          <a class="card card-compact" href="${page.urlPath}">
            <div class="mark" aria-hidden="true">${mark}</div>
            <div class="body">
              <div class="card-top"><h3>${esc(page.title)}</h3>${draftChip}</div>
              ${sub}
            </div>
          </a>`;
  }
  const summary = page.cardSummary
    ? `<p>${esc(page.cardSummary)}</p>`
    : '<p class="muted">Summary coming soon</p>';
  return `          <a class="card" href="${page.urlPath}">
            <div class="card-top"><span class="label">${esc(page.sectionConfig.cardKind)}</span>${draftChip}</div>
            <h3>${esc(page.title)}</h3>
            ${summary}
            <span class="card-link">${esc(page.sectionConfig.cardLink)} &rarr;</span>
          </a>`;
}

function buildSectionCard(section, count) {
  return `          <a class="card" href="/m/${section.key}/">
            <div class="card-top"><span class="label">${esc(section.label)}</span></div>
            <h3>${esc(section.title)}</h3>
            <p>${esc(section.intro)}</p>
            <span class="card-link">Browse ${esc(section.label.toLowerCase())} &rarr;</span>
          </a>`;
}

function buildRelated(page, byKey) {
  const items = page.related
    .map((ref) => byKey.get(ref))
    .filter(Boolean)
    .map((p) => `<li><a href="${p.urlPath}">${esc(p.title)}</a></li>`);
  if (!items.length) return '';
  return `          <section class="related"><h2>Related</h2><ul>${items.join('')}</ul></section>`;
}

// ---------------------------------------------------------------- build
async function main() {
  const errors = [];

  if (!(await exists(path.join(DIST, 'index.html')))) {
    throw new Error(`${path.relative(ROOT, DIST) || DIST}/index.html not found. Run "vite build" first; this script only adds /m/ to an existing build.`);
  }
  if (path.basename(OUT) !== 'm' || path.dirname(OUT) !== DIST) {
    throw new Error('Refusing to write outside <dist>/m');
  }

  const config = await loadConfig();
  const pages = await loadPages(config, errors);
  validate(config, pages, errors);

  if (errors.length) {
    console.error('\nMarketing build failed:\n');
    for (const e of errors) console.error(`  - ${e}`);
    console.error('');
    process.exit(1);
  }

  const templates = {
    layout: await readTemplate('layout.html'),
    hub: await readTemplate('hub.html'),
    guides: await readTemplate('guide.html'),
    features: await readTemplate('feature.html'),
    tools: await readTemplate('tool.html'),
    'use-cases': await readTemplate('use-case.html'),
    compare: await readTemplate('compare.html'),
  };
  const css = await fs.readFile(path.join(TEMPLATE_DIR, 'm.css'), 'utf8');

  const year = new Date().getFullYear();
  const byKey = new Map(pages.map((p) => [`${p.section}/${p.slug}`, p]));
  const output = []; // { urlPath, html, published, lastmod }

  function wrap({ crumbs, activeKey, content, seoTitle, description, canonical, ogType, status, page }) {
    const draft = status !== 'published';
    return render(templates.layout, {
      title_tag: seoTitle,
      description,
      robots: draft ? 'noindex, follow' : 'index, follow',
      canonical,
      og_type: ogType,
      jsonld: draft ? '' : buildJsonLd(config, { crumbs, page }),
      home_url: config.site.homeUrl,
      cta_url: config.site.ctaUrl,
      nav: buildNav(config, activeKey),
      draft,
      crumbs: buildCrumbs(crumbs),
      content,
      cta: buildCta(config),
      footer_nav: buildFooterNav(config),
      year,
    });
  }

  // /m/ resources index
  {
    const cards = config.sections
      .map((s) => buildSectionCard(s, pages.filter((p) => p.section === s.key && p.status === 'draft').length))
      .join('\n');
    const crumbs = [
      { name: 'Home', url: config.site.homeUrl },
      { name: config.index.label, url: '/m/' },
    ];
    const content = render(templates.hub, {
      label: config.index.label,
      title: config.index.title,
      intro: config.index.intro,
      grid_class: '',
      cards,
    });
    output.push({
      urlPath: '/m/',
      published: config.index.status === 'published',
      html: wrap({
        crumbs,
        activeKey: '',
        content,
        seoTitle: config.index.seoTitle,
        description: config.index.description,
        canonical: `${config.site.baseUrl}/m/`,
        ogType: 'website',
        status: config.index.status,
        page: null,
      }),
    });
  }

  // hubs
  for (const section of config.sections) {
    const sectionPages = pages.filter((p) => p.section === section.key);
    const visible = section.status === 'published' ? sectionPages.filter((p) => p.status === 'published') : sectionPages;
    const crumbs = [
      { name: 'Home', url: config.site.homeUrl },
      { name: section.label, url: `/m/${section.key}/` },
    ];
    const content = render(templates.hub, {
      label: section.label,
      title: section.title,
      intro: section.intro,
      grid_class: section.cardStyle === 'compact' ? 'grid-compact' : '',
      cards: visible.map(buildCard).join('\n'),
    });
    output.push({
      urlPath: `/m/${section.key}/`,
      published: section.status === 'published',
      html: wrap({
        crumbs,
        activeKey: section.key,
        content,
        seoTitle: section.seoTitle,
        description: section.description,
        canonical: `${config.site.baseUrl}/m/${section.key}/`,
        ogType: 'website',
        status: section.status,
        page: null,
      }),
    });
  }

  // detail pages
  for (const page of pages) {
    const crumbs = [
      { name: 'Home', url: config.site.homeUrl },
      { name: page.sectionConfig.label, url: `/m/${page.section}/` },
      { name: page.title, url: page.urlPath },
    ];
    const draft = page.status !== 'published';
    const content = render(templates[page.section], {
      title: page.title,
      draft,
      competitor: page.competitor || 'Competitor',
      is_utm: page.section === 'tools' && page.slug === 'utm-link-builder',
      body: draft ? '' : marked.parse(page.body, { async: false }),
      related: draft ? '' : buildRelated(page, byKey),
    });
    output.push({
      urlPath: page.urlPath,
      published: !draft,
      lastmod: page.updated || page.date || '',
      html: wrap({
        crumbs,
        activeKey: page.section,
        content,
        seoTitle: page.seoTitle,
        description: page.description,
        canonical: page.canonical,
        ogType: page.section === 'guides' ? 'article' : 'website',
        status: page.status,
        page,
      }),
    });
  }

  // write dist/m (clean first so removed pages never linger)
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(path.join(OUT, 'm.css'), css);
  for (const item of output) {
    const rel = item.urlPath.replace(/^\/m\//, '');
    const dir = path.join(OUT, rel);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'index.html'), item.html);
  }

  // sitemap: only touch dist/sitemap.xml when published /m/ pages exist or
  // stale /m/ entries must be removed. With zero published pages and no stale
  // entries the file is left byte-for-byte unchanged.
  const sitemapPath = path.join(DIST, 'sitemap.xml');
  let sitemapState = 'not present (skipped)';
  if (await exists(sitemapPath)) {
    const original = await fs.readFile(sitemapPath, 'utf8');
    const base = config.site.baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const stale = new RegExp(`[ \\t]*<url>\\s*<loc>${base}/m/[^<]*</loc>[\\s\\S]*?</url>\\r?\\n?`, 'g');
    let next = original.replace(stale, '');
    const published = output.filter((o) => o.published);
    if (published.length) {
      const entries = published
        .map((o) => `  <url>\n    <loc>${config.site.baseUrl}${o.urlPath}</loc>${o.lastmod ? `\n    <lastmod>${o.lastmod}</lastmod>` : ''}\n  </url>\n`)
        .join('');
      next = next.replace('</urlset>', `${entries}</urlset>`);
    }
    if (next !== original) {
      await fs.writeFile(sitemapPath, next);
      sitemapState = `updated (${published.length} published /m/ URL(s))`;
    } else {
      sitemapState = 'unchanged (no published /m/ pages)';
    }
  }

  const drafts = output.filter((o) => !o.published).length;
  console.log(`Marketing build: ${output.length} pages written to ${path.relative(ROOT, OUT) || OUT}/ (${drafts} draft/noindex, ${output.length - drafts} published)`);
  console.log(`Marketing build: sitemap.xml ${sitemapState}`);
}

main().catch((err) => {
  console.error(`\nMarketing build failed: ${err.message}\n`);
  process.exit(1);
});
