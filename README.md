# Full Stack Engineering Knowledge Base

A personal, continuously growing learning website for understanding how
software works—from browser and network fundamentals to application
development, databases, infrastructure, and deployment.

The site is built with **MkDocs**, **MkDocs Material**, Markdown, and Python.
It is published through the repository's existing GitHub Pages workflow.
This is a learning reference, not a product application or a runnable
full-stack demo.

## What the knowledge base contains

The documentation is organized into these learning areas:

1. Networking and Protocols
2. Frontend Development
3. Backend Development
4. Databases
5. Application Architecture
6. AI and Machine Learning
7. Servers and Infrastructure
8. DevOps and Deployment
9. Operating Systems and Linux
10. Security and Testing
11. Rust and Systems Programming

Each area has an overview page that describes its learning objectives and
topics. Lessons and diagrams live under `docs/`. The navigation and page
ordering are maintained in `mkdocs.yml`.

Frontend lessons are grouped into expandable subject menus for HTML, CSS,
JavaScript, TypeScript, Browser Internals, React, and Next.js. The browser
lessons include practical coverage of the Console, Network, Application, and
Performance panels in DevTools. Within each subject, individual lessons can
appear directly in the sidebar while related collections of lessons can be
placed in collapsible topic groups. Use groups only when they help organize
the material; not every lesson needs a dropdown. When a subject is open, the
sidebar shows that subject's lessons rather than the other Frontend subjects.

## Learning and writing approach

Write for a learner who wants clear explanations and practical examples:

- Use simple, professional English and explain new technical terms.
- Explain what a concept is, why it exists, and how it works.
- Connect ideas to real applications and full-stack development.
- Include useful examples, commands, or small experiments where relevant.
- Cover trade-offs and frequent misconceptions. Use dedicated interview
  question pages where they are part of the subject's learning path; do not
  add "Revision questions" or "Check your understanding" sections to lessons.
- Link related lessons and cite official documentation or reliable standards.
- Prefer original, relevant diagrams over decorative or copied images.
- Be accurate and version-aware; do not make unsupported performance claims.
- Do not add placeholder explanations or generate unrelated bulk content.

Lessons should be as detailed as the topic requires. Avoid repeating large
explanations across pages; link to the lesson that explains a shared concept.

## Adding a Frontend language or subject

When asked to add a Frontend subject (for example, another language,
framework, or browser technology), follow the existing expandable-subject
format rather than adding a flat top-level navigation item.

1. **Create an overview page** at
   `docs/02-frontend-development/<subject>.md`. Explain what the subject is,
   why it exists, where it fits in frontend work, its learning path, and
   links to its detailed lessons.
2. **Create a matching lesson folder** at
   `docs/02-frontend-development/<subject>/`. Use lowercase, hyphenated
   filenames, such as `core-concepts.md` or `forms-and-validation.md`.
3. **Organize the important topics** into focused lessons. Split unrelated
   concepts into separate pages instead of putting a whole subject into one
   long lesson. Keep key or standalone lessons directly visible in the
   subject menu. Use a collapsible subgroup in `mkdocs.yml` only for a
   coherent collection that benefits from grouping; mix direct lessons and
   subgroups as appropriate. Do not force every subject into the same
   navigation pattern or generate filler pages.
4. **Aim for broad, practical subject coverage.** Cover the foundational
   concepts, common APIs and operations, practical workflows, debugging, and
   important edge cases a learner will encounter. Treat user-supplied topic
   lists as examples and coverage signals, not as the only required topics.
   For programming languages, include core syntax and data types, functions
   and scope, collections and common methods, object-oriented and functional
   patterns where relevant, asynchronous work, errors, modules, and
   environment APIs. For browser-facing subjects, also cover DOM interaction,
   events, forms, networking, storage, and browser debugging where relevant.
   Apply this depth to existing subjects as well as newly added ones.
5. **Include an "Interview Questions and Answers" lesson at the end of
   every Frontend subject's learning path.** Apply the same naming and
   placement consistently to HTML, CSS, JavaScript, TypeScript, Browser
   Internals, React, Next.js, and future Frontend subjects. Reuse useful
   questions already present in lessons, add important missing questions,
   and give accurate answers with examples where helpful. Correct
   misconceptions rather than repeating them.
6. **Explain each topic precisely.** Define the concept and terminology,
   explain why and how it works, show common types/options/attributes and
   what each means, and provide practical examples. For HTML, explain
   elements and their relevant attributes; for CSS, properties and values;
   for languages, syntax and APIs; for frameworks, components, props,
   conventions, and configuration. Include trade-offs, common mistakes, and
   official references where relevant.
7. **Add original diagrams** when a flow, relationship, or rendering process
   is easier to understand visually. Store them beside the lesson and include
   descriptive Markdown alt text; do not use decorative or copied images.
8. **Add the subject as a nested group** under `Frontend Development` in
   `mkdocs.yml`. Put its overview first, followed by a useful mix of direct
   lessons and optional topic groups, for example:

   ```yaml
   - Frontend Development:
       - Overview: 02-frontend-development/index.md
       - Example Subject:
           - Introduction: 02-frontend-development/example-subject.md
           - First Concept: 02-frontend-development/example-subject/first-concept.md
           - Related Topics:
               - Core Concepts: 02-frontend-development/example-subject/core-concepts.md
               - Practical Usage: 02-frontend-development/example-subject/practical-usage.md
           - Another Standalone Topic: 02-frontend-development/example-subject/another-topic.md
   ```

9. **Link related lessons** using relative Markdown paths, and update the
   Frontend overview's topic list and learning path if appropriate.
10. **Preserve contextual navigation.** Frontend subject pages must stay under
   `docs/02-frontend-development/` and inside the Frontend navigation group.
   The sidebar should show only the active subject's lessons; its
   "Back to Frontend" link returns to the subject-selection overview.
11. **Validate the change** with the strict MkDocs build and check all local
   lesson/image links. Preserve existing subjects, deployment configuration,
   and unrelated work.

## Repository layout

```text
docs/                         Markdown lessons and original learning assets
docs/<section>/index.md       Overview for a learning area
docs/stylesheets/             Custom site styles
docs/javascripts/             Small site behavior scripts
overrides/                    MkDocs Material template overrides
mkdocs.yml                    Site configuration and navigation
.github/workflows/            Existing GitHub Pages deployment workflow
README.md                     Project purpose and contributor guidance
```

Keep lesson paths consistent with the existing numbered section folders. When
adding or moving a lesson, update `mkdocs.yml` so it appears in the intended
navigation group, then check its relative Markdown links and image paths.
Inside a Frontend subject lesson, the sidebar intentionally shows only that
active subject and provides a "Back to Frontend" link to the language
selection overview; the site-level Home link remains available elsewhere.
Preserve this contextual navigation and the responsive layout behavior unless
a task explicitly asks to change it.

## Local development

The repository's existing Windows virtual environment includes the MkDocs
command. From PowerShell:

```powershell
.\.venv\Scripts\mkdocs.exe serve
```

Open the local address printed by MkDocs to preview the site. To validate the
complete documentation and catch broken navigation or warnings, run:

```powershell
.\.venv\Scripts\mkdocs.exe build --strict
```

Do not replace or recreate the virtual environment just to make a routine
documentation change. Install or update dependencies only when requested or
when a required tool is demonstrably missing.

## Guidance for future contributors and AI tools

Before making a change, inspect the relevant lesson files, `mkdocs.yml`, and
any related template or stylesheet. Follow existing patterns and preserve
unrelated work in the working tree. Make focused changes that satisfy the
request rather than rewriting the whole site.

- Keep internal lesson links in the current tab; the site opens external
  HTTP(S) links in a new tab.
- Do not modify the GitHub Pages deployment workflow or Python environment
  unless the task specifically requires it.
- Do not claim that a build, test, or external reference check passed unless
  it was actually run.
- Do not use browser automation or Playwright for visual checks unless
  explicitly requested.
- For version-sensitive technologies, prefer current official documentation
  and clearly identify behavior that depends on a version or deployment.
