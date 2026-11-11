# sunshreesuntec.com

Website for **Sunshree Suntec Co-operative Housing Society Ltd.**, NIBM Road, Kondhwa Khurd, Pune 411048.

- **Public pages:** Home, About, Maintenance dues (names + amounts for A/C/D Wing, Upper Ground Floor shops, Lower Basement shops), Notices, Committee, Contact.
- **Member access:** members register with mobile number + email → committee approves → member sees the detailed account for their own unit.
- **Hosting:** GitLab Pages (static). Login and approvals use Firebase (free Spark plan is enough).

```
public/
  index.html
  assets/css/style.css
  assets/js/app.js              public pages, dues tables, notices
  assets/js/member.js           register / login / admin approval / unit ledger
  assets/js/firebase-config.js  ← paste your Firebase web config here
  assets/img/seal.svg
  data/dues.json                ← unit-wise balances (edit to update the website)
  data/notices.json             ← notices
firestore.rules                 ← paste into Firebase console → Firestore → Rules
.gitlab-ci.yml                  GitLab Pages deploy
```

## 1. Run locally (Windows)

The site uses JavaScript modules, so open it through a small local server, not by double-clicking `index.html`:

```
cd public
python -m http.server 8000
```

Then open http://localhost:8000

## 2. Put it on GitLab Pages

1. Create a project on GitLab (e.g. `sunshreesuntec.com`) and push this folder:
   ```
   git init
   git remote add origin https://gitlab.com/<your-username>/sunshreesuntec.com.git
   git add .
   git commit -m "Society website"
   git branch -M main
   git push -u origin main
   ```
2. The `pages` pipeline runs automatically. When it finishes, the site is at the address shown in **Deploy → Pages**.
3. **Custom domain:** Deploy → Pages → *New domain* → `sunshreesuntec.com`. GitLab shows a TXT record for verification. At your DNS provider add:
   - `A` record `@` → `35.185.44.232`
   - `TXT` record shown by GitLab (`_gitlab-pages-verification-code.sunshreesuntec.com`)
   - optional `CNAME` `www` → `<your-username>.gitlab.io`
   Keep "Automatic certificate management using Let's Encrypt" switched on for HTTPS.
4. In **Deploy → Pages** untick "Use unique domain" if you want the plain `<username>.gitlab.io/<project>` address.

## 3. Switch on member login (Firebase)

1. https://console.firebase.google.com → **Add project** (Analytics not needed).
2. **Build → Authentication → Get started → Email/Password → Enable.**
3. **Authentication → Settings → Authorized domains:** add `sunshreesuntec.com`, `www.sunshreesuntec.com` and your `gitlab.io` Pages domain.
4. **Build → Firestore Database → Create database** (production mode, region `asia-south1` Mumbai).
5. **Firestore → Rules:** paste the contents of `firestore.rules` → **Publish**.
6. **Project settings → Your apps → Web (</>)** → register app → copy the `firebaseConfig` values into `public/assets/js/firebase-config.js`.
7. **Make yourself admin:**
   - Register on the website like a normal member (or create the user in Authentication).
   - Copy your **User UID** from Authentication → Users.
   - Firestore → **Start collection** `admins` → Document ID = that UID → add any field (e.g. `role` = `Treasurer`).
   - Sign out and in again; the **Admin** tab appears.

### How approval works

| Step | Who | What happens |
|---|---|---|
| Register | Member | Gives name, unit, mobile (10 digits) and email. A request is saved as `pending` and a verification link is emailed. |
| Approve | Committee (Admin tab) | Approves or rejects. The Admin tab warns if another member is already approved for the same unit. |
| View | Member | After approval **and** email confirmation, "My account" shows the unit's balance and every entry the committee has added. |

Members can only ever read their own unit. Only admins can approve, reject, or add/delete account entries. This is enforced by `firestore.rules`, not just by the page.

## 4. Updating the figures

Edit `public/data/dues.json`, commit and push. Each unit:

```json
{ "id": "C-402", "unit": "C 402", "block": "C", "name": "Mr Chanchal Sakarde",
  "type": "Residential Flat", "owner": 1731, "bpm": null }
```

- `owner` – member outstanding in ₹. Negative = credit balance (shown as "Cr"). `null` = not listed in statement.
- `bpm` – builder pending maintenance in ₹, or `null`.
- `"verify": true` – shows an "Under verification" tag next to the name.
- Change `periodTo` and `lastUpdated` at the top when you load a new statement.

Detailed entries per unit (receipts, bills) are added from the **Admin → Unit account entries** section and stay private to that unit's approved member.
