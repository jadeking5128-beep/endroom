# Altbrain private setup

Altbrain uses a password-only owner session and a separate encrypted local vault.

## 1. Set the main password

Run this in a local terminal from the repository root:

```bash
node scripts/hash-altbrain-password.mjs
```

Enter the password when prompted. The script does not echo the password. It prints a salted scrypt hash.

In **Vercel → altbrain → Settings → Environment Variables**, add:

- Name: `ALTBRAIN_PASSWORD_HASH`
- Value: the complete `scrypt$...` string printed by the script
- Type: Sensitive
- Environments: Production, Preview, Development

Do not put the raw password in Vercel, GitHub, source code, or chat.

**Existing vault note:** if this browser already contains an encrypted Altbrain vault, generate the hash using the same password that currently unlocks that vault. The local AES-GCM data cannot be decrypted with a different password.

The `ALTBRAIN_SESSION_SECRET` signing secret is already configured as a sensitive Vercel environment variable. Do not replace it casually; changing it invalidates active sessions.

## 2. Configure Groq

Create an API key in the [Groq Console](https://console.groq.com/keys), then add it in Vercel as:

- Name: `GROQ_API_KEY`
- Value: your Groq API key
- Type: Sensitive
- Environments: Production, Preview, Development

Never add the key to a `NEXT_PUBLIC_*` variable, source code, GitHub, or chat. The server reads it privately.

After adding both variables, redeploy the project.

## 3. What Groq receives

- Paragraph structuring: the paragraph you submit and a limited set of existing memory context for connection suggestions.
- Semantic recall: your search query and stored memory text supplied for retrieval.

Groq is instructed to return only exact excerpts from existing memory text during recall. The server rejects excerpts that are not exact substrings of the supplied memories. Recall does not create or edit memories.

## 4. Memory integrity

- A submitted paragraph is stored as one parent node with its original text unchanged.
- Detail nodes contain exact source excerpts, not AI paraphrases.
- Suggested links are labelled as AI suggestions, not verified facts.
- Recall highlighting is temporary UI state and is never written into the encrypted vault.
- The vault is currently encrypted and stored in this browser only. Supabase cloud sync has not been enabled; do not assume memories are synced across devices yet.
