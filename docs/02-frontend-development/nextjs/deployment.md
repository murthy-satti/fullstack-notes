# Next.js Deployment and Production

Deployment makes a built application available to users. Next.js can be
deployed to supported managed platforms or to infrastructure that runs its
server features, depending on the project configuration.

## Build and run locally

```bash
npm run build
npm run start
```

The build command checks and prepares production output. The start command
runs the production server for projects configured with the standard scripts.
Always inspect the scripts in `package.json`; starter options and deployment
targets may differ.

## Production checklist

- Set environment variables in the deployment platform; do not commit
  secrets.
- Confirm the selected host supports the features used by the app, including
  any server runtime or image optimization requirements.
- Test production builds, route behavior, forms, and error states.
- Configure domains and HTTPS at the hosting layer.
- Review logs and monitoring after release.
- Confirm caching does not mix data across users.

Static export can be appropriate for a site that can run entirely as static
files, but it does not support every server feature. Choose it only after
checking the current export limitations.

## Developer perspective and terminology

**Build artifact** is output prepared for deployment. **Environment variable**
is configuration provided outside source code. **Runtime** is the
environment that executes application code after deployment. Keep local,
preview, and production settings distinct.

## Common misconceptions

- A successful development server does not prove a production build will
  succeed.
- Hosting choices can limit or change supported framework features.
- Public environment variables are not secrets; client-exposed values can be
  read by users.

## Check your understanding

1. Why should production builds be tested before release?
2. What should be checked when choosing a deployment platform?
3. Which environment variables must never be exposed to browser code?

## Further learning

- [Next.js: Deploying](https://nextjs.org/docs/app/getting-started/deploying)
- [Next.js: Environment variables](https://nextjs.org/docs/app/guides/environment-variables)
