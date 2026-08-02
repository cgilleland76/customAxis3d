# Pushing to GitHub

Everything is committed and the remote is already set to
`https://github.com/cgilleland76/customAxis3d.git` on branch `main`.
You only need to run the push — I can't hold your GitHub credentials.

## 1. Move the folder somewhere permanent

Right now this lives in Claude's session output folder. Copy it somewhere you
control before you start working in it. In PowerShell:

```powershell
Copy-Item -Recurse -Force `
  "$env:APPDATA\Claude\local-agent-mode-sessions\55bbaa4d-e67d-4655-91e8-d6715359a830\55aff87e-6192-4658-9248-30cff09a8459\local_8dede3da-cb87-4071-9ec4-465665c512a1\outputs\print-shop-site" `
  "$env:USERPROFILE\Documents\customAxis3d"

cd "$env:USERPROFILE\Documents\customAxis3d"
```

The `.git` folder comes with it, so the commits and the remote survive the copy.

## 2. Push

```powershell
git push -u origin main
```

A browser window or a credential prompt will appear the first time. Git for
Windows ships with Credential Manager, so signing in through the browser is
usually all it takes.

If it asks for a **password** in the terminal, GitHub no longer accepts your
account password. Either:

- install the GitHub CLI and run `gh auth login`, or
- create a personal access token at
  <https://github.com/settings/tokens> (classic, scope `repo`) and paste the
  token where it asks for a password.

## 3. Connect Netlify to the repo

You currently have a drag-and-drop site. Point it at GitHub instead so pushes
deploy themselves:

Netlify → your site → **Site configuration → Build & deploy → Link repository**
→ GitHub → `cgilleland76/customAxis3d`, then:

| Setting | Value |
|---|---|
| Branch to deploy | `main` |
| Build command | *(leave empty)* |
| Publish directory | `.` |

You can also start fresh with **Add new site → Import an existing project**,
but then rename the new site to `customaxis3d` and delete the old one, or the
URL changes.

## 4. From then on

```powershell
git add -A
git commit -m "what changed"
git push
```

Netlify rebuilds within a minute or so.

## Note on this being a public repo

The repo is public, which means `assets/js/config.js` — including your Supabase
**anon** key — is readable by anyone. That is fine and adds no exposure: the
same file is already served to every visitor of the website. The key grants
only what the row level security policies allow, which is "submit a request"
and "read the public catalog and price bands".

Your filament cost, markup and hourly rate are **not** in the repo at all.
They live in the `settings` table with `is_public = false`.

What must never be committed is the Supabase `service_role` key — it bypasses
row level security completely. It is not in this repo. Don't paste it in.

If you'd still rather the anon key weren't in public git history, make the repo
private in Settings → General → Danger Zone → Change visibility. Netlify can
still deploy from a private repo.
