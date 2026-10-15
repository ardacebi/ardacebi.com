// Run after editing js/works.js: node scripts/build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
process.chdir(new URL('..', import.meta.url).pathname);
const context = vm.createContext({ window: {} });
for (const file of ['js/works.js', 'js/work-markup.js']) vm.runInContext(readFileSync(file, 'utf8'), context);
let html = readFileSync('index.html', 'utf8');
const summaries = [];
for (const [name, collection] of Object.entries(context.window.SiteWorks)) {
  const markup = context.window.SiteWorkMarkup(name, collection);
  html = html.replace(new RegExp(`<!-- works:${name}:start -->[\\s\\S]*?<!-- works:${name}:end -->`), `<!-- works:${name}:start -->${markup}<!-- works:${name}:end -->`);
  summaries.push(`## ${name === 'dribbble' ? 'Design work' : name === 'designble' ? 'Designble projects' : 'Software'}\n\n` + collection.items.map(w => {
    const title = w.href ? `[${w.title}](${w.href})` : w.title;
    const contribution = w.contribution ? ` ${w.contribution}` : '';
    const technologies = w.technologies?.length ? ` Technologies: ${w.technologies.join(', ')}.` : '';
    const apps = w.apps?.length ? ` Projects: ${w.apps.map(app => `[${app.name}](${app.href})`).join(', ')}.` : '';
    return `- ${title} (${w.year}, ${w.role}): ${w.body}${contribution}${technologies}${apps}`;
  }).join('\n'));
}
writeFileSync('index.html', html.replace(/[ \t]+$/gm, '')); 
const llms = readFileSync('llms.txt', 'utf8').replace(/<!-- projects:start -->[\s\S]*?<!-- projects:end -->/, `<!-- projects:start -->\n${summaries.join('\n\n')}\n<!-- projects:end -->`);
writeFileSync('llms.txt', llms);
const projectCount = Object.values(context.window.SiteWorks).reduce((total, collection) => total + collection.items.length, 0);
console.log(`Prerendered all ${projectCount} projects and refreshed llms.txt.`);
