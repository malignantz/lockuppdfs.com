# StopPDFs campaign: resume notes (2026-11-15)

Status: **idea agreed in outline, nothing built.** This file is the starting point for a fresh
session. Decisions that are still Garrett's are listed under "Open decisions". Nothing is
committed yet, so no Notion Tasks exist for it; create them once he decides to go ahead.

## The idea in one paragraph

Many PDF sites let you do the work and then ask for money at the download. This app is free and
runs on the visitor's device. Put the same app on a second, memorable domain (working name
**StopPDFs.com**) whose pitch is: "Other PDF sites charge you at the download. This one is free.
If you were about to pay them, give it to child protection instead." The name leans on "PDF"
being online shorthand for "pedophile" ("PDF file"), so "stop PDFs" reads two ways. The point of
the pun is that people **remember the name** at the moment they need a PDF tool. It does not
need to be funny.

## How the conversation got here

1. First thought: an absurdist campaign (lockuppdfs.com, "release the files") played deadpan,
   where each slogan is a literally true feature claim.
2. Garrett's second thought: StopPDFs.com, free product, encourage donations to an anti-abuse
   charity; hoped-for side effect is attention for his web/tech business.
3. Garrett's correction: memorable matters more than funny. The real problem is finding an
   honest tool among trap sites, and the aim is to divert some of that money to charity.

## What was settled

- **Pitch:** free tool versus pay-at-download traps; "give what you would have paid to child
  protection".
- **Where the ask goes:** one line and one link on the screen shown right after a successful
  download (the moment trap sites show a paywall). Possibly a short version of the pitch on the
  start page of the campaign domain.
- **Same app, second domain.** StopPDFs.com serves the same build with the pitch and the ask
  switched on. pdf.garrettholmes.com stays plain for Garrett's colleagues.
- **Charity:** not Our Rescue (the renamed Operation Underground Railroad; founder left in 2023
  amid misconduct allegations and its methods have been criticised; this was from memory, so
  check the current state). Candidates: NCMEC, Thorn, Stop It Now, Darkness to Light, RAINN.
  Recommendation: NCMEC or Thorn.

## Rules for the build

- The download is never held back or delayed. The ask appears only after the file is saved.
- The link goes straight to the charity's own donate page. We never collect or pass on money,
  and the page says so. (Collecting for a charity brings fundraising law with it.)
- No logos, and no "in partnership with" or "in support of" wording, unless the charity agrees
  in writing. Some may not want the association.
- One quiet ask: no pop-up, no countdown, no guilt wording, no repeat nagging. Easy to dismiss.
- Any price quoted for other sites ("about $10") must be checked against what named sites
  really charge on the day, and kept general (no naming competitors in the app).
- The pun is only ever about documents. No mention of children, victims or real people's names
  in jokes or slogans. The sincere line about the cause is separate and plain.
- The repo rule on third-party network calls still holds: the ask is a plain link the visitor
  chooses to follow. No embedded donation widgets, trackers or charity scripts.
- Keep Garrett's name off the campaign domain at first; the tool can link back quietly.

## Build outline (for the fresh session)

- Add the second custom domain to the same Cloudflare Worker (wrangler; domain must be bought
  and on Cloudflare first).
- A host-based switch in the app (campaign domain versus plain domain) that turns on: the pitch
  on the start page, the post-download ask, and campaign title and description. One build, no fork.
- The ask component on the export result screen; wording and charity link from one small
  config module.
- Privacy page and README: say what the link is and that no money or data passes through us.
- Tests: the ask shows only on the campaign host, only after a successful export, never blocks
  the download, and makes no network request by itself; the plain host is unchanged.
- Check the offline cache and the security headers treat both hosts the same.

## Spreading it (ideas, not commitments)

- Small office-humour or tech-comedy creators (roughly 10k to 200k followers) over famous ones.
- Garrett's own two or three clips first, so creators have something to stitch.
- Paid posts must be labelled as ads (FTC).
- Platform moderation flags the word, so keep the pun in the visuals and the domain.
- A memorable name helps word of mouth and type-in visits. It does not by itself beat the trap
  sites in search; that is a separate, slower job.
- Leftover deadpan lines, usable as stickers or clips: "Lock up PDFs." (password), "Release the
  files." (unlock/export), "Redacted means redacted." (real redaction), "No PDF leaves this
  device." (local), "Every PDF is checked before release." (verified export).

## Open decisions (Garrett)

- The domain: StopPDFs.com, or LockUpPDFs.com (better literal fit: the password feature), or
  both with one redirecting. Availability has not been checked.
- Which charity, and whether to ask its permission to be named.
- Whether Garrett gives first and shows it ("we gave $X").
- Whether his name or business appears on the campaign domain, and when.

## Risks noted

- Some people, and some of Garrett's clients, will find the pun tasteless.
- If the giving looks like a marketing prop, that becomes the story.
- A charity may object to being named.
- Ad platforms are likely to reject paid ads built on the pun.
