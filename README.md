# Maragatham Clinic Patient Assistant

This repo contains a small Express backend (`server.js`) and a static frontend (`public/`) for the Maragatham Hospital patient assistant widget.

Quick local run

```bash
npm install
npm start
# then open http://localhost:3000
```

Publish to GitHub

1. Create a new GitHub repository (either on github.com or with `gh repo create`).
2. Run the commands below from the project root to push your code:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
# replace URL with your repository URL
git remote add origin https://github.com/<your-username>/<repo>.git
git push -u origin main
```

Deploying (options)

- GitHub + Render/Vercel/Netlify: Connect your GitHub repo to your preferred host and configure the build command `npm install && npm run build` (if using a build step) and start command `npm start`. Render and Heroku will respect `process.env.PORT`.
- GitHub Pages: Only for static sites; this repo includes a Node backend so GitHub Pages alone is not sufficient.

If you want I can help create the remote repository (using `gh`) and push these changes for you — tell me whether you have the `gh` CLI installed and are authenticated, or paste your GitHub repo URL to use.