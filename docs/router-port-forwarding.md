# Router Port Forwarding — Dashboard External Access

Goal: let `nyttlandmc.net.ar` reach the dashboard from outside your LAN.

## Prerequisites

- WSL2 networking mode set to `nat` (done — see `.wslconfig`), Docker Desktop restarted.
- Confirm `curl http://192.168.0.141` works from Windows itself before touching the router. If that fails, fix it first — port forwarding won't help.

## 1. Find your Windows host's LAN IP

```
ipconfig
```
Look for the adapter in use (the one `Get-NetConnectionProfile` showed as `Ethernet 2`), note its IPv4 address. This is the forwarding target — call it `<LAN-IP>` below.

## 2. Reserve that IP (avoid DHCP reassigning it)

In the router admin UI (usually `192.168.0.1` or `192.168.1.1`, login on a sticker on the router):
- Find **DHCP Reservation** / **Address Reservation** / **Static Lease** section.
- Reserve `<LAN-IP>` to your Windows machine's MAC address (`ipconfig /all` shows it as "Physical Address").

Skipping this means the IP can change later and silently break forwarding.

## 3. Create port forward rules

In the router admin UI, find **Port Forwarding** / **Virtual Server** / **NAT Forwarding**:

| Name          | External Port | Internal Port | Internal IP | Protocol |
|---------------|---------------|----------------|-------------|----------|
| dashboard-http  | 80            | 80             | `<LAN-IP>`  | TCP      |
| dashboard-https | 443           | 443            | `<LAN-IP>`  | TCP      |

Save/apply — most routers need a reboot or a few seconds to take effect.

## 4. Confirm your WAN IP

From Windows or WSL:
```
curl.exe ifconfig.me
```
This is the public IP your ISP assigned. `nyttlandmc.net.ar`'s DNS **A record** must point here.

⚠️ If your ISP doesn't give a static IP (most residential plans don't), this address can change on modem reboot/reconnect. Options:
- Use a Dynamic DNS service (e.g. router's built-in DDNS client, or duckdns.org / no-ip.com) and point the domain's A record to the DDNS hostname via CNAME, or update the A record manually when it changes.
- Check your router's WAN status page — many show whether the IP is static or dynamic.

## 5. Test from outside your LAN

Use a phone on mobile data (WiFi off) or ask a friend:
```
curl http://nyttlandmc.net.ar
```
If DNS has propagated and forwarding is correct, this returns the dashboard's HTTP response (not a timeout).

## Troubleshooting

- **Times out externally, works internally**: port forward rule wrong, ISP blocking port 80/443 (some residential ISPs do), or double-NAT (router itself behind another modem/router — check if router's WAN IP is itself private `192.168.x.x`/`10.x.x.x`; if so the forward needs to happen one layer up too).
- **Works via IP, not domain**: DNS A record not propagated yet, or pointing at wrong IP.
- **Windows Firewall**: confirm inbound rules for TCP 80/443 exist and are enabled (see earlier `netsh advfirewall firewall add rule` commands) — router forwarding won't matter if Windows itself drops the packet.
