# Next.js Forms and Server Actions

Forms submit user input to the application. In the App Router, Server Actions
can run server-side functions in response to supported form submissions,
reducing the need to manually build a client request for some workflows.

## The important security rule

Treat every submitted value as untrusted. A Server Action is reachable
through an application request and must validate input, verify the current
user, and authorize the requested operation. Hiding a button in the UI does
not protect the operation.

## A simple form pattern

```tsx
async function createNote(formData: FormData) {
  "use server";
  const title = formData.get("title");
  if (typeof title !== "string" || title.trim().length === 0) {
    throw new Error("A title is required");
  }
  // Authenticate, authorize, then persist validated data.
}

export default function NewNotePage() {
  return (
    <form action={createNote}>
      <label htmlFor="title">Title</label>
      <input id="title" name="title" required />
      <button type="submit">Create note</button>
    </form>
  );
}
```

This example shows the shape only. Real applications should return
user-friendly validation state, avoid exposing internal exceptions, and
follow the framework version's action conventions.

## Developer perspective

Use native form semantics, validate on the server, and provide pending,
success, and error feedback. **FormData** represents submitted key/value
fields; **Server Action** is a server-executed function invoked through
framework handling; **authorization** checks whether the authenticated user
may perform the requested action.

## Common misconceptions

- Server Actions are not automatically authorized.
- Browser validation is useful feedback, not trusted enforcement.
- A hidden form field is user-controlled input.

## Check your understanding

1. Why must a Server Action validate and authorize independently?
2. Can a hidden field be trusted?
3. What feedback should a form provide during submission?

## Further learning

- [Next.js: Updating data](https://nextjs.org/docs/app/getting-started/updating-data)
- [Next.js: Forms](https://nextjs.org/docs/app/guides/forms)
