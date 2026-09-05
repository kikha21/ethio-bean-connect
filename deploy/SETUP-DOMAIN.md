# Putting Ethio Bean Connect on your own domain

Three things happen here. You buy the name, Cloudflare is told this
machine may answer for it, and the tunnel is registered once so the
address stops changing.

## What you do

1. Go to **dash.cloudflare.com** and create a free account with your email.

2. In the left menu choose **Domain Registration -> Register Domain**.
   Search for **ethiobeanconnect** and take the **.com**.

   Buy it at Cloudflare rather than anywhere else. Cloudflare sells at
   cost, around $10.44 for the year, with no renewal markup and none of
   the add-ons other registrars push. It also means the domain is already
   on Cloudflare, which removes a whole nameserver step.

   You will need a card. That part is yours - I cannot enter payment
   details for you.

3. Tell me it is done.

## What I do after that

    cloudflared tunnel login          # opens your browser, you click Authorize
    cloudflared tunnel create ethio-bean
    cloudflared tunnel route dns ethio-bean ethiobeanconnect.com
    cloudflared tunnel route dns ethio-bean www.ethiobeanconnect.com

Then I fill the tunnel id and credentials path into
`deploy/tunnel-config.yml` and start it against that file instead of
`--url`. From then on the address is **https://ethiobeanconnect.com** and
it stays that way through every restart.

## What this does not fix

The site still lives on this laptop. If the machine sleeps or the
internet drops, the address stays valid but nothing answers on it. That
is a different problem, and the fix for it is moving the platform to a
host - worth doing once testing is finished.

## Keeping it alive meanwhile

- leave the laptop plugged in and stop it sleeping
- `start.cmd` brings up both the server and the tunnel after a reboot
