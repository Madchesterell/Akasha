Akasha
Modern workspace & task management for teams.
Stack
Vanilla HTML / CSS / JavaScript
Firebase Auth + Firestore
Files
`index.html` — structure
`style.css` — design system (Orange + Stone, light/dark)
`script.js` — app logic + Firebase
Deploy to GitHub Pages
Create a new repository on GitHub (e.g. `akasha`).
Upload these three files to the root of the repo (or push via git).
Go to Settings → Pages.
Source: Deploy from a branch → `main` → `/ (root)`.
Save. Your app will be live at `https://<username>.github.io/akasha/`.
Optional (git)
```bash
git init
git add index.html style.css script.js README.md
git commit -m "Initial Akasha release"
git branch -M main
git remote add origin https://github.com/<username>/akasha.git
git push -u origin main
```
Firebase
The app uses the Firebase config already inside `script.js`.  
If you create your own Firebase project, replace the `firebaseConfig` object in `script.js` and enable:
Authentication (Email/Password + Google)
Firestore Database
Local preview
Open `index.html` with a local server (required for ES modules):
```bash
npx serve .
# or
python3 -m http.server 5500
```
Then open `http://localhost:5500`.
