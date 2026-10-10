# Mom chat

The **Chat** tab ([chat.html](../chat.html)) lets parents start a topic and reply to each other. New replies show up live, without reloading the page.

- Only members can read and write. Visitors see a "Log in to join the chat" button.
- On their first visit, people choose a chat name (first name or nickname). It's saved as the **Name** on *My account*, and changing it there renames their old posts too.
- People can delete their own messages and topics. There's no editing.
- Anyone can tap **Report** on someone else's message.
- Limits, enforced by the database: 10 messages a minute and 5 new topics an hour per person, and 2,000 characters per message.
- Deleting an account deletes that person's messages. Their topics stay, so other people's replies aren't lost.

## One-time setup (Supabase → SQL Editor)

Paste all of [`supabase/003_chat.sql`](../supabase/003_chat.sql) and click **Run**. Until then, the chat page says "The chat is opening soon."

The file makes `yuliia.designer.ux@gmail.com` a chat admin, but only if that account already exists. If she logs in to the site for the first time later, run the file again (it's safe to run again).

## Moderation (Yuliia)

- **Reports:** Supabase → **Table Editor → chat_reports**. Each row is one report: `message_id` is the reported message, which is in **chat_messages**.
- **Remove a message:** in the chat, admins see **Delete** on every message and **Delete topic** on every topic. You can also delete the row in **chat_messages** in the Table Editor.
- **Another admin:** run this in the SQL Editor:

  ```sql
  insert into public.chat_admins (user_id)
    select id from auth.users where email = 'name@example.com';
  ```

- **Block someone:** Supabase → **Authentication → Users**, open the person, then **Ban user**.

## Notes

- Messages are stored in Supabase in the EU (Frankfurt), like the accounts. Mention the chat on the privacy page (Datenschutzerklärung).
- Under the EU Digital Services Act, a community needs a way to report illegal content and should act on reports quickly. The Report button and the steps above cover that for a small community.
