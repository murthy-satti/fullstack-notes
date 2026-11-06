# Client-Side Rendering in Next.js

Client-side rendering (CSR) means browser JavaScript creates or updates part
of the interface after the document is delivered. In Next.js, Client
Components enable browser interactions, but the framework may also produce
initial HTML for them depending on the rendering mode.

## Typical lifecycle

1. The browser requests a route.
2. The server or platform returns HTML and JavaScript resources.
3. The browser loads and executes JavaScript.
4. React attaches behavior and updates interactive parts as data or user
   input changes.

The exact sequence depends on the route and framework configuration.
Client-side rendering is often useful for highly interactive controls,
browser-only APIs, or data that changes frequently after page load.

## Practical example

```tsx
"use client";

import { useState } from "react";

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>Count: {count}</button>;
}
```

The `"use client"` directive marks a Client Component boundary; it does not
mean that the component can never contribute to initial server-generated
HTML. Browser-only APIs should be used in effects or event handlers, not
during server rendering.

## Trade-offs

CSR supports rich interaction but can add JavaScript work, delay useful
content when data is fetched only after startup, and require careful loading
and error states. It does not automatically make content invisible to
search engines; indexing depends on the actual output and crawler behavior.

## Developer perspective and misconceptions

Use the smallest practical client boundary. Do not move an entire route to
the browser just to implement one interactive widget. Keep secrets and
privileged data operations on trusted server code.

## Further learning

- [Next.js: Client Components](https://nextjs.org/docs/app/building-your-application/rendering/client-components)
- [Next.js: Server and Client Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components)
