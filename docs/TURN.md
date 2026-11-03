# Turning on a TURN relay

Phones in a room talk to each other directly over WebRTC. Public STUN servers help
them find a direct path, and that works on most home WiFi. It fails when there is no
direct path:

- a phone on mobile data (carrier NAT);
- a guest WiFi or mesh router that keeps devices apart ("AP/client isolation");
- some office and school networks.

A **TURN relay** is the fallback: when a direct path can't be found, that phone's
traffic goes through the relay instead. A room's traffic is tiny (a ghost-heavy time
trial is about 9 KB/s per phone), so a free tier covers game nights.

## Steps

1. Sign up with a TURN provider that has a free tier, for example
   [Metered](https://www.metered.ca/stun-turn) ("Open Relay" / free plan) or Cloudflare
   Realtime TURN. Create a credential.
2. Copy its server list: `urls`, `username` and `credential`, usually two or three
   entries (UDP, TCP and TLS on 443).
3. Paste them into `TURN_SERVERS` in `src/AppHost.js`:

   ```js
   export const TURN_SERVERS = [
       { urls: 'turn:global.relay.example.com:80', username: 'USER', credential: 'PASS' },
       { urls: 'turns:global.relay.example.com:443?transport=tcp', username: 'USER', credential: 'PASS' },
   ];
   ```

4. Ship it as usual (one PR, merge, check the Pages build).

`src/claw-core/net/NetTransport.js` already passes these to every room, after Google's and
Twilio's public STUN. `qa/hosttools.js` checks that a pasted server reaches the room's
WebRTC config.

## The catch

The browser has to have the credentials, so **anyone who opens the site can read them**.
That's normal for a static site, but:

- use a free tier, or a plan with a hard monthly cap;
- prefer a credential you can rotate, and rotate it if usage looks wrong;
- never use a key tied to a card with no spending cap.

To check it works, use test-sheet line 12 in `ONLINE_AUDIT.md`: one phone on mobile
data joins a room on WiFi.
